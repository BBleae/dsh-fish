// @ts-check
/**
 * observe-data.js —— 观测台自检、身份导出、更新、运行日志、工作区迁移、本地与云端备份路由
 *
 * 路由：
 *   /selfcheck · /turn/export · /update · /log · /log/export · /log/clear
 *   /move · /backup · /backup/auto · /backup/auto/file · /backup/restore · /backup/restore/enc
 *   /cloud · /cloud/target/test · /cloud/target · /cloud/now · /cloud/pass · /cloud/remote
 *   /cloud/download · /cloud/restore
 */

import fs from 'node:fs'
import { join } from 'node:path'
import { readOwner } from './store.js'
import { loadConfig, updateConfig, dateKey } from './settings.js'
import { moveRoot, moveStatus } from './move.js'
import { collectBackup, backupFileName, bundleBytes, sizeText } from './backup.js'
import { autoBackupStatus, autoBackupSizeText, runAutoBackup, runLatestBackup, readAutoBackup } from './autobackup.js'
import { cloudStatus, cloudSizeText, runCloudBackup, testTarget, isOurs as isRemoteName } from './cloudbackup.js'
import { driver } from './clouddrive.js'
import { normTarget, mergeTargetSecrets, publicTarget } from './cloudtargets.js'
import { readPass, writePass, passFingerprint, isEncrypted, decryptBuffer } from './cloudcrypto.js'
import { homeStatus } from './home.js'
import { writeTurnExport } from './turnexport.js'
import { createClient } from './bili.js'
import { runChecks } from './selfcheck.js'
import { readRestrictState } from './restrict.js'
import { resolveHerModel } from './modelinfo.js'
import { LOG_KEEP, LOG_MAX_BYTES, buildBundle, clearLog, logLine, logsDir, redactConfig, tailLog } from './log.js'
import { checkUpdate, REPO_URL, normalizeVersion } from './update.js'
import { tailUpdateLog } from './selfupdate.js'
import { send, sentTooLarge, readBody, readBodyBuffer } from './observe-http.js'

/**
 * @param {import('./types.js').ObserveEnv} env
 * @returns {import('./types.js').ObserveRouteEntry[]}
 */
export function buildDataRoutes(env) {
  const { ctx, root, deps, flog, selfUpdater, restoreLimit, runRestore, replyRestore } = env

  return [
    ['/selfcheck', async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://x')
      const net = url.searchParams.get('net') !== '0'
      const { config } = await loadConfig(root)
      const client = net
        ? createClient({ cookie: (await readOwner(root))?.cookie || '', log: () => {} })
        : null
      const r = await runChecks(/** @type {any} */ ({
        root,
        config,
        host: {
          sessionController: ctx.get?.('sessionController') ?? ctx.sessionController,
          webServer: ctx.get?.('webServer') ?? ctx.webServer,
          connection: ctx.get?.('connection') ?? ctx.connection,
        },
        tools: ctx.get?.('tools') ?? ctx.tools,
        attachments: typeof ctx.get === 'function'
          ? Boolean(ctx.get('attachments'))
          : (ctx.attachments ? true : undefined),
        client,
        net,
        preset: config?.tools?.preset ?? '',
        sessionPreset: (await homeStatus(root))?.preset ?? '',
        restrict: readRestrictState(),
        restrictEnabled: config?.tools?.restrict !== false,
      }))
      send(res, 200, r)
    }],

    ['/turn/export', async (req, res) => {
      if (req.method !== 'POST') return send(res, 405, { error: '只能 POST' })
      const out = await writeTurnExport(root)
      send(res, out.ok ? 200 : 500, out)
    }],

    ['/update', async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://x')
      const route = url.pathname.replace(/\/+$/, '')

      if (route.endsWith('/update')) {
        const current = normalizeVersion(deps.version) || String(deps.version ?? '')
        const ms = Math.min(15_000, Math.max(1_000, Number(url.searchParams.get('ms') ?? 6000) || 6000))
        let r
        try {
          r = await checkUpdate({ current, timeoutMs: ms })
        } catch (err) {
          const msg = String(/** @type {any} */ (err)?.message ?? err)
          logLine('error', ['检查更新：自己抛了（本该永不抛）', msg.slice(0, 200)], root)
          r = { ok: false, current, error: msg }
        }
        send(res, 200, { ...r, repoUrl: REPO_URL })
        return
      }

      if (route.endsWith('/update/status')) {
        const st = /** @type {any} */ (selfUpdater.status())
        if (st.phase === 'prepared' || st.phase === 'installing') {
          st.log = await tailUpdateLog(join(root, 'updates', 'last.log'))
        }
        send(res, 200, st)
        return
      }

      if (route.endsWith('/update/download')) {
        if (req.method !== 'POST') return send(res, 405, { error: '只接受 POST' })
        let body
        try {
          body = JSON.parse((await readBody(req)) || '{}')
        } catch (err) {
          if (sentTooLarge(res, err)) return
          return send(res, 400, { error: 'body 不是合法 JSON' })
        }
        const version = String(body?.version ?? '').trim()
        if (!version) return send(res, 400, { error: '缺 version' })
        const r = await selfUpdater.start(version)
        return send(res, r.ok ? 202 : 400, r)
      }

      if (route.endsWith('/update/install')) {
        if (req.method !== 'POST') return send(res, 405, { error: '只接受 POST' })
        let body
        try {
          body = JSON.parse((await readBody(req)) || '{}')
        } catch (err) {
          if (sentTooLarge(res, err)) return
          return send(res, 400, { error: 'body 不是合法 JSON' })
        }
        const r = await selfUpdater.install(String(body?.version ?? '').trim())
        return send(res, r.ok ? 202 : 400, r)
      }

      send(res, 404, { error: '没有这个接口' })
    }],

    ['/log', async (req, res) => {
      if (req.method !== 'GET') return send(res, 405, { error: '只支持 GET' })
      const url = new URL(req.url ?? '/', 'http://x')
      const lines = Math.max(10, Math.min(500, Number(url.searchParams.get('lines') ?? 60) || 60))
      const tail = tailLog(root, { lines })
      return send(res, 200, {
        ...tail,
        dir: logsDir(root),
        maxBytes: LOG_MAX_BYTES,
        keep: LOG_KEEP,
      })
    }],

    ['/log/export', async (req, res) => {
      if (req.method !== 'GET') return send(res, 405, { error: '只支持 GET' })
      const url = new URL(req.url ?? '/', 'http://x')
      const lines = Math.max(50, Math.min(2000, Number(url.searchParams.get('lines') ?? 300) || 300))
      const { config } = await loadConfig(root).catch(() => ({ config: null }))
      const net = url.searchParams.get('net') !== '0'
      const netClient = net
        ? createClient({ cookie: (await readOwner(root).catch(() => null))?.cookie || '', log: () => {} })
        : null
      /** @type {any} */
      let checks = null
      try {
        checks = await runChecks(/** @type {any} */ ({
          root,
          config: config ?? undefined,
          host: {
            sessionController: ctx.get?.('sessionController') ?? ctx.sessionController,
            webServer: ctx.get?.('webServer') ?? ctx.webServer,
            connection: ctx.get?.('connection') ?? ctx.connection,
          },
          tools: ctx.get?.('tools') ?? ctx.tools,
          client: netClient,
          net,
          now: new Date(),
          preset: config?.tools?.preset ?? '',
          sessionPreset: (await homeStatus(root))?.preset ?? '',
          restrict: readRestrictState(),
          restrictEnabled: config?.tools?.restrict !== false,
        }))
      } catch (err) {
        const msg = String(/** @type {any} */ (err)?.message ?? err)
        logLine('warn', ['自检：跑不动', msg.slice(0, 240)], root)
        checks = { summary: `自检跑不动：${msg}`, items: [] }
      }
      let model = null
      try {
        const h = await homeStatus(root)
        model = await resolveHerModel(ctx, h?.sessionId)
      } catch (err) {
        const msg = String(/** @type {any} */ (err)?.message ?? err)
        logLine('warn', ['自检：读不到她的模型', msg.slice(0, 240)], root)
        model = { provider: '', model: '', imageInput: null, why: `读不到：${msg}` }
      }
      if (checks && Array.isArray(checks.items)) {
        const red = checks.items.filter((/** @type {any} */ x) => !x.ok)
        const totals = `${checks.items.length - red.length}/${checks.items.length} 项通过`
        if (!red.length) {
          logLine('info', ['自检：', totals, '（全部正常）'], root)
        } else {
          const detail = red.map((/** @type {any} */ x) => `${x.id}${x.label ? `（${x.label}）` : ''}：${String(x.detail ?? '').slice(0, 120)}`).join('；')
          logLine('warn', ['自检：', totals, detail], root)
        }
      }
      const text = buildBundle(root, /** @type {any} */ ({
        checks,
        version: deps.version ?? '',
        restrict: readRestrictState(),
        config: redactConfig(config),
        model,
        lines,
      }))
      res.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'content-disposition': `attachment; filename="dsh-fish-log-${dateKey()}.txt"`,
      })
      res.end(text)
    }],

    ['/log/clear', async (req, res) => {
      if (req.method !== 'POST') return send(res, 405, { error: '只支持 POST' })
      const r = clearLog(root)
      logLine('info', ['日志被手动清空（来自设置页）'], root)
      return send(res, 200, r)
    }],

    ['/move', async (req, res) => {
      if (req.method === 'GET') {
        const st = await moveStatus(root)
        return send(res, 200, { ...st, canPick: true })
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      const raw = await readBody(req, 20_000)
      let b = null
      try { b = JSON.parse(raw || '{}') } catch { return send(res, 400, { error: 'body 不是合法 JSON' }) }
      const r = /** @type {any} */ (await moveRoot(ctx, /** @type {any} */ ({ root, target: b.target, log: (/** @type {unknown} */ m) => logLine('info', [String(m)], root) })))
      if (!r.ok) return send(res, 409, { ok: false, error: r.why })
      const t = deps.tenancy?.tenant
      if (t && t.ok !== false) {
        t.ok = false
        t.why = '数据文件夹刚搬到了新位置，重启 DSH 之前这边只读，她记不下新的事。'
      }
      send(res, 200, r)
    }],

    ['/backup', async (req, res) => {
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
      const b = await collectBackup(root, { restoreLimit, withSecrets: true })
      const out = { ...b, fileName: backupFileName(), restoreLimit }
      const restoreBytes = bundleBytes(out) + 64
      send(res, 200, { ...out, restoreBytes, fitsRestore: restoreBytes <= restoreLimit })
    }],

    ['/backup/auto', async (req, res) => {
      if (req.method === 'GET') {
        const st = await autoBackupStatus(root)
        return send(res, 200, { ...st, sizeText: autoBackupSizeText(st) })
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      const bInfo = (/** @type {string} */ lane, /** @type {unknown} */ msg) => logLine('info', [lane, String(msg)], root)
      const r = /** @type {any} */ (await runAutoBackup(root, /** @type {any} */ ({ log: bInfo })))
      if (!r.ok) {
        logLine('warn', ['备份：手动存这一份没成', String(r.why ?? '').slice(0, 160)], root)
        return send(res, 500, { ok: false, error: r.why || '没能备份' })
      }
      const latest = /** @type {any} */ (await runLatestBackup(root, /** @type {any} */ ({ log: bInfo })))
      if (latest && latest.ok === false) {
        logLine('warn', ['备份：兜底那份没刷成', String(latest.why ?? '').slice(0, 160)], root)
      }
      const st = await autoBackupStatus(root)
      send(res, 200, { ok: true, ...r, sizeText: autoBackupSizeText(st) })
    }],

    ['/backup/auto/file', async (req, res) => {
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
      const m = /[?&]name=([^&]+)/.exec(String(req.url ?? ''))
      const name = m ? decodeURIComponent(m[1]) : ''
      const r = /** @type {any} */ (await readAutoBackup(name, root))
      if (!r.ok) return send(res, 404, { ok: false, error: r.why })
      send(res, 200, { ok: true, name: r.name, bundle: r.bundle })
    }],

    ['/backup/restore', async (req, res) => {
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      const skipBad = /[?&]skipBad=1(?:&|$)/.test(String(req.url ?? ''))
      let raw = ''
      try {
        raw = await readBody(req, restoreLimit, { mojibake: false })
      } catch (err) {
        if (/** @type {any} */ (err)?.statusCode === 413) {
          logLine('warn', ['恢复：这份备份太大，一次收不了', `上限 ${sizeText(restoreLimit)}`, '（走 /backup/restore 文本口）'], root)
          return send(res, 413, {
            ok: false,
            error: `这份备份超过了恢复一次能收的 ${sizeText(restoreLimit)}，从这里装不回去，现在的档什么都没动。换机器的话，在原来那台上把数据文件夹整个复制过来。`,
          })
        }
        throw err
      }
      let b = null
      try { b = JSON.parse(raw || '{}') } catch {
        logLine('warn', ['恢复：拖进来的不是备份（JSON 读不动）', `${Buffer.byteLength(raw, 'utf8')}B`], root)
        return send(res, 400, { error: 'body 不是合法 JSON' })
      }
      const r = await runRestore(b, skipBad)
      return replyRestore(res, r)
    }],

    ['/backup/restore/enc', async (req, res) => {
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      const skipBad = /[?&]skipBad=1(?:&|$)/.test(String(req.url ?? ''))
      let buf = null
      try {
        buf = await readBodyBuffer(req, restoreLimit)
      } catch (err) {
        if (/** @type {any} */ (err)?.statusCode === 413) {
          logLine('warn', ['恢复：这份 .enc 太大，一次收不了', `上限 ${sizeText(restoreLimit)}`, '（原始字节口）'], root)
          return send(res, 413, {
            ok: false,
            error: `这份备份超过了恢复一次能收的 ${sizeText(restoreLimit)}，从这里装不回去，现在的档什么都没动。换机器的话，在原来那台上把数据文件夹整个复制过来。`,
          })
        }
        throw err
      }
      if (!buf || !buf.length) return send(res, 400, { ok: false, error: '没收到文件内容。' })
      if (!isEncrypted(buf)) {
        return send(res, 400, { ok: false, error: '这个文件没加密——它是普通 json，用上面那颗「从备份恢复」更快，不用输口令。' })
      }
      const m = /[?&]pass=([^&]*)/.exec(String(req.url ?? ''))
      const hdr = String(req.headers?.['x-fish-pass'] ?? '')
      let pass = ''
      try { pass = hdr ? decodeURIComponent(hdr) : (m ? decodeURIComponent(m[1]) : '') } catch { pass = '' }
      if (!pass) pass = readPass(root)
      let text = ''
      try {
        text = decryptBuffer(buf, pass).toString('utf8')
      } catch (e) {
        const msg = String(/** @type {any} */ (e)?.message ?? e)
        logLine('warn', ['恢复：这份 .enc 解不开', `${buf.length}B`, pass ? '带了口令' : '没带口令', msg.slice(0, 160)], root)
        return send(res, 400, { ok: false, error: msg })
      }
      let b = null
      try { b = JSON.parse(text) } catch {
        logLine('warn', ['恢复：.enc 解出来了但不是备份', `${buf.length}B`], root)
        return send(res, 400, { ok: false, error: '这份解出来不是备份（JSON 读不动）。' })
      }
      const r = await runRestore(b, skipBad)
      return replyRestore(res, r)
    }],

    ['/cloud', async (req, res) => {
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
      const st = await cloudStatus(root)
      send(res, 200, { ...st, sizeText: cloudSizeText(st) })
    }],

    ['/cloud/target/test', async (req, res) => {
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      let body = null
      try { body = JSON.parse(await readBody(req, 1_000_000) || '{}') } catch { return send(res, 400, { error: 'body 不是合法 JSON' }) }
      const id = String(body?.id ?? '')
      const cfg = (await loadConfig(root)).config
      const saved = (cfg?.cloud?.targets ?? []).find((x) => x.id === id)
      let draft = body?.target && typeof body.target === 'object' ? normTarget(body.target, 0) : null
      if (draft && saved) draft = normTarget(mergeTargetSecrets(draft, saved), 0)
      const target = saved ?? draft
      if (!target) return send(res, 400, { ok: false, error: '没认出这个目标是哪一种。' })
      const use = draft && saved ? draft : target
      const r = await testTarget(use, /** @type {any} */ ({ root, config: cfg }))
      send(res, r.ok ? 200 : 400, r)
    }],

    ['/cloud/target', async (req, res) => {
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      let body = null
      try { body = JSON.parse(await readBody(req, 1_000_000) || '{}') } catch { return send(res, 400, { error: 'body 不是合法 JSON' }) }
      const cfg = (await loadConfig(root)).config
      const list = Array.isArray(cfg?.cloud?.targets) ? cfg.cloud.targets.slice() : []
      const removeId = String(body?.remove ?? '')
      if (removeId) {
        const next = list.filter((t) => t.id !== removeId)
        if (next.length === list.length) return send(res, 404, { ok: false, error: '没有这一条。' })
        await updateConfig({ cloud: { targets: next } }, root)
        return send(res, 200, { ok: true, removed: removeId })
      }
      const raw = body?.target
      const draft = raw && typeof raw === 'object' ? normTarget(raw, list.length) : null
      if (!draft) return send(res, 400, { ok: false, error: '没认出这个目标是哪一种。' })
      const at = list.findIndex((t) => t.id === draft.id)
      const saved = at >= 0 ? (normTarget(mergeTargetSecrets(draft, list[at]), at) ?? null) : draft
      if (!saved) return send(res, 400, { ok: false, error: '这条存不下来。' })
      const next = at >= 0 ? list.map((t, i) => (i === at ? saved : t)) : [...list, saved]
      await updateConfig({ cloud: { targets: next } }, root)
      send(res, 200, { ok: true, target: publicTarget(saved) })
    }],

    ['/cloud/now', async (req, res) => {
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      const log = flog('warn')
      const r = /** @type {any} */ (await runCloudBackup(root, { force: true, log }))
      const st = await cloudStatus(root)
      if (!r.ok) return send(res, 500, { ok: false, error: r.why || '没能推上去', results: r.results ?? [], status: { ...st, sizeText: cloudSizeText(st) } })
      send(res, 200, { ok: true, ...r, status: { ...st, sizeText: cloudSizeText(st) } })
    }],

    ['/cloud/pass', async (req, res) => {
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      let body = null
      try { body = JSON.parse(await readBody(req, 1_000_000) || '{}') } catch { return send(res, 400, { error: 'body 不是合法 JSON' }) }
      const pass = String(body?.pass ?? '')
      if (!pass) {
        const w = writePass(root, '')
        await updateConfig({ cloud: { passHint: '' } }, root)
        return send(res, 200, { ok: w.ok, cleared: true, why: '口令清掉了。之后再传的就是明文备份——只有你自己看得见的云盘也就算了，公开的地方别这么干。' })
      }
      const w = /** @type {any} */ (writePass(root, pass))
      if (!w.ok) return send(res, 400, { ok: false, error: w.why })
      await updateConfig({ cloud: { passHint: String(body?.hint ?? '').slice(0, 40) } }, root)
      send(res, 200, { ok: true, fingerprint: passFingerprint(pass) })
    }],

    ['/cloud/remote', async (req, res) => {
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
      const m = /[?&]id=([^&]+)/.exec(String(req.url ?? ''))
      const id = m ? decodeURIComponent(m[1]) : ''
      const cfg = (await loadConfig(root)).config
      const t = (cfg?.cloud?.targets ?? []).find((x) => x.id === id)
      if (!t) return send(res, 404, { ok: false, error: '没有这个目标。' })
      try {
        const items = await driver(t.kind).list(t)
        send(res, 200, { ok: true, items: (items ?? []).filter((/** @type {any} */ x) => isRemoteName(x.name)) })
      } catch (e) {
        const msg = String(/** @type {any} */ (e)?.message ?? e)
        logLine('warn', ['云端：列不出远端那几份', t.kind, msg.slice(0, 160)], root)
        send(res, 502, { ok: false, error: `数不回来：${msg}` })
      }
    }],

    ['/cloud/download', async (req, res) => {
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      let body = null
      try { body = JSON.parse(await readBody(req, 1_000_000) || '{}') } catch { return send(res, 400, { error: 'body 不是合法 JSON' }) }
      const id = String(body?.id ?? '')
      const name = String(body?.name ?? '')
      const cfg = (await loadConfig(root)).config
      const t = (cfg?.cloud?.targets ?? []).find((x) => x.id === id)
      if (!t) return send(res, 404, { ok: false, error: '没有这个目标。' })
      if (!isRemoteName(name)) return send(res, 400, { ok: false, error: '这不是一份备份的文件名。' })
      let buf = null
      try {
        buf = await driver(t.kind).get(t, name)
      } catch (e) {
        const msg = String(/** @type {any} */ (e)?.message ?? e)
        logLine('warn', ['云端：这一份取不回来（下载）', t.kind, name, msg.slice(0, 160)], root)
        return send(res, 502, { ok: false, error: `取不回来：${msg}` })
      }
      if (!buf || !buf.length) return send(res, 404, { ok: false, error: '那个地方没有这一份。' })
      let text = ''
      if (isEncrypted(buf)) {
        const pass = String(body?.pass ?? '') || readPass(root)
        try { text = decryptBuffer(buf, pass).toString('utf8') } catch (e) {
          const msg = String(/** @type {any} */ (e)?.message ?? e)
          logLine('warn', ['云端：下载回来的这份解不开', t.kind, name, `${buf.length}B`, msg.slice(0, 160)], root)
          return send(res, 400, { ok: false, error: msg })
        }
      } else {
        text = buf.toString('utf8')
      }
      try { JSON.parse(text) } catch {
        logLine('warn', ['云端：下载回来的不是备份', t.kind, name, `${buf.length}B`], root)
        return send(res, 400, { ok: false, error: '这份解出来不是备份（JSON 读不动）。' })
      }
      const plain = name.replace(/\.enc$/i, '')
      const dir = join(root, 'backups')
      try {
        await fs.promises.mkdir(dir, { recursive: true })
        await fs.promises.writeFile(join(dir, plain), text, 'utf8')
      } catch (e) {
        const msg = String(/** @type {any} */ (e)?.message ?? e)
        logLine('error', ['云端：下载回来的这份存不进 backups', t.kind, name, msg.slice(0, 200)], root)
        return send(res, 500, { ok: false, error: `存不下来：${msg}` })
      }
      send(res, 200, { ok: true, name: plain, path: join(dir, plain), bytes: Buffer.byteLength(text, 'utf8'), encrypted: isEncrypted(buf) })
    }],

    ['/cloud/restore', async (req, res) => {
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      let body = null
      try { body = JSON.parse(await readBody(req, 1_000_000) || '{}') } catch { return send(res, 400, { error: 'body 不是合法 JSON' }) }
      const id = String(body?.id ?? '')
      const name = String(body?.name ?? '')
      const cfg = (await loadConfig(root)).config
      const t = (cfg?.cloud?.targets ?? []).find((x) => x.id === id)
      if (!t) return send(res, 404, { ok: false, error: '没有这个目标。' })
      if (!isRemoteName(name)) return send(res, 400, { ok: false, error: '这不是一份备份的文件名。' })
      let buf = null
      try {
        buf = await driver(t.kind).get(t, name)
      } catch (e) {
        const msg = String(/** @type {any} */ (e)?.message ?? e)
        logLine('warn', ['云端恢复：这一份取不回来', t.kind, name, msg.slice(0, 160)], root)
        return send(res, 502, { ok: false, error: `取不回来：${msg}` })
      }
      if (!buf || !buf.length) return send(res, 404, { ok: false, error: '那个地方没有这一份。' })
      let text = ''
      if (isEncrypted(buf)) {
        const pass = String(body?.pass ?? '') || readPass(root)
        try { text = decryptBuffer(buf, pass).toString('utf8') } catch (e) {
          const msg = String(/** @type {any} */ (e)?.message ?? e)
          logLine('warn', ['云端恢复：取回来的这份解不开', t.kind, name, `${buf.length}B`, pass ? '带了口令' : '没带口令', msg.slice(0, 160)], root)
          return send(res, 400, { ok: false, error: msg })
        }
      } else {
        text = buf.toString('utf8')
      }
      let b = null
      try { b = JSON.parse(text) } catch {
        logLine('warn', ['云端恢复：取回来的不是备份', t.kind, name, `${buf.length}B`], root)
        return send(res, 400, { ok: false, error: '这份解出来不是备份（JSON 读不动）。' })
      }
      const r = await runRestore(b, body?.skipBad === true)
      return replyRestore(res, r)
    }],
  ]
}
