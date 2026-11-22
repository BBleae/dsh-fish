// @ts-check
/**
 * observe-outing.js —— 观测台出门、请求事件、梦、请神与内置说明（FAQ / Wiki）路由
 *
 * 路由：
 *   /outing · /ask · /dream · /possession · /faq.data · /faq · /wiki.data · /wiki · /
 */

import fs from 'node:fs'
import { join } from 'node:path'
import { readEvents, paths } from './store.js'
import { loadConfig, updateConfig } from './settings.js'
import { selfPronounOf } from './selfpronoun.js'
import { identityText, detachOutside, liveAgentOf, attachIdentity, attachAwayGuard, mountedCount } from './identity.js'
import { awayNow, awayLine, startOuting, endOuting, bindOutingSession, abortOuting, readOutings, readPossessions, activePossessionOf, pendingPossessionOf, settlePendingPossession, snapshotEvents, verifyEvents, passesReview, tripEvents, lastOutingForCwd, outingClosedText, tripDays, tripNoOf, pendingOf, settlePending } from './outing.js'
import { POCKET_TITLE, ensurePocket, pocketDirPath } from './pocket.js'
import { appendNote, queueNote, deliverQueued } from './sessionnote.js'
import { lettersSince } from './letter.js'
import { pendingKeepsakes, readKeepsakes, recentKeepsakes, decideKeepsake, tripKey } from './keepsake.js'
import { possessInto, releasePossession, releaseNoteText } from './possess.js'
import { askView, quotaOf, pendingAsks, settleAsk, markAskDone, ASK_KINDS } from './ask.js'
import { dreamView } from './dream.js'
import { devMode } from './devmode.js'
import { titleOfAgent, clipTitle } from './sessiontitle.js'
import { isHerHome, cwdOf } from './restrict.js'
import { FAQ, FAQ_TITLE, renderFaqPage } from './faq.js'
import { WIKI_TITLE, WIKI_INTRO, wikiData, renderWikiPage } from './wiki.js'
import { wikiUrl } from './wikiserve.js'
import { refreshSelfDoc } from './selfdoc.js'
import { logLine } from './log.js'
import { PAGE, safeGet, send, readBody } from './observe-http.js'
import {
  settleTripEnd,
  settleSerial,
  ledgerBrief,
  pendingCard,
  settleTripReview,
  reviewTargetMismatch,
  resolveSessionAgent,
  rejectNoteToHome,
  pathKey,
  isPluginSource,
  outingWakeText,
} from './observe-trip.js'

/**
 * @param {import('./types.js').ObserveEnv} env
 * @returns {import('./types.js').ObserveRouteEntry[]}
 */
export function buildOutingRoutes(env) {
  void devMode
  const { ctx, root, flog } = env

  return [
    ['/outing', async (req, res) => {
      if (req.method === 'GET') {
        const away = await awayNow(root)
        const { outings } = await readOutings(root)
        const { possessions } = await readPossessions(root)
        let workspaces = []
        let why = ''
        try {
          const reg = safeGet(ctx, 'workspaceRegistry')
          const list = typeof reg?.list === 'function' ? reg.list() : []
          const homeDir = pathKey(join(paths(root).root, 'home'))
          workspaces = list
            .filter((/** @type {any} */ w) => w && pathKey(w.path) !== homeDir)
            .map((/** @type {any} */ w) => ({
              id: String(w.id ?? w.workspaceId ?? ''),
              title: String(w.title ?? ''),
              path: String(w.path ?? ''),
              risky: isPluginSource(w.path),
              last: lastOutingForCwd({ outings }, w.path),
            }))
            .filter((/** @type {any} */ w) => w.id)
          if (!list.length) why = '宿主没有可列的工作区（workspaceRegistry 不可用）'
        } catch (err) {
          why = `列工作区失败：${String(/** @type {any} */ (err)?.message ?? err).slice(0, 120)}`
        }
        /** @type {Record<string, any>} */
        let pocket = { path: '', workspaceId: '', registered: false, exists: false }
        try {
          const { config } = await loadConfig(root)
          const dir = pocketDirPath(config)
          const reg = safeGet(ctx, 'workspaceRegistry')
          const list = typeof reg?.list === 'function' ? reg.list() : []
          const found = list.find((/** @type {any} */ w) => w && pathKey(w.path) === pathKey(dir))
          pocket = {
            path: dir,
            workspaceId: String(found?.id ?? found?.workspaceId ?? ''),
            registered: Boolean(found),
            exists: fs.existsSync(dir),
            last: lastOutingForCwd({ outings }, dir),
          }
        } catch (err) {
          pocket.why = String(/** @type {any} */ (err)?.message ?? err).slice(0, 120)
        }
        const liveVerify = away.kind === 'outing' ? verifyEvents(join(root, 'events.jsonl'), away.outing?.baseline) : null
        const since = away.kind === 'outing'
          ? tripEvents(join(root, 'events.jsonl'), away.outing, { limit: 300 })
          : { ok: false, total: 0, items: [], why: '没在外面' }
        /** @type {any[]} */
        let letters = []
        if (away.outing?.startedAt) {
          try {
            const { events } = await readEvents(root)
            letters = lettersSince(events, {
              since: away.outing.startedAt,
              sessionId: away.outing.sessionId || '',
              limit: 6,
            })
          } catch { letters = [] }
        }
        const trip = away.outing ? tripDays(away.outing) : 0
        /** @type {{ pending: any[], recent: any[] }} */
        let keepsakes = { pending: [], recent: [] }
        const diariesByTrip = new Map()
        try {
          keepsakes = { pending: pendingKeepsakes(root), recent: recentKeepsakes(root, 6) }
          const { events } = await readEvents(root)
          for (const ev of events) {
            if (ev?.type !== 'meta') continue
            const m = /^diary:\S+(?: trip:(\S+))?$/.exec(String(ev.text ?? ''))
            if (m && m[1]) diariesByTrip.set(m[1], (diariesByTrip.get(m[1]) ?? 0) + 1)
          }
        } catch { /* 数不出来就按 0 算 */ }
        const keptByTrip = new Map()
        for (const it of readKeepsakes(root).items) {
          if (it?.status !== 'kept' || !it.trip) continue
          keptByTrip.set(it.trip, (keptByTrip.get(it.trip) ?? 0) + 1)
        }
        const tripsWithCounts = outings.map((o) => ({
          ...o,
          diaries: diariesByTrip.get(tripKey(o)) ?? 0,
          keepsakes: keptByTrip.get(tripKey(o)) ?? 0,
        }))
        const atPocket = away.kind === 'outing' && Boolean(
          (pocket.workspaceId && String(away.outing?.workspaceId ?? '') === pocket.workspaceId) ||
          (pocket.path && pathKey(away.outing?.cwd) === pathKey(pocket.path)))
        /** @type {Record<string, any>} */
        let awayInfo = { ...away, line: awayLine(away), verify: liveVerify, since, tripDays: trip, atPocket }
        if (away?.kind) {
          const rec = away.kind === 'outing' ? away.outing : away.possession
          const sid = String(rec?.sessionId ?? '')
          const live = liveAgentOf(ctx, sid)
          const mounted = live ? mountedCount(live) : 0
          awayInfo = {
            ...awayInfo,
            sessionId: sid,
            sessionShort: sid.replace(/^session-/, '').slice(0, 8),
            sessionTitle: live ? clipTitle(titleOfAgent(ctx, live)) : '',
            tripNo: away.kind === 'outing' ? tripNoOf({ outings }, sid, Number(rec?.startedAt ?? 0)) : 0,
            equipped: mounted > 0,
            warning: mounted > 0 ? '' : '这趟没接好（她的人设和护栏都没装上去）。先叫她回家，再重新出门一次。',
          }
        }
        let pendingReview = null
        try {
          const pend = pendingOf({ outings })
          if (pend) {
            const pv = verifyEvents(join(root, 'events.jsonl'), pend.baseline)
            const psid = String(pend.sessionId ?? '')
            pendingReview = {
              sessionId: psid,
              sessionShort: psid.replace(/^session-/, '').slice(0, 8),
              workspaceName: pend.workspaceName || pend.workspaceId || '别的工作区',
              ...pendingCard(pend, pv),
            }
          }
        } catch { /* 复核信息拿不到不影响别的 */ }
        return send(res, 200, {
          ok: true,
          why,
          away: awayInfo,
          pendingReview,
          identityFrozen: Boolean(away.outing?.identity),
          outings: tripsWithCounts.slice(-20).map(ledgerBrief),
          possessions: possessions.slice(-20).map(ledgerBrief),
          letters,
          keepsakes,
          workspaces,
          pocket,
          dev: true,
          ack: ((await loadConfig(root).catch(() => ({ config: null }))).config?.outing ?? {}).ack === true,
        })
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      const raw = await readBody(req, 20_000)
      /** @type {Record<string, any>} */
      let b = {}
      try { b = JSON.parse(raw || '{}') } catch { return send(res, 400, { error: 'body 不是合法 JSON' }) }
      const action = String(b.action ?? '')

      if (action === 'ack') {
        await updateConfig({ outing: { ack: true } }, root)
        logLine('info', ['出门：确认了测试版说明'], root)
        return send(res, 200, { ok: true })
      }

      if (action === 'keepsake') {
        const said = b.yes === true
        const r = /** @type {any} */ (decideKeepsake(root, { id: String(b.id ?? ''), yes: said }))
        logLine('info', ['纪念品：', said ? '准了' : '没带', r.item?.rel ?? '', r.item?.id ?? ''], root)
        return send(res, r.ok ? 200 : 409, { ok: r.ok, item: r.item ?? null, note: r.note, ...(r.ok ? {} : { error: r.note }) })
      }

      if (action === 'review') return settleSerial(root, async () => {
        const { outings } = await readOutings(root)
        const pend = pendingOf({ outings })
        if (!pend) return send(res, 409, { ok: false, why: '现在没有等着核对的那趟', error: '现在没有等着核对的那趟' })
        const off = reviewTargetMismatch(pend, b)
        if (off) return send(res, 409, { ok: false, why: off, error: off })
        const v = verifyEvents(join(root, 'events.jsonl'), pend.baseline)
        if (!passesReview(v)) {
          logLine('info', ['复核：还是对不上', v.why ?? ''], root)
          return send(res, 409, { ok: false, why: v.why || '文件还是对不上', error: v.why || '文件还是对不上', verify: v })
        }
        const s = await settleTripReview(ctx, root, 'outing', pend, settlePending)
        if (!s.ok) {
          logLine('warn', ['复核：没结算', s.why ?? ''], root)
          return send(res, s.code ?? 500, { ok: false, why: s.why, error: s.why || '没结算' })
        }
        const r = s.settled
        logLine('info', ['复核：通过，这趟收下了', r.outing?.workspaceName || '', v.why ?? '', s.dropped ? `不算 ${s.dropped} 条` : ''], root)
        return send(res, 200, { ok: true, outing: r.outing, verify: v, kept: s.kept, rejected: s.dropped, note: s.note })
      })

      if (action === 'end') return settleSerial(root, async () => {
        const away = await awayNow(root)
        if (away.kind !== 'outing') return send(res, 409, { ok: false, why: '她没在外面', error: '她没在外面', away })
        const { v, tampered, rejectedIds, pendingRejectedIds, autoRejected, marked } =
          await settleTripEnd(root, 'outing', away.outing, b)
        if (!marked.ok) logLine('warn', ['回家：取消勾选的标记没写进去', marked.why ?? ''], root)
        const unsettled = tampered || !marked.ok
        const status = unsettled ? 'pending' : b.kept === false ? 'rejected' : 'done'
        const r = /** @type {any} */ (await endOuting(root, /** @type {any} */ ({
          status,
          kept: unsettled ? null : b.kept === false ? false : true,
          rejectedIds,
          pendingRejectedIds,
          autoRejected,
          marked: marked.ok,
        })))
        if (!r.ok) return send(res, 409, { ok: false, why: r.why, error: r.why || '这一步没成' })
        logLine('info', [`回家：${status}`, r.outing?.workspaceName || r.outing?.workspaceId || '', v.why ?? '', autoRejected ? `整趟不算（${rejectedIds.length} 条）` : ''], root)
        await refreshSelfDoc(root).catch(() => {})
        const outSid = String(r.outing?.sessionId || away.outing?.sessionId || '')
        const outAgent = liveAgentOf(ctx, outSid)
        const detached = outAgent ? detachOutside(outAgent) : { ok: false, removed: 0 }
        if (detached.ok) logLine('info', ['回家：拆掉外面的装备', `${detached.removed} 段`], root)
        const closeText = outingClosedText({ workspaceName: r.outing?.workspaceName })
        /** @type {{ ok: boolean, why?: string, queued?: boolean | number }} */
        let outNote = { ok: false, why: '那条对话现在没开着' }
        if (outAgent) {
          outNote = appendNote(outAgent, closeText)
          if (!outNote.ok) logLine('warn', ['回家：交接句没写进去', outNote.why ?? ''], root)
        } else if (outSid) {
          outNote = await queueNote(root, closeText, { sessionId: outSid })
          if (!outNote.ok) logLine('warn', ['回家：交接句没排上队', outNote.why ?? ''], root)
        }
        /** @type {{ ok: boolean, why?: string, delivered?: boolean, queued?: boolean }} */
        let note = { ok: false, why: '这趟没有要驳回的' }
        if (!unsettled && rejectedIds.length) {
          note = await rejectNoteToHome(ctx, root, { trip: away.outing, rejectedIds, auto: autoRejected })
          if (!note.ok) logLine('warn', ['回家：驳回话术没写进去', note.why ?? ''], root)
        }
        return send(res, 200, {
          ok: true,
          outing: r.outing,
          verify: v,
          tampered,
          rejected: rejectedIds.length,
          held: marked.ok ? pendingRejectedIds.length : 0,
          marked: marked.ok,
          ...(marked.ok ? {} : { markWhy: marked.why, markedPart: marked.lines > 0 }),
          autoRejected,
          detached,
          note,
          outNote,
        })
      })

      if (action === 'start') {
        const wantPocket = Boolean(b.pocket)
        let wsId = String(b.workspaceId ?? '').trim()
        if (!wantPocket && !wsId) return send(res, 400, { error: '要选一个工作区' })
        const away = await awayNow(root)
        if (away.kind) return send(res, 409, { ok: false, why: '她已经在外面了', error: '她已经在外面了', away })
        const sc = safeGet(ctx, 'sessionController')
        if (!sc?.create) return send(res, 503, { ok: false, why: '宿主没有 sessionController 服务' })
        let wsPath = ''
        let wsTitle = ''
        if (wantPocket) {
          const { config } = await loadConfig(root)
          const p = /** @type {any} */ (await ensurePocket(ctx, root, config))
          if (!p.ok) return send(res, 500, { ok: false, why: p.why })
          wsId = p.wsId
          wsPath = p.dir
          wsTitle = POCKET_TITLE
          if (!p.registered) {
            logLine('warn', ['出门：口袋没登记成工作区', p.why ?? '', p.dir], root)
          }
        } else {
          try {
            const reg = safeGet(ctx, 'workspaceRegistry')
            const row = (typeof reg?.list === 'function' ? reg.list() : []).find(
              (/** @type {any} */ w) => String(w?.id ?? w?.workspaceId ?? '') === wsId,
            )
            wsPath = String(row?.path ?? '')
            wsTitle = String(row?.title ?? '')
          } catch { /* 拿不到就当没名字 */ }
        }
        const baseline = snapshotEvents(join(root, 'events.jsonl'))
        const identity = identityText(root)
        const reuseId = String(b.sessionId ?? '').trim()
        let reusePrev = null
        if (reuseId) {
          const { outings } = await readOutings(root)
          reusePrev = outings.find((o) => o && String(o.sessionId ?? '') === reuseId) ?? null
          if (!reusePrev) return send(res, 409, { ok: false, why: '台账里找不到这条会话的出门记录', error: '台账里找不到这条会话的出门记录' })
          if (wsPath && pathKey(reusePrev.cwd) !== pathKey(wsPath)) {
            return send(res, 409, { ok: false, why: '这条会话上次去的是别的工作区，不能接过来', error: '这条会话上次去的是别的工作区，不能接过来' })
          }
          if (!wsPath) wsPath = String(reusePrev.cwd ?? '')
          if (!wsTitle) wsTitle = String(reusePrev.workspaceName ?? '')
        }
        const r = /** @type {any} */ (await startOuting(root, /** @type {any} */ ({ sessionId: reuseId, workspaceId: wsId, workspaceName: wsTitle, cwd: wsPath, baseline, identity })))
        if (!r.ok) return send(res, 409, { ok: false, why: r.why, error: r.why || '这一步没成' })
        if (!wsId && !wsPath) return send(res, 400, { error: '要选一个工作区' })
        const { outings: allOutings } = await readOutings(root)
        const tripNo = reuseId ? tripNoOf({ outings: allOutings }, reuseId, Number(r.outing?.startedAt ?? 0)) : 1
        logLine('info', ['出门：', wsTitle || wsId, reuseId ? `（接回第 ${tripNo} 趟）` : '（新开一条）', wsPath], root)
        let sessionId = reuseId
        try {
          if (reuseId) {
            const live = liveAgentOf(ctx, reuseId)
            if (live) {
              attachIdentity(live, root, { frozen: identity, herDir: paths(root).herDir })
              const g = /** @type {any} */ (attachAwayGuard(live, { root, herDir: paths(root).herDir, log: (/** @type {unknown} */ m) => logLine('info', [String(m)], root) }))
              if (!g.ok) logLine('warn', ['出门：接回的老会话兜底守卫没挂上', g.why ?? ''], root)
              await bindOutingSession(root, { sessionId })
            } else {
              const back = await resolveSessionAgent(sc, reuseId)
              if (back && mountedCount(back) === 0) {
                attachIdentity(back, root, { frozen: identity, herDir: paths(root).herDir })
                attachAwayGuard(back, { root, herDir: paths(root).herDir, log: (/** @type {unknown} */ m) => logLine('info', [String(m)], root) })
              }
            }
            const resumed = liveAgentOf(ctx, sessionId)
            if (resumed) {
              void deliverQueued(resumed, root).then((d) => {
                if (d?.stuck > 0) logLine('warn', ['回家：交接句没补投进去', `${d.stuck} 句还压着`, '（会话头没写完？等下次打开再试）'], root)
              }).catch((err) => logLine('warn', ['回家：补投交接句时抛了', String(err?.message ?? err).slice(0, 160)], root))
            }
          } else {
            const created = wsId ? await sc.create({ workspaceId: wsId }) : await sc.create({ cwd: wsPath })
            sessionId = String(created?.sessionId ?? created?.id ?? '')
            if (!sessionId) throw new Error('宿主没返回会话 id')
            await bindOutingSession(root, { sessionId })
          }
          const wakeText = reuseId
            ? `又出门了，还在「${wsTitle || wsPath || '那边'}」。接着上次的做，家里人在叫你回去。`
            : outingWakeText(wsTitle || wsPath || '别的工作区')
          if (typeof sc.prompt === 'function') {
            void sc.prompt({
              requestId: `outing-${sessionId}-${Date.now()}`,
              sessionId,
              mode: 'queue',
              content: [{ type: 'text', text: wakeText }],
            }, new AbortController().signal).catch((/** @type {any} */ err) => {
              logLine('warn', ['出门首轮没递进去', String(err?.message ?? err).slice(0, 120)], root)
            })
          }
        } catch (err) {
          const why = String(/** @type {any} */ (err)?.message ?? err).slice(0, 160)
          const live = liveAgentOf(ctx, reuseId || sessionId)
          if (live) detachOutside(live)
          try { await abortOuting(root, { force: true }) } catch { /* ignore */ }
          logLine('warn', ['出门：装配失败，已经把这趟撤掉了', why], root)
          return send(res, 500, { ok: false, why: `出门没装配完，已经撤掉这趟：${why}` })
        }
        const equipped = mountedCount(liveAgentOf(ctx, sessionId)) > 0
        logLine('info', ['出门：装配完成', wsTitle || wsId, `会话 ${sessionId}`, equipped ? '装备挂上了' : '装备一段都没挂上'], root)
        return send(res, 200, { ok: true, outing: r.outing, reused: Boolean(reuseId), sessionId, tripNo, equipped, workspaces: [] })
      }

      send(res, 400, { error: 'action 只能是 start 或 end' })
    }],

    ['/ask', async (req, res) => {
      if (req.method === 'GET') {
        const { events } = await readEvents(root)
        return send(res, 200, {
          ok: true,
          kinds: ASK_KINDS,
          quota: quotaOf(events),
          pending: pendingAsks(events).map((/** @type {any} */ e) => ({
            id: e.id,
            ts: e.ts,
            kind: String(e?.ask?.kind ?? ''),
            subject: String(e?.ask?.subject ?? ''),
            question: String(e.text ?? ''),
            options: Array.isArray(e?.ask?.options) ? e.ask.options : [],
          })),
          items: askView(events),
        })
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      const body = await readBody(req)
      /** @type {Record<string, any>} */
      let b = {}
      try { b = JSON.parse(body || '{}') } catch { return send(res, 400, { error: 'body 不是合法 JSON' }) }
      if (b.action !== 'answer' && b.action !== 'done') return send(res, 400, { error: 'action 只能是 answer / done' })
      if (b.action === 'done') {
        const d = /** @type {any} */ (await markAskDone(root, { askId: b.askId }))
        if (!d.ok) return send(res, 409, { ok: false, why: d.why, error: d.why })
        if (!d.already) logLine('info', ['请求事件：标成已解决', String(b.askId || '')], root)
        return send(res, 200, { ok: true })
      }
      const r = /** @type {any} */ (await settleAsk(root, {
        askId: b.askId,
        verdict: b.verdict,
        reason: b.reason,
        via: 'ui',
      }))
      if (!r.ok) return send(res, 409, { ok: false, why: r.why, error: r.why })
      logLine('info', ['请求事件：回答', String(b.askId || ''), String(b.verdict || '')], root)
      return send(res, 200, { ok: true })
    }],

    ['/dream', async (req, res) => {
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
      const { events } = await readEvents(root)
      return send(res, 200, { ok: true, ...dreamView(events, { withRefs: true }) })
    }],

    ['/possession', async (req, res) => {
      const herDir = paths(root).herDir
      if (req.method === 'GET') {
        const away = await awayNow(root)
        const { possessions } = await readPossessions(root)
        const sessions = []
        try {
          const reg = ctx.get?.('agents')
          const list = reg?.list?.() ?? []
          for (const a of list) {
            const sid = String(a?.session?.header?.id ?? a?.session?.id ?? '')
            if (!sid) continue
            if (isHerHome(a, herDir)) continue
            const h = a?.session?.header ?? a?.session ?? {}
            sessions.push({
              sessionId: sid,
              title: clipTitle(titleOfAgent(ctx, a) || h.title || h.name || ''),
              cwd: cwdOf(a),
            })
          }
        } catch { /* 拿不到活 agent 就只读台账 */ }
        return send(res, 200, {
          ok: true,
          enabled: true,
          away: { ...away, line: awayLine(away) },
          possessions: possessions.slice(-20).map(ledgerBrief),
          active: ledgerBrief(activePossessionOf({ possessions })),
          pending: ledgerBrief(pendingPossessionOf({ possessions })),
          verify: (() => {
            const act = activePossessionOf({ possessions })
            return act ? verifyEvents(join(root, 'events.jsonl'), act.baseline) : null
          })(),
          since: (() => {
            const act = activePossessionOf({ possessions })
            return act
              ? tripEvents(join(root, 'events.jsonl'), act, { limit: 300 })
              : { ok: false, total: 0, items: [], why: '她没上身' }
          })(),
          pendingReview: (() => {
            const pend = pendingPossessionOf({ possessions })
            if (!pend) return null
            const pv = verifyEvents(join(root, 'events.jsonl'), pend.baseline)
            return {
              sessionId: pend.sessionId,
              title: pend.title,
              sessionShort: String(pend.sessionId).slice(-8),
              ...pendingCard(pend, pv),
            }
          })(),
          sessions,
          why: '',
        })
      }
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
      const body = await readBody(req)
      /** @type {Record<string, any>} */
      let b = {}
      try { b = JSON.parse(body || '{}') } catch { return send(res, 400, { error: 'body 不是合法 JSON' }) }
      const log = flog('info')
      if (b.action === 'start') {
        const away = await awayNow(root)
        if (away.kind === 'outing') {
          return send(res, 409, { ok: false, why: '她正在出门，先叫她回家再请神', error: '她正在出门，先叫她回家再请神' })
        }
        const prior = liveAgentOf(ctx, String(b.sessionId ?? ''))
        if (prior) {
          void deliverQueued(prior, root).then((d) => {
            if (d?.stuck > 0) logLine('warn', ['请神：交接句没补投进去', `${d.stuck} 句还压着`, '（会话头没写完？等下次打开再试）'], root)
          }).catch((err) => logLine('warn', ['请神：补投交接句时抛了', String(err?.message ?? err).slice(0, 160)], root))
        }
        const r = /** @type {any} */ (await possessInto(ctx, {
          root,
          herDir,
          sessionId: b.sessionId,
          log,
        }))
        if (!r.ok) return send(res, r.code ?? 409, { ok: false, why: r.why, error: r.why || '这一步没成' })
        logLine('info', ['请神：', r.possession?.title || r.possession?.sessionId || b.sessionId], root)
        return send(res, 200, { ok: true, possession: r.possession, section: r.section ?? '' })
      }
      if (b.action === 'end') return settleSerial(root, async () => {
        let agent = null
        try {
          const reg = ctx.get?.('agents')
          const wantSid = String(b.sessionId ?? '')
          const curSid = wantSid || String(activePossessionOf(await readPossessions(root))?.sessionId ?? '')
          agent = curSid ? reg?.get?.(curSid) ?? null : null
        } catch { /* ignore */ }
        const { possessions } = await readPossessions(root)
        const cur = activePossessionOf({ possessions })
        if (!cur) return send(res, 409, { ok: false, why: '她本来就没上身', error: '她本来就没上身' })
        if (b.sessionId && String(cur.sessionId) !== String(b.sessionId)) {
          return send(res, 409, { ok: false, why: '上身的那条不是这一条', error: '上身的那条不是这一条', possession: cur })
        }
        const { v, tampered, rejectedIds, pendingRejectedIds, autoRejected, marked } =
          await settleTripEnd(root, 'possess', cur, b)
        if (!marked.ok) logLine('warn', ['请神结束：取消勾选的标记没写进去', marked.why ?? ''], root)
        const unsettled = tampered || !marked.ok
        const status = unsettled ? 'pending' : b.kept === false ? 'rejected' : 'done'
        const r = /** @type {any} */ (await releasePossession(root, {
          sessionId: b.sessionId ?? '',
          log,
          agent,
          status,
          kept: unsettled ? null : b.kept === false ? false : true,
          rejectedIds,
          pendingRejectedIds,
          autoRejected,
          marked: marked.ok,
        }))
        if (!r.ok) return send(res, r.code ?? 409, { ok: false, why: r.why, error: r.why || '这一步没成' })
        logLine('info', [`请神结束：${status}`, r.possession?.title || r.possession?.sessionId || '', v.why ?? '', autoRejected ? `整趟不算（${rejectedIds.length} 条）` : ''], root)
        await refreshSelfDoc(root).catch(() => {})
        /** @type {{ ok: boolean, why?: string, queued?: boolean }} */
        let closeNote = r.note ?? { ok: false, why: '那条对话现在没开着' }
        if (!closeNote.ok && cur?.sessionId) {
          const q = await queueNote(root, releaseNoteText(), { sessionId: cur.sessionId })
          if (q.ok) closeNote = { ok: true, queued: true }
          else logLine('warn', ['请神结束：交接句没排上队', q.why ?? ''], root)
        }
        /** @type {{ ok: boolean, why?: string, delivered?: boolean, queued?: boolean }} */
        let rejectNote = { ok: false, why: '这趟没有要驳回的' }
        if (!unsettled && rejectedIds.length) {
          rejectNote = await rejectNoteToHome(ctx, root, { trip: cur, rejectedIds, auto: autoRejected })
          if (!rejectNote.ok) logLine('warn', ['请神结束：驳回话术没写进去', rejectNote.why ?? ''], root)
        }
        return send(res, 200, {
          ok: true,
          possession: r.possession,
          note: closeNote,
          verify: v,
          tampered,
          rejected: rejectedIds.length,
          held: marked.ok ? pendingRejectedIds.length : 0,
          marked: marked.ok,
          ...(marked.ok ? {} : { markWhy: marked.why, markedPart: marked.lines > 0 }),
          autoRejected,
          rejectNote,
        })
      })
      if (b.action === 'review') return settleSerial(root, async () => {
        const { possessions } = await readPossessions(root)
        const pend = pendingPossessionOf({ possessions })
        if (!pend) return send(res, 409, { ok: false, why: '现在没有等着核对的那趟请神', error: '现在没有等着核对的那趟请神' })
        const off = reviewTargetMismatch(pend, b)
        if (off) return send(res, 409, { ok: false, why: off, error: off })
        const v = verifyEvents(join(root, 'events.jsonl'), pend.baseline)
        if (!passesReview(v)) {
          logLine('info', ['请神复核：还是对不上', v.why ?? ''], root)
          return send(res, 409, { ok: false, why: v.why || '文件还是对不上', error: v.why || '文件还是对不上', verify: v })
        }
        const s = await settleTripReview(ctx, root, 'possess', pend, settlePendingPossession)
        if (!s.ok) {
          logLine('warn', ['请神复核：没结算', s.why ?? ''], root)
          return send(res, s.code ?? 500, { ok: false, why: s.why, error: s.why || '没结算' })
        }
        const r = s.settled
        logLine('info', ['请神复核：通过，这趟收下了', r.possession?.title || '', v.why ?? '', s.dropped ? `不算 ${s.dropped} 条` : ''], root)
        return send(res, 200, { ok: true, possession: r.possession, verify: v, kept: s.kept, rejected: s.dropped, note: s.note })
      })
      send(res, 400, { error: 'action 只能是 start / end / review' })
    }],

    ['/faq.data', async (_req, res) => {
      const body = JSON.stringify({ ok: true, title: FAQ_TITLE, items: FAQ })
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store',
      })
      res.end(body)
    }],

    ['/faq', async (_req, res) => {
      const html = renderFaqPage()
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': Buffer.byteLength(html),
        'cache-control': 'no-store',
      })
      res.end(html)
    }],

    ['/wiki.data', async (_req, res) => {
      const body = JSON.stringify({ ok: true, url: wikiUrl(), ...wikiData(), title: WIKI_TITLE, intro: WIKI_INTRO })
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store',
      })
      res.end(body)
    }],

    ['/wiki', async (_req, res) => {
      let she = '她'
      try {
        const { config: c } = await loadConfig(root)
        she = selfPronounOf(c)
      } catch { /* ignore */ }
      const html = renderWikiPage({ pronoun: she })
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': Buffer.byteLength(html),
        'cache-control': 'no-store',
      })
      res.end(html)
    }],

    ['/', async (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(PAGE)
    }],
  ]
}
