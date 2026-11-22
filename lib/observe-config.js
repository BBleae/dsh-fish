// @ts-check
/**
 * observe-config.js —— 观测台生长环境配置、工具白名单与规则裁决路由
 *
 * 路由：
 *   /config · /tools · /rules · /decide
 */

import { readEvents } from './store.js'
import { loadConfig, updateConfig, configFileInfo, validateToolNames, sanitizeToolNames, windowProblem } from './settings.js'
import { fillSelf, selfPronounFor } from './selfpronoun.js'
import { deriveSelf } from './derive.js'
import { noteSpeakEnabled, speakOn } from './speak.js'
import { refreshSelfDoc } from './selfdoc.js'
import { rulesByLayer } from './rules.js'
import { ruleStatus, offerHistory, pendingOffer, offerLimits } from './unlock.js'
import { recordGrant } from './grant.js'
import { readRestrictState, knownToolNames, ownLayerNames, blockedTools, herToolsNow, herSceneToolsNow, currentAllowTools, refreshToolRestrict } from './restrict.js'
import { bridgeUrl } from './bridgeserve.js'
import { logLine } from './log.js'
import { send, readBody } from './observe-http.js'

/**
 * 这一局收窄真在管的那两份名单（/tools 用）。
 * @returns {{ allowNow: string[]|null, effective: string[]|null, skipped: string[], skippedSure: boolean|null }}
 */
export function toolsNowOf() {
  const allowNow = currentAllowTools()
  const R = /** @type {any} */ (readRestrictState())
  const applied = allowNow !== null && Number(R?.applied) > 0
  return {
    allowNow,
    effective: applied && Array.isArray(R.effective) ? R.effective.slice() : null,
    skipped: applied && Array.isArray(R.skipped) ? R.skipped.slice() : [],
    skippedSure: applied ? R.skippedSure !== false : null,
  }
}

/**
 * @param {import('./types.js').ObserveEnv} env
 * @returns {import('./types.js').ObserveRouteEntry[]}
 */
export function buildConfigRoutes(env) {
  const { ctx, root, syncBridgePort } = env

  return [
    ['/config', async (req, res) => {
      if (req.method === 'GET') {
        const { config } = await loadConfig(root)
        const info = await configFileInfo(root)
        return send(res, 200, { config, file: info })
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        const body = await readBody(req)
        let patch
        try { patch = JSON.parse(body || '{}') } catch { return send(res, 400, { error: 'body 不是合法 JSON' }) }
        const strictTools = patch.strictTools === true
        delete patch.strictTools
        // 白名单：只允许改"环境"，不允许任何指向她本人的键（test/p5.test.mjs 反查这张表）
        const allowed = ['growthDays', 'wakesPerDay', 'window', 'daily', 'diary', 'absenceAfterDays', 'avoid', 'browse', 'bili', 'video', 'comment', 'at', 'notify', 'chat', 'rooms', 'memory', 'tools', 'observe', 'ui', 'proactive', 'drive', 'interest', 'dream', 'owner', 'self', 'backup', 'cloud', 'bridge']
        const bad = Object.keys(patch).filter((k) => !allowed.includes(k))
        if (bad.length) {
          logLine('warn', [
            '/config 保存被白名单挡回：',
            `拒了 ${bad.join('、')}`,
            `提交的键 ${Object.keys(patch).join('、')}`,
          ], root)
          return send(res, 400, { error: `这一版还不支持保存：${bad.join('、')}` })
        }
        /** @type {[string, unknown][]} */
        const ranges = [
          [fillSelf('{S}醒着的时间段', selfPronounFor(root)), patch.window],
          ['上网时段', patch.browse?.window],
          ['评论时段', patch.comment?.window],
        ]
        for (const [label, w] of ranges) {
          if (w === undefined || w === null) continue
          const problem = windowProblem(w)
          if (problem) return send(res, 400, { error: `${label}：${problem}` })
        }
        /** @type {string[]} */
        let droppedTools = []
        if (patch.tools && patch.tools.allow !== undefined) {
          if (strictTools) {
            const check = validateToolNames(patch.tools.allow, knownToolNames(ctx))
            if (!check.ok) {
              logLine('warn', ['/config 保存被工具名校验挡回：', `不存在的名字 ${check.unknown.join('、')}`], root)
              return send(res, 400, {
                error: `这些工具名不存在：${check.unknown.join('、')}`,
                unknown: check.unknown,
              })
            }
            patch.tools.allow = check.names
          } else {
            const clean = sanitizeToolNames(patch.tools.allow, knownToolNames(ctx))
            patch.tools.allow = clean.names
            droppedTools = clean.dropped
            if (droppedTools.length) {
              logLine('warn', [
                '/config 里的工具名在这台机器上不存在，已跳过：',
                droppedTools.join('、'),
                `保留 ${clean.names.length} 个`,
              ], root)
            }
          }
        }
        const before = await loadConfig(root).catch(() => null)
        const next = await updateConfig(patch, root)
        const beforeAllow = JSON.stringify(before?.config?.tools?.allow ?? [])
        const nextAllow = JSON.stringify(next?.tools?.allow ?? [])
        let toolsLive = null
        if (beforeAllow !== nextAllow) {
          try {
            const r = /** @type {any} */ (refreshToolRestrict({ extra: next?.tools?.allow ?? [] }))
            toolsLive = { ok: r?.ok === true, deferred: r?.deferred?.length ?? 0 }
            logLine('info', [
              'tools.allow 已当场生效',
              `allow=${(next?.tools?.allow ?? []).join(',') || '(空)'}`,
              `换刀=${r?.applied?.length ?? 0}`,
              r?.deferred?.length ? `延后=${r.deferred.length}` : '',
            ], root)
          } catch (err) {
            logLine('warn', ['白名单热更新没成（下次新建会话照样生效）：', String(/** @type {any} */ (err)?.message ?? err).slice(0, 200)], root)
          }
        }
        await refreshSelfDoc(root).catch(() => {})
        noteSpeakEnabled(speakOn(next))
        const wasVisible = before?.config?.diary?.visible === true
        const nowVisible = next?.diary?.visible === true
        if (wasVisible !== nowVisible) {
          logLine('info', [
            'diary.visible',
            wasVisible ? 'on' : 'off',
            '->',
            nowVisible ? 'on' : 'off',
            `by=${Object.keys(patch).join(',')}`,
          ], root)
        }
        const beforePort = Number(before?.config?.bridge?.port) || 0
        const nextPort = Number(next?.bridge?.port) || 0
        if (beforePort !== nextPort) {
          try {
            syncBridgePort(nextPort, '设置页')
          } catch (err) {
            logLine('warn', ['桥接投递口热更新没成：', String(/** @type {any} */ (err)?.message ?? err).slice(0, 200)], root)
          }
        }
        try {
          const c = /** @type {any} */ (next ?? {})
          const on = (/** @type {unknown} */ v) => (v === true ? 'on' : 'off')
          logLine('info', [
            'config',
            `by=${Object.keys(patch).join(',')}`,
            `bili=${on(c.bili?.enabled)}`,
            `comment=${on(c.comment?.enabled)}`,
            `perDay=${Number(c.comment?.perDay) || 0}`,
            `reply=${on(c.comment?.replyToReplies)}`,
            `browse=${on(c.browse?.enabled)}`,
            `proactive=${on(c.proactive?.enabled)}`,
            `bridge=${Number(c.bridge?.port) || 0}`,
          ], root)
        } catch { /* 快照失败不影响保存 */ }
        return send(res, 200, { ok: true, config: next, droppedTools, toolsLive, bridge: bridgeUrl() })
      }
      send(res, 405, { error: 'method not allowed' })
    }],

    ['/tools', async (req, res) => {
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
      const known = knownToolNames(ctx)
      return send(res, 200, {
        ok: Boolean(known && known.length),
        known: known ?? [],
        ownLayer: ownLayerNames(),
        blocked: blockedTools(),
        herTools: herToolsNow(),
        herSceneTools: herSceneToolsNow(),
        ...toolsNowOf(),
      })
    }],

    ['/rules', async (req, res) => {
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
      const { events } = await readEvents(root).catch(() => ({ events: [] }))
      const { config } = await loadConfig(root)
      const model = deriveSelf(events, config)
      return send(res, 200, {
        layers: rulesByLayer(),
        status: ruleStatus(events, model, Date.now(), offerLimits(config)),
        history: offerHistory(events).slice(-20),
        pending: (() => {
          const p = pendingOffer(events, Date.now(), offerLimits(config))
          return p ? { id: p.id, rule: p.grant?.rule || '', why: p.text || '' } : null
        })(),
        offersOn: config?.rules?.offers !== false,
      })
    }],

    ['/decide', async (req, res) => {
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      const raw = await readBody(req)
      let body
      try { body = JSON.parse(raw || '{}') } catch { return send(res, 400, { error: 'body 不是合法 JSON' }) }
      const verdict = body.verdict === 'approve' || body.verdict === 'reject' ? body.verdict : null
      if (!verdict) return send(res, 400, { error: 'verdict 只能是 approve 或 reject' })
      const { events } = await readEvents(root).catch(() => ({ events: [] }))
      const held = await loadConfig(root).catch(() => ({ config: null }))
      const p = pendingOffer(events, Date.now(), offerLimits(held.config ?? undefined))
      if (!p) return send(res, 409, { error: '现在没有待裁决的申请' })
      const r = await recordGrant(root, {
        offerId: p.id,
        rule: p.grant?.rule || '',
        verdict,
        reason: typeof body.reason === 'string' ? body.reason : '',
      })
      if (!r.ok) return send(res, 400, { error: r.error })
      return send(res, 200, { ok: true, verdict })
    }],
  ]
}
