// @ts-check
/**
 * observe-bili.js —— 观测台 B 站登录、扫码、刷站、历史、封面、风控与评论/@ 路由
 *
 * 路由：
 *   /owner · /bili/state · /bili/qr · /browse-review · /browse · /history
 *   /away · /cover · /risk · /comment · /at
 */

import fs from 'node:fs'
import { readEvents, readOwner } from './store.js'
import { loadConfig, updateConfig, dateKey, biliOn } from './settings.js'
import { deriveSelf } from './derive.js'
import { quietBrowse, reviewNow } from './scheduler.js'
import { itemsFromEvents, browseCountToday, parseBrowseLine } from './browse.js'
import { seenOn } from './whatseen.js'
import { readAway } from './away.js'
import { coverPath, fetchCover } from './cover.js'
import { memoryCooldown, createClient } from './bili.js'
import { commentCountToday, replyCountToday, herComments, scanReplies } from './comment.js'
import { repliedToOthers, mentionsToday } from './at.js'
import { QR_TTL_MS } from './biliqr.js'
import { publicOwner, saveOwner, saveAccount } from './owner.js'
import { historyFromEvents } from './history.js'
import { riskState, clearRisk } from './risk.js'
import { logLine } from './log.js'
import { send, sentTooLarge, readBody } from './observe-http.js'

/**
 * 引导文案：别人第一次装，本机没有现成 cookie。
 */
export const COOKIE_HINT = [
  '在你的浏览器里登录 B 站 → 按 F12 → Application（应用）→ Cookies → https://www.bilibili.com',
  '找到 SESSDATA 和 bili_jct 这两行，把它们的值复制下来。',
  '粘成一行：SESSDATA=...; bili_jct=...',
  '（也可以在 Network 里随便点一个请求，直接复制整条 Cookie 请求头贴进来。）',
].join('\n')

/**
 * 封面图懒下载：设置页的 <img> 引到这条路由，第一次才真去取，之后命中缓存。
 *
 * @param {string} root
 * @param {string} bvid
 * @returns {Promise<string>}
 */
export async function lazyCover(root, bvid) {
  try {
    const { events } = await readEvents(root)
    let pic = ''
    for (const e of events) {
      const got = parseBrowseLine(e?.text)
      if (!got) continue
      const hit = got.arr.find((it) => it?.bvid === bvid && it?.pic)
      if (hit) pic = String(hit.pic)
    }
    if (!pic) {
      const ow = await readOwner(root)
      const client = createClient({ cookie: ow?.cookie || '' })
      const v = /** @type {any} */ (await client.view(bvid))
      pic = v?.data?.pic || v?.pic || ''
    }
    if (!pic) return ''
    return await fetchCover(/** @type {any} */ ({ root, bvid, pic }))
  } catch {
    return ''
  }
}

/**
 * @param {import('./types.js').ObserveEnv} env
 * @returns {import('./types.js').ObserveRouteEntry[]}
 */
export function buildBiliRoutes(env) {
  const { ctx, root, qrLogin } = env

  return [
    ['/owner', async (req, res) => {
      if (req.method === 'GET') {
        const ow = await readOwner(root)
        const { config } = await loadConfig(root)
        return send(res, 200, {
          ...publicOwner(ow),
          atOwner: config?.comment?.atOwner !== false,
          hint: COOKIE_HINT,
          qrTtlMs: QR_TTL_MS,
        })
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        const raw = await readBody(req)
        let body
        try { body = JSON.parse(raw || '{}') } catch { return send(res, 400, { error: 'body 不是合法 JSON' }) }
        if (body.test) {
          const ow = await readOwner(root)
          if (!ow?.cookie) return send(res, 200, { ok: false, note: '还没存 cookie。' })
          try {
            const c = createClient({ cookie: ow.cookie })
            const me = await c.me()
            if (!me?.isLogin) return send(res, 200, { ok: false, note: '这个 cookie 登不上，可能过期了。' })
            const owner = await saveAccount(me, root)
            return send(res, 200, { ok: true, note: `登上了：${me.uname}（uid ${me.mid}）`, mid: String(me.mid), name: String(me.uname), account: owner.account, canWrite: Boolean(me.canWrite) })
          } catch (err) {
            const msg = String(/** @type {any} */ (err)?.message ?? err)
            logLine('warn', ['登录态：拿这份 cookie 连不上 B 站', msg.slice(0, 160)], root)
            return send(res, 200, { ok: false, note: `连不上：${msg.slice(0, 60)}` })
          }
        }
        if (body.atOwner !== undefined) {
          await updateConfig({ comment: { atOwner: Boolean(body.atOwner) } }, root)
        }
        /** @type {Record<string, unknown>} */
        const patch = {}
        if (body.mid !== undefined) patch.mid = body.mid
        if (body.nickname !== undefined) patch.nickname = body.nickname
        if (body.cookie !== undefined) patch.cookie = body.cookie
        const r = /** @type {any} */ (Object.keys(patch).length ? await saveOwner(patch, root) : { ok: true, note: '存下了。', owner: publicOwner(await readOwner(root)) })
        if (r.ok && patch.cookie) {
          try {
            const probe = createClient({ cookie: (await readOwner(root))?.cookie || '' })
            const me = await probe.me()
            if (me?.isLogin && me.uname) {
              const r2 = await saveAccount(me, root)
              if (r2) return send(res, 200, { ...r, owner: r2, note: `${r.note || '存下了。'} 登录的是：${me.uname}（uid ${me.mid}）` })
            }
          } catch { /* 认不出来就算了，cookie 已经存下 */ }
        }
        return send(res, r.ok ? 200 : 400, r)
      }
      send(res, 405, { error: 'method not allowed' })
    }],

    ['/bili/state', async (req, res) => {
      if (req.method !== 'GET') return send(res, 405, { error: '只支持 GET' })
      const ow = await readOwner(root)
      if (!ow?.cookie) return send(res, 200, { ok: false, state: 'none', note: '还没存 B 站登录。' })
      try {
        const c = createClient({ cookie: ow.cookie, log: () => {} })
        const me = /** @type {any} */ (await c.me())
        if (!me?.isLogin) {
          return send(res, 200, { ok: false, state: 'expired', note: 'B 站登录已过期，需要重新登录。', why: me?.why ?? '' })
        }
        return send(res, 200, { ok: true, state: 'ok', name: String(me.uname ?? ''), mid: String(me.mid ?? ''), canWrite: Boolean(me.canWrite) })
      } catch (err) {
        const msg = String(/** @type {any} */ (err)?.message ?? err)
        logLine('warn', ['登录态：查状态时没连上 B 站', msg.slice(0, 160)], root)
        return send(res, 200, { ok: false, state: 'error', note: `没连上 B 站：${msg.slice(0, 60)}` })
      }
    }],

    ['/bili/qr', async (req, res) => {
      const u = new URL(String(req.url ?? '/'), 'http://x')
      const sub = u.pathname.replace(/^\/dsh-fish\/bili\/qr/, '').replace(/\/+$/, '')

      if (!sub) {
        if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
        const r = await qrLogin.start()
        return send(res, r.ok ? 200 : 502, r)
      }

      if (sub === '/status') {
        if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
        return send(res, 200, await qrLogin.poll(u.searchParams.get('key') ?? ''))
      }

      if (sub === '/save' || sub === '/drop') {
        if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
        /** @type {Record<string, unknown>} */
        let body = {}
        try {
          body = JSON.parse((await readBody(req, 20_000)) || '{}')
        } catch (err) {
          if (sentTooLarge(res, err)) return
          return send(res, 400, { error: 'body 不是合法 JSON' })
        }
        const key = String(body.key ?? '')
        if (!key) return send(res, 400, { error: '缺 key' })
        if (sub === '/drop') return send(res, 200, qrLogin.drop(key))
        const r = await qrLogin.save(key, root)
        return send(res, r.ok ? 200 : 409, r.ok ? r : { ...r, error: r.why || '这张码没存上。' })
      }

      send(res, 404, { error: 'no such route' })
    }],

    ['/browse-review', async (req, res) => {
      if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
      const r = /** @type {any} */ (await reviewNow(ctx, { root, log: (/** @type {string} */ k, /** @type {unknown} */ m) => logLine('info', [k, String(m ?? '')], root) }))
      return send(res, r.ok ? 200 : 409, r.ok ? r : { ...r, error: r.why || '这一趟没整理成' })
    }],

    ['/browse', async (req, res) => {
      if (req.method === 'POST') {
        const { events } = await readEvents(root)
        const { config } = await loadConfig(root)
        const dk = dateKey()
        const model = deriveSelf(events, { growthDays: config?.growthDays })
        const r = /** @type {any} */ (await quietBrowse(root, model, config, dk, { events, force: true }, (/** @type {string} */ k, /** @type {unknown} */ m) => logLine('info', [k, String(m ?? '')], root)))
        const picks = r.picks ?? []
        return send(res, r.ok ? 200 : 409, {
          ok: r.ok,
          count: picks.length,
          titles: picks.map((/** @type {any} */ p) => String(p.title || p.bvid || '')).filter(Boolean).slice(0, 5),
          note: r.note || '',
          error: r.ok ? undefined : (r.note || '这一趟没刷成'),
        })
      }
      const { events } = await readEvents(root)
      const { config } = await loadConfig(root)
      const dk = dateKey()
      const items = itemsFromEvents(events, dk)
      const used = browseCountToday(events, dk)
      const seen = seenOn(events, dk)
      const lookedAll = []
      for (const e of events) {
        if (e?.type !== 'meta') continue
        const t = String(e.text ?? '')
        if (t.startsWith('looked:')) lookedAll.push(t.slice(7).trim().split(/\s+/)[0])
      }
      send(res, 200, {
        enabled: Boolean(config?.browse?.enabled),
        perDay: Number(config?.browse?.perDay ?? 0),
        usedToday: used,
        topN: Number(config?.browse?.topN ?? 0),
        keywords: config?.browse?.keywords ?? [],
        items,
        watched: seen.watched,
        watchedCount: seen.watched.length,
        glancedCount: seen.glanced.length,
        handed: seen.handed,
        lookedCount: lookedAll.length,
        lookedRecent: lookedAll.slice(-20).reverse(),
        avoidKeywords: config?.avoid?.keywords ?? [],
        avoidMids: config?.avoid?.upMids ?? [],
        minDuration: Number(config?.avoid?.minDuration ?? 0),
      })
    }],

    ['/history', async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://x')
      const days = Math.max(1, Math.min(366, Number(url.searchParams.get('days')) || 14))
      const { events } = await readEvents(root)
      const groups = historyFromEvents(events, { days })
      const total = groups.reduce((a, g) => a + g.items.length, 0)
      send(res, 200, { days, total, groups })
    }],

    ['/away', async (_req, res) => {
      send(res, 200, await readAway(root))
    }],

    ['/cover', async (req, res) => {
      const m = String(req.url ?? '').match(/^\/dsh-fish\/cover\/(BV[0-9A-Za-z]{10})/)
      if (!m) { send(res, 404, { error: 'no cover' }); return }
      const file = coverPath(root, m[1]) || (await lazyCover(root, m[1]))
      if (!file) { send(res, 404, { error: 'no cover' }); return }
      try {
        const buf = fs.readFileSync(file)
        const ext = (file.split('.').pop() || '').toLowerCase()
        const ct = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
        res.writeHead(200, {
          'content-type': ct,
          'content-length': buf.length,
          'cache-control': 'private, max-age=86400',
        })
        res.end(buf)
      } catch {
        send(res, 404, { error: 'no cover' })
      }
    }],

    ['/risk', async (req, res) => {
      if (req.method === 'POST') {
        /** @type {{ clear?: unknown }} */
        let body = {}
        try {
          const raw = await readBody(req)
          body = raw ? JSON.parse(raw) : {}
        } catch (err) {
          if (sentTooLarge(res, err)) return
          body = {}
        }
        const cleared = Boolean(body?.clear)
        if (cleared) clearRisk(root)
        send(res, 200, { ...riskState(root), memory: memoryCooldown(), cleared })
        return
      }
      send(res, 200, { ...riskState(root), memory: memoryCooldown() })
    }],

    ['/comment', async (_req, res) => {
      const { events } = await readEvents(root)
      const { config } = await loadConfig(root)
      const dk = dateKey()
      const c = config.comment ?? {}
      const online = biliOn(config)
      /** @type {any[]} */
      let replies = []
      if (c.enabled === true && online) {
        replies = await scanReplies({ root, events, dateKey: dk }).catch(() => [])
      }
      send(res, 200, {
        enabled: c.enabled === true,
        online,
        perDay: Number(c.perDay ?? 0),
        usedToday: commentCountToday(events, dk),
        replyPerDay: Number(c.replyPerDay ?? 0),
        replyUsedToday: replyCountToday(events, dk),
        replyToReplies: c.replyToReplies !== false,
        scanEveryMin: Number(c.scanEveryMin ?? 30),
        window: c.window ?? [],
        mine: herComments(events, dk),
        waiting: replies.slice(0, 5).map((x) => ({ rpid: x.rpid, bvid: x.bvid, user: x.user, text: x.text, fromOwner: x.fromOwner === true })),
        waitingCount: replies.length,
        waitingOwnerCount: replies.filter((x) => x.fromOwner === true).length,
      })
    }],

    ['/at', async (req, res) => {
      if (req.method !== 'GET') return send(res, 405, { error: '只支持 GET' })
      const { events } = await readEvents(root)
      const { config } = await loadConfig(root)
      const a = config.at ?? {}
      send(res, 200, {
        enabled: a.enabled === true,
        online: biliOn(config),
        repliedToOthers: repliedToOthers(events),
        usedToday: mentionsToday(events, dateKey()),
        perDayMax: Number(a.perDayMax ?? 20),
      })
    }],
  ]
}
