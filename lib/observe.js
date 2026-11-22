// @ts-check
/**
 * observe.js —— 观测台入口与路由装配器（唯一的"看"，没有"改"）
 *
 * 原则（B §8）：这里是**观察窗**，不是养成面板。
 *   - 允许看：她现在第几天 / 阶段 / 她说过的话 / 日记（若放开）/ 事件原文 / 消耗统计
 *   - 不允许：任何滑条、任何"好感度"数字、任何"调性格"的表单
 *   - 唯一可改的东西：配置（时间窗、配额、黑名单、日记可见性）——这些是**她的生长环境**，
 *     不是她的性格。改环境 ≠ 改她。
 *
 * 路由全部 fail-closed：拿不到 connection 服务就 503，不放行。
 * 具体路由按职责拆在 `observe-*.js` 中，本文件只负责共享上下文、栅栏挂载与生命周期清理。
 */

import { rootDir } from './store.js'
import { loadConfig } from './settings.js'
import { selfPronounOf, fillSelf, selfPronounFor } from './selfpronoun.js'
import { registerSessionPressure } from './session-pressure.js'
import { createQrLogin } from './biliqr.js'
import { renderWikiPage } from './wiki.js'
import { startWikiServer, closeWikiServer } from './wikiserve.js'
import { startBridgeServer, closeBridgeServer } from './bridgeserve.js'
import { restoreBackup, RESTORE_MAX_BYTES } from './backup.js'
import { logLine } from './log.js'
import { createSelfUpdater, runtimeBins } from './selfupdate.js'

import { PREFIX, safeGet, openFolderInSystem, send, makeGuarded } from './observe-http.js'
import { metaIdLines, settleTripReview, resolveSessionAgent } from './observe-trip.js'
import { buildStateRoutes } from './observe-state.js'
import { buildConfigRoutes } from './observe-config.js'
import { buildBiliRoutes } from './observe-bili.js'
import { createBridgeHandlers, buildHomeRoutes } from './observe-home.js'
import { buildDataRoutes } from './observe-data.js'
import { buildOutingRoutes } from './observe-outing.js'

export { metaIdLines, settleTripReview, resolveSessionAgent }

/**
 * @param {import('./types.js').HostContext} ctx
 * @param {import('./types.js').ObserveDeps} [deps]
 */
export function registerObserve(ctx, deps = {}) {
  const root = deps.root ?? rootDir()
  /** @type {Array<() => void>} */
  const disposers = []

  /** @param {'info' | 'warn' | 'error' | 'debug'} [level] */
  const flog = (level = 'info') => (/** @type {unknown[]} */ ...a) => {
    logLine(level, ['[dsh-fish]', ...a.map((x) => String(x))], root)
  }

  const reclaimTenant = async () => {
    try { await deps.tenancy?.reclaim?.() } catch { /* 下一拍心跳会再试 */ }
  }

  /** @type {<T>(fn: () => Promise<T> | T) => Promise<T> | T} */
  const awayFromBeat = (fn) => (typeof deps.tenancy?.quiet === 'function' ? deps.tenancy.quiet(fn) : fn())
  const restoreLimit = Number(deps.restoreLimit) > 0 ? Number(deps.restoreLimit) : RESTORE_MAX_BYTES

  /** @type {Map<string, number>} */
  const inflight = new Map()
  const offInflight = ctx.on?.('session/event', (/** @type {any} */ session, /** @type {any} */ event) => {
    const id = session?.header?.id ?? session?.id
    if (!id) return
    if (event?.type === 'turn/start') inflight.set(String(id), Date.now())
    else if (event?.type === 'turn/end') inflight.delete(String(id))
  })
  if (typeof offInflight === 'function') disposers.push(offInflight)

  /**
   * @param {any} bundle
   * @param {boolean} skipBad
   */
  const runRestore = async (bundle, skipBad) => {
    const r = await awayFromBeat(() => restoreBackup(bundle, root, { skipBad }))
    await reclaimTenant()
    return r
  }

  /**
   * @param {import('./types.js').HttpResponse} res
   * @param {any} r
   */
  const replyRestore = (res, r) => {
    if (!r.ok) {
      if (r.needDecision) {
        return send(res, 409, { ok: false, needDecision: true, error: r.why, badFiles: r.badFiles, badCount: r.badCount })
      }
      return send(res, 409, { ok: false, error: r.why })
    }
    return send(res, 200, {
      ok: true,
      restored: r.restored,
      quarantined: r.quarantined,
      skipped: r.skipped,
      skippedCount: r.skippedCount,
      skippedUnlisted: r.skippedUnlisted,
      skippedBad: r.skippedBad,
      note: fillSelf('重启 DSH 之后{S}才是这份档的样子。', selfPronounFor(root)),
    })
  }

  const selfUpdater = deps.selfUpdater ?? createSelfUpdater(/** @type {any} */ ({
    root,
    current: deps.version,
    exe: process.execPath,
    ...runtimeBins({ exe: process.execPath }),
  }))

  const qrLogin = deps.qrLogin ?? createQrLogin({ log: flog('info') })
  const openFolder = deps.openFolder ?? openFolderInSystem
  const guarded = makeGuarded(ctx, root)
  const pressure = registerSessionPressure(ctx, root)
  disposers.push(pressure.dispose)

  let bridgePortLive = 0
  /** @type {{ sayHandler: import('./types.js').ObserveHandler, whoamiHandler: import('./types.js').ObserveHandler } | null} */
  let bridgeHandlers = null

  /**
   * @param {unknown} portRaw
   * @param {string} [why]
   */
  function syncBridgePort(portRaw, why = '启动') {
    const port = Number(portRaw) || 0
    if (!(port > 0)) {
      if (bridgePortLive) {
        try { closeBridgeServer() } catch { /* 已经关了 */ }
        logLine('info', ['桥接投递口已关', `（${why}）`], root)
        bridgePortLive = 0
      }
      return
    }
    if (port === bridgePortLive || !bridgeHandlers) return
    try { closeBridgeServer() } catch { /* 没起过 */ }
    const st = startBridgeServer({
      port,
      handlers: { '/say': bridgeHandlers.sayHandler, '/whoami': bridgeHandlers.whoamiHandler },
      log: (/** @type {unknown[]} */ ...a) => logLine('warn', ['桥接投递口：', ...a.map((x) => String(x))], root),
    })
    bridgePortLive = port
    if (st?.url) logLine('info', ['桥接投递口开着：', st.url, `（${why}）`], root)
  }

  /** @type {import('./types.js').ObserveEnv} */
  const env = {
    ctx,
    root,
    deps,
    flog,
    pressure,
    selfUpdater,
    qrLogin,
    openFolder,
    syncBridgePort,
    inflight,
    restoreLimit,
    runRestore,
    replyRestore,
    awayFromBeat,
    reclaimTenant,
  }

  bridgeHandlers = createBridgeHandlers(env)

  const routes = [
    ...buildStateRoutes(env),
    ...buildConfigRoutes(env),
    ...buildBiliRoutes(env),
    ...buildHomeRoutes(env, bridgeHandlers),
    ...buildDataRoutes(env),
    ...buildOutingRoutes(env),
  ]

  const webServer = safeGet(ctx, 'webServer')
  if (!webServer?.register) return { dispose: pressure.dispose }

  for (const [p, h] of routes) {
    const ex = p === '/' ? { kind: 'exact', path: PREFIX, handler: guarded(h) } : { kind: 'prefix', path: PREFIX + p, handler: guarded(h) }
    try {
      const d = webServer.register(ex)
      if (typeof d === 'function') disposers.push(d)
      else if (d && typeof d.dispose === 'function') disposers.push(() => d.dispose())
    } catch (err) {
      logLine('warn', ['路由注册失败', p, String(/** @type {any} */ (err)?.message ?? err)], root)
    }
  }

  startWikiServer({
    getHtml: async () => {
      let she = '她'
      try {
        const { config: c } = await loadConfig(root)
        she = selfPronounOf(c)
      } catch { /* ignore */ }
      return renderWikiPage({ pronoun: she })
    },
  })
  disposers.push(() => { try { closeWikiServer() } catch { /* ignore */ } })

  void (async () => {
    try {
      const { config: bc } = await loadConfig(root)
      syncBridgePort(bc?.bridge?.port, '启动')
      disposers.push(() => { try { closeBridgeServer() } catch { /* ignore */ } })
    } catch (err) {
      logLine('warn', ['桥接投递口没起来：', String(/** @type {any} */ (err)?.message ?? err).slice(0, 120)], root)
    }
  })()

  return {
    dispose() {
      try { qrLogin.clear() } catch { /* ignore */ }
      for (const d of disposers) { try { d() } catch { /* ignore */ } }
    },
  }
}
