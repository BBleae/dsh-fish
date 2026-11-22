// @ts-check
/**
 * observe-home.js —— 观测台屋子、叫醒、桥接投递、信箱、头像、静态图、交接导入与重置/换房路由
 *
 * 路由：
 *   /wake · /say · /whoami · /inbox · /home · /paths · /notify · /avatar · /media
 *   /import · /reset · /home/rebuild · /home/rotate
 */

import fs from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readEvents, paths } from './store.js'
import { loadConfig, updateConfig, dateKey } from './settings.js'
import { selfPronounOf, fillSelf } from './selfpronoun.js'
import { deriveSelf } from './derive.js'
import { wakeNow } from './scheduler.js'
import { sayToHer } from './say.js'
import { readInbox, markRead, writeInboxFile } from './inbox.js'
import { avatarFile, avatarInfo, saveAvatar, removeAvatar } from './avatar.js'
import { describeState, resetAll } from './reset.js'
import { applyHandover, hasOwnStart, IMPORT_TEMPLATE } from './import.js'
import { bridgeUrl } from './bridgeserve.js'
import { readHomeRecord, retireHomeSessions } from './retire.js'
import { bootstrapHome, homeStatus, wakeIfBlank, rotateTalkSession } from './home.js'
import { selfDocStatus, refreshSelfDoc } from './selfdoc.js'
import { ensureDataReadme } from './readme.js'
import { readPending, markShown } from './notify.js'
import { decodeBase64Image, saveImage } from './media.js'
import { PREFIX, send, sentTooLarge, readBody } from './observe-http.js'

/**
 * 宿主内 `/dsh-fish/say`、`/dsh-fish/whoami` 与回环投递口 `bridgeserve.js` 共用的两个 handler。
 *
 * @param {import('./types.js').ObserveEnv} env
 */
export function createBridgeHandlers(env) {
  const { ctx, root, deps, flog } = env

  /**
   * @param {import('./types.js').HttpRequest} req
   * @param {import('./types.js').HttpResponse} res
   */
  const sayHandler = async (req, res) => {
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
    const raw = await readBody(req, 12_000_000)
    /** @type {Record<string, any>} */
    let body = {}
    try { body = JSON.parse(raw || '{}') } catch { return send(res, 400, { error: 'body 不是 JSON' }) }
    const text = String(body.text ?? '').trim()

    let imagePath = ''
    if (body.image) {
      const dec = decodeBase64Image(body.image)
      if (!dec.ok || !dec.buf) return send(res, 400, { error: dec.why })
      const saved = await saveImage(root, dec.buf, { prefix: 'him' })
      if (!saved.ok || !saved.path) return send(res, 400, { error: saved.why })
      imagePath = saved.path
    }

    if (!text && !imagePath) return send(res, 400, { error: 'text 不能为空' })
    const r = await sayToHer(ctx, text, {
      root,
      imagePath,
      scene: body.scene,
      channel: body.channel,
      speaker: body.speaker,
      room: body.room,
      title: body.title,
      guest: body.guest,
      owner: body.owner,
      log: flog('info'),
    })
    send(res, 200, r)
  }

  /**
   * @param {import('./types.js').HttpRequest} req
   * @param {import('./types.js').HttpResponse} res
   */
  const whoamiHandler = async (req, res) => {
    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
    const h = await homeStatus(root)
    const tenant = deps.tenancy?.tenant ?? { ok: true }
    send(res, 200, {
      ok: true,
      plugin: 'dsh-fish',
      version: deps.version ?? '',
      root,
      home: Boolean(h.sessionId),
      sessionId: h.sessionId ?? '',
      writable: tenant.ok !== false,
      bridge: bridgeUrl(),
    })
  }

  return { sayHandler, whoamiHandler }
}

/**
 * @param {import('./types.js').ObserveEnv} env
 * @param {{ sayHandler: import('./types.js').ObserveHandler, whoamiHandler: import('./types.js').ObserveHandler }} bridgeHandlers
 * @returns {import('./types.js').ObserveRouteEntry[]}
 */
export function buildHomeRoutes(env, bridgeHandlers) {
  const { ctx, root, flog, inflight, awayFromBeat, reclaimTenant } = env
  const { sayHandler, whoamiHandler } = bridgeHandlers

  return [
    ['/wake', async (req, res) => {
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      let focus = ''
      try { focus = new URL(String(req.url ?? '/'), 'http://localhost').searchParams.get('focus') ?? '' } catch { /* 解析失败就当没传 */ }
      const r = /** @type {any} */ (await wakeNow(ctx, { root, focus, log: flog('info') }))
      send(res, r.ok ? 200 : 409, r.ok ? r : { ...r, error: r.why || '这次没叫醒' })
    }],

    ['/say', sayHandler],
    ['/whoami', whoamiHandler],

    ['/inbox', async (req, res) => {
      if (req.method === 'POST') {
        const r = await markRead(root)
        await writeInboxFile(root).catch(() => null)
        return send(res, 200, r)
      }
      const url = new URL(req.url ?? '/', 'http://x')
      const limit = Math.min(500, Number(url.searchParams.get('limit') ?? 200) || 200)
      const box = await readInbox(root, { limit })
      await writeInboxFile(root, { limit: 60 }).catch(() => null)
      send(res, 200, box)
    }],

    ['/home', async (_req, res) => {
      const h = await homeStatus(root)
      const d = await selfDocStatus(root)
      let wsTitle = ''
      try {
        const reg = ctx.get?.('workspaceRegistry')
        wsTitle = String(reg?.get?.(h.wsId)?.title ?? '')
      } catch { wsTitle = '' }
      send(res, 200, {
        workspace: { id: h.wsId, ok: Boolean(h.wsId), title: wsTitle },
        session: { id: h.sessionId, ok: Boolean(h.sessionId) },
        dir: h.dir,
        createdAt: h.createdAt,
        selfDoc: { exists: d.exists, bytes: d.bytes, mtime: d.mtime },
      })
    }],

    ['/paths', async (req, res) => {
      const p = paths(root)
      await ensureDataReadme(root)
      send(res, 200, {
        root: p.root,
        events: p.events,
        out: p.outDir,
        diary: p.diaryDir,
        home: p.herDir,
        inbox: join(p.root, 'inbox.md'),
        log: join(p.root, 'logs', 'dsh-fish.log'),
      })
    }],

    ['/notify', async (req, res) => {
      const { config } = await loadConfig(root)
      if (req.method === 'POST') {
        const raw = await readBody(req)
        /** @type {Record<string, any>} */
        let body = {}
        try { body = JSON.parse(raw || '{}') } catch { return send(res, 400, { error: 'body 不是 JSON' }) }
        if (body.shown === true) {
          const r = await markShown(root, dateKey())
          return send(res, 200, { ok: r.ok, lastShown: r.lastShown, today: dateKey() })
        }
        if (typeof body.enabled !== 'boolean') return send(res, 400, { error: 'enabled 必须是 true/false，或 shown:true' })
        const next = await updateConfig({ notify: { enabled: body.enabled } }, root)
        return send(res, 200, {
          enabled: next.notify?.enabled === true,
          lastShown: next.notify?.lastShown ?? '',
          today: dateKey(),
        })
      }
      const p = await readPending(root, { today: dateKey() })
      send(res, 200, { ...p, enabled: config.notify?.enabled === true })
    }],

    ['/avatar', async (req, res) => {
      const url = String(req.url ?? '')
      if (url.startsWith(PREFIX + '/avatar/info')) { send(res, 200, avatarInfo(root)); return }
      if (req.method === 'POST') {
        /** @type {Record<string, any>} */
        let body = {}
        try {
          const raw = await readBody(req, 4_000_000)
          body = raw ? JSON.parse(raw) : {}
        } catch (err) {
          if (sentTooLarge(res, err)) return
          body = {}
        }
        const r = /** @type {any} */ (body && body.remove ? removeAvatar(root) : saveAvatar(root, body))
        if (!r || r.ok === false) { send(res, 400, { error: (r && r.why) || '没存上' }); return }
        send(res, 200, { ok: true, removed: Boolean(r.removed), ...avatarInfo(root) })
        return
      }
      const file = avatarFile(root)
      if (!file) { send(res, 404, { error: 'no avatar' }); return }
      try {
        const buf = fs.readFileSync(file)
        const ext = (file.split('.').pop() || '').toLowerCase()
        const ct = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
        res.writeHead(200, { 'content-type': ct, 'content-length': buf.length, 'cache-control': 'no-store' })
        res.end(buf)
      } catch { send(res, 404, { error: 'no avatar' }) }
    }],

    ['/media', async (req, res) => {
      const m = String(req.url ?? '').match(/^\/dsh-fish\/media\/((?:principle-[a-z]+\.svg)|(?:feedback-qr\.jpg))(?:\?[^#]*)?$/)
      if (!m) { send(res, 404, { error: 'no file' }); return }
      try {
        const file = fileURLToPath(new URL(`../media/${m[1]}`, import.meta.url))
        const buf = fs.readFileSync(file)
        const isJpg = m[1].endsWith('.jpg')
        res.writeHead(200, {
          'content-type': isJpg ? 'image/jpeg' : 'image/svg+xml; charset=utf-8',
          'content-length': buf.length,
          'cache-control': 'private, max-age=3600',
        })
        res.end(buf)
      } catch { send(res, 404, { error: 'no file' }) }
    }],

    ['/import', async (req, res) => {
      if (req.method === 'GET') {
        const { events } = await readEvents(root).catch(() => ({ events: [] }))
        const blocked = hasOwnStart(events)
        const { config } = await loadConfig(root).catch(() => ({ config: null }))
        const model = deriveSelf(events, { growthDays: config?.growthDays })
        return send(res, 200, {
          canImport: !blocked,
          reason: blocked ? '她已经有自己的起点了。想换成别人养的那一位，先重置成新的一局。' : '',
          persona: { imported: model?.persona?.imported === true, source: model?.persona?.source ?? '' },
          template: IMPORT_TEMPLATE,
        })
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      const raw = await readBody(req, 200_000)
      /** @type {Record<string, any>} */
      let b = {}
      try { b = JSON.parse(raw || '{}') } catch { return send(res, 400, { error: 'body 不是合法 JSON' }) }
      const r = /** @type {any} */ (await applyHandover(b.text, root, /** @type {any} */ ({
        log: flog('info'),
        source: b.source ? String(b.source) : '',
      })))
      if (!r.ok) return send(res, 409, { ok: false, error: r.why })
      await refreshSelfDoc(root).catch(() => {})
      const { events } = await readEvents(root).catch(() => ({ events: [] }))
      const cfgNow = await loadConfig(root).then((x) => x.config, () => undefined)
      const model = deriveSelf(events, cfgNow)
      send(res, 200, {
        ok: true,
        name: r.name,
        tools: r.tools,
        toolsAdded: r.toolsAdded ?? [],
        toolsError: r.toolsError ?? '',
        bodyChars: r.bodyChars,
        day: model.day,
        stage: model.stage,
        called: model.name,
        note: fillSelf('人设已经接过来。{S}是从第 1 天开始的，往后按你和她的事自己长。', selfPronounOf(cfgNow)),
      })
    }],

    ['/reset', async (req, res) => {
      if (req.method === 'GET') {
        const info = await describeState(root)
        return send(res, 200, { ...info, root })
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      const body = await readBody(req)
      /** @type {Record<string, any>} */
      let b = {}
      try { b = JSON.parse(body || '{}') } catch { return send(res, 400, { error: 'body 不是合法 JSON' }) }
      if (b.confirm !== 'reset') return send(res, 400, { error: '要带 confirm:"reset"' })
      const home = await readHomeRecord(root)
      const r = /** @type {any} */ (await awayFromBeat(() => resetAll(root)))
      if (!r.ok) return send(res, 409, { ok: false, error: r.why })
      try { await fs.promises.mkdir(root, { recursive: true }) } catch { /* ignore */ }
      await reclaimTenant()
      const retired = /** @type {any} */ (await retireHomeSessions(ctx, { root, home, log: flog('info') }))
      const { config: cfg } = await loadConfig(root)
      const fresh = /** @type {any} */ (await bootstrapHome(ctx, /** @type {any} */ ({
        root,
        preset: cfg?.tools?.preset ?? '',
        log: flog('info'),
        force: true,
      })))
      const woke = fresh.ok
        ? await wakeIfBlank(ctx, /** @type {any} */ ({ sessionId: fresh.sessionId, root, log: flog('info'), freshOnly: !fresh.reused, verify: true }))
        : { woke: false }
      send(res, 200, {
        ok: true,
        movedTo: r.movedTo,
        archived: retired.archived,
        retiredError: retired.ok ? '' : retired.why,
        fresh: fresh.ok ? { wsId: fresh.wsId, sessionId: fresh.sessionId, title: fresh.reused ? '' : '跟大肥鱼说话', woke: woke.woke === true } : null,
        freshError: fresh.ok ? '' : fresh.why,
        note: fresh.ok
          ? (retired.ok
            ? '旧的一切已经封存，旧会话移进「已归档」。新的一局已经开好；点一下「叫醒大肥鱼」，侧栏里才会出现那条会话。'
            : '状态库已封存，新的一局也开好了；只有旧会话没全收进「已归档」。点一下「叫醒大肥鱼」，侧栏里才会出现会话。')
          : '状态库已封存，但新会话没建出来（重启 DSH 会自动建）。',
      })
    }],

    ['/home/rebuild', async (req, res) => {
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      const body = await readBody(req)
      /** @type {Record<string, any>} */
      let b = {}
      try { b = JSON.parse(body || '{}') } catch { return send(res, 400, { error: 'body 不是合法 JSON' }) }
      if (b.confirm !== 'rebuild') return send(res, 400, { error: '要带 confirm:"rebuild"' })
      const { config: cfg } = await loadConfig(root)
      const fresh = /** @type {any} */ (await bootstrapHome(ctx, /** @type {any} */ ({
        root,
        preset: cfg?.tools?.preset ?? '',
        log: flog('info'),
        force: true,
      })))
      const woke = fresh.ok
        ? await wakeIfBlank(ctx, /** @type {any} */ ({ sessionId: fresh.sessionId, root, log: flog('info'), freshOnly: !fresh.reused, verify: true }))
        : { woke: false }
      send(res, fresh.ok ? 200 : 409, {
        ok: fresh.ok,
        sessionId: fresh.sessionId ?? '',
        wasArchived: fresh.wasArchived === true,
        woke: woke.woke === true,
        error: fresh.ok ? '' : fresh.why,
        note: fresh.ok
          ? '新的一局搭好了。点一下「叫醒大肥鱼」，侧栏里才会出现这条会话。'
          : fresh.why,
      })
    }],

    ['/home/rotate', async (req, res) => {
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      const body = await readBody(req)
      /** @type {Record<string, any>} */
      let b = {}
      try { b = JSON.parse(body || '{}') } catch { return send(res, 400, { error: 'body 不是合法 JSON' }) }
      if (b.confirm !== 'rotate') return send(res, 400, { error: '要带 confirm:"rotate"' })
      const h = await homeStatus(root)
      const current = String(h.sessionId ?? '')
      const busyAt = inflight.get(String(b.from ?? current))
      if (busyAt && Date.now() - busyAt < 15 * 60_000) {
        return send(res, 409, { ok: false, busy: true, error: '她这轮还没说完，等这句话出来再换。' })
      }
      const out = /** @type {any} */ (await rotateTalkSession(ctx, {
        root,
        from: current,
        log: flog('info'),
      }))
      if (!out.ok) return send(res, 409, { ok: false, error: out.why || '没换成。' })
      const woke = await wakeIfBlank(ctx, /** @type {any} */ ({
        sessionId: out.sessionId,
        root,
        log: flog('info'),
        freshOnly: true,
        verify: true,
      })).catch(() => ({ woke: false }))
      send(res, 200, {
        ok: true,
        sessionId: out.sessionId ?? '',
        old: out.old ?? '',
        skipped: out.skipped === true,
        woke: woke?.woke === true,
        note: woke?.woke === true
          ? '新的一间开好了，也叫了她一声——侧栏里等她说出第一句就会出现。'
          : '新的一间开好了。到「状态」页点一下「现在叫醒大肥鱼」，她开一次口，侧栏里才看得见。',
      })
    }],
  ]
}
