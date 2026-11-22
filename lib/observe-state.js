// @ts-check
/**
 * observe-state.js —— 观测台状态、认知、日记、作品、记忆与日报只读路由
 *
 * 路由：
 *   /session-pressure · /status · /state · /events · /beliefs · /diary
 *   /works · /works-open · /work-file · /memory · /health · /reports · /templates
 */

import fs from 'node:fs'
import { resolve, sep } from 'node:path'
import { readEvents, paths, readDaily, listDiary, diaryDatesWritten } from './store.js'
import { loadConfig, dateKey } from './settings.js'
import { selfPronounOf, fillSelf } from './selfpronoun.js'
import { deriveSelf, consistency, novelty, gateNeed } from './derive.js'
import { examine } from './health.js'
import { countEvents, isNoiseMeta } from './meta.js'
import { stability, stabilityBand } from './quality.js'
import { firedLog, CATALOG } from './events.js'
import { listReports, buildReport } from './report.js'
import { listWorks, worksSummary, readWorkText, worksDir, WORK_LIST_MAX } from './works.js'
import { seenOn } from './whatseen.js'
import { awayNow, awayLine, tripDays } from './outing.js'
import { homeStatus } from './home.js'
import { selfDocStatus } from './selfdoc.js'
import { personaBudget, BELIEF_SHOWN, shownCount, keepCount } from './persona.js'
import { buildStances, gatesDone, stanceSummary } from './stance.js'
import { ruleById } from './rules.js'
import { ruleStatus, pendingOffer, offerLimits, activeGrants } from './unlock.js'
import { deriveStatus } from './status.js'
import { normalizeVersion } from './update.js'
import { send, readBody } from './observe-http.js'

/** @type {Record<string, 'belief' | 'refuse' | 'revise'>} */
const FORCED_GATE_MAP = { trust: 'belief', autonomy: 'refuse', competence: 'revise' }

/** @type {Record<string, string>} */
const WORK_CONTENT_TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8',
}

/**
 * @param {import('./types.js').ObserveEnv} env
 * @returns {import('./types.js').ObserveRouteEntry[]}
 */
export function buildStateRoutes(env) {
  const { root, deps, pressure, openFolder } = env

  return [
    ['/session-pressure', async (req, res) => {
      if (req.method === 'POST') {
        let body
        try { body = JSON.parse(await readBody(req)) } catch { return send(res, 400, { ok: false }) }
        const ok = await pressure.select(body?.id, body?.selected)
        return send(res, ok ? 200 : 400, { ok })
      }
      if (req.method !== 'GET') return send(res, 405, { ok: false })
      const options = new URL(req.url ?? '/', 'http://x').searchParams
      if (options.has('trend')) {
        const result = await pressure.trend(options.get('trend') ?? '', options.get('diagnostics') === '1')
        return send(res, result ? 200 : 404, result ?? { ok: false })
      }
      if (options.get('wait') === '1') await pressure.waitForIdle()
      return send(res, 200, await pressure.view(options.get('composite') === '1', /** @type {any} */ (options.get('session') || null), options.get('light') === '1'))
    }],

    ['/status', async (_req, res) => {
      const { events } = await readEvents(root)
      const { config } = await loadConfig(root)
      const st = deriveStatus({ events, config, now: new Date() })
      let away = null
      try {
        const a = await awayNow(root)
        if (a?.kind) {
          const rec = a.kind === 'outing' ? a.outing : a.possession
          away = { kind: a.kind, since: rec?.startedAt, line: awayLine(a), tripDays: a.kind === 'outing' ? tripDays(a.outing, { now: Date.now() }) : 0 }
        }
      } catch { /* 读台账失败不影响状态本身 */ }
      /** @type {import('./types.js').ObserveStatusPayload} */
      const payload = { ...st, away, running: true }
      send(res, 200, payload)
    }],

    ['/state', async (_req, res) => {
      const { events, skipped } = await readEvents(root)
      const { config, fresh, broken } = await loadConfig(root)
      const m = deriveSelf(events, { growthDays: config.growthDays })
      const need = gateNeed(m.growthDays)
      /** @type {import('./types.js').ObserveStatePayload} */
      const payload = {
        day: m.day,
        growthDays: m.growthDays,
        dev: true,
        stage: m.stage,
        stageName: m.stageName,
        stagePeak: m.stagePeak,
        stageForced: m.stageForced,
        pendingGate: m.stageGate?.pending ?? null,
        gateTimes: { belief: need.trust, refuse: need.autonomy, revise: need.competence },
        forcedGates: (m.stageGate?.forced ?? [])
          .map((g) => FORCED_GATE_MAP[g])
          .filter(Boolean),
        name: m.name,
        beliefCount: m.beliefCount,
        absenceDays: m.absenceDays,
        tension: m.tensions?.[0]
          ? { count: m.tensionsTotal ?? m.tensions.length, a: m.tensions[0].a.text, b: m.tensions[0].b.text }
          : null,
        solidCount: m.solidTotal ?? m.solid?.length ?? 0,
        scarCount: m.scars?.length ?? 0,
        stanceCount: buildStances(m).length,
        stanceReady: gatesDone(m),
        counts: (() => {
          const c = countEvents(events)
          return {
            utterance: events.filter((e) => e.type === 'utterance').length,
            chat: events.filter(
              (e) => e.type === 'utterance' && Array.isArray(e.flags) && e.flags.includes('uncommitted'),
            ).length,
            revise: events.filter((e) => e.type === 'revise').length,
            refusal: events.filter((e) => e.type === 'refusal').length,
            reunion: events.filter((e) => e.type === 'reunion').length,
            total: c.real,
            all: c.all,
            meta: c.meta,
            noise: c.noise,
          }
        })(),
        quality: (() => {
          const st = stability(events, { growthDays: config.growthDays }, {
            shown: config?.memory?.beliefsShown,
            budget: config?.memory?.docBudget,
            withBans: m?.persona?.imported !== true,
            sleepKeep: config?.memory?.sleepKeep,
          })
          return { stability: { ...st, band: stabilityBand(st) }, consistency: consistency(events), novelty: novelty(events) }
        })(),
        rules: ruleStatus(events, m, Date.now(), offerLimits(config)),
        pending: (() => {
          const p = pendingOffer(events, Date.now(), offerLimits(config))
          if (!p) return null
          const r = ruleById(p.grant?.rule)
          return { id: p.id, rule: p.grant?.rule, title: r?.title ?? '', text: p.text ?? '', day: p.day ?? null }
        })(),
        grants: activeGrants(events, Date.now()),
        config: { window: config.window, daily: config.daily, diary: { enabled: config.diary.enabled, visible: config.diary.visible }, absenceAfterDays: config.absenceAfterDays, proactive: config.proactive, self: { pronoun: selfPronounOf(config) } },
        meta: { root, skippedLines: skipped, configFresh: fresh, configBroken: broken, dateKey: dateKey(), version: normalizeVersion(deps.version) || String(deps.version ?? '') },
        tenancy: (() => {
          const t = deps.tenancy
          if (!t) return null
          return {
            ok: t.tenant?.ok !== false,
            instanceId: String(t.tenant?.instanceId ?? ''),
            why: String(t.tenant?.why ?? ''),
            dataDir: String(t.tenant?.owner?.dataDir ?? t.root ?? root ?? ''),
          }
        })(),
        homes: (() => {
          const h = deps.tenancy?.homes
          if (!h) return null
          return { changed: h.changed === true, from: String(h.from ?? ''), to: String(h.to ?? '') }
        })(),
        home: {
          ...(await homeStatus(root)),
          blocked: deps.tenancy?.home?.blocked === true,
          blockedWhy: deps.tenancy?.home?.blocked === true ? String(deps.tenancy?.home?.why ?? '') : '',
        },
        compat: {
          checked: deps.compat?.checked === true,
          userQuestions: deps.compat?.userQuestions !== false,
        },
        host: (() => {
          const h = deps.install?.host
          if (!h) return null
          return {
            ok: h.ok === true,
            status: String(h.status ?? 'unknown'),
            version: String(h.version ?? ''),
            range: String(h.range ?? ''),
            why: String(h.why ?? ''),
          }
        })(),
        upgrade: (() => {
          const u = deps.install?.upgrade
          if (!u) return null
          return {
            stale: u.stale === true,
            older: u.older === true,
            skipped: u.skipped === true,
            running: String(u.running ?? ''),
            source: String(u.source ?? ''),
            sourcePath: String(u.sourcePath ?? ''),
            profile: String(u.profile ?? ''),
            why: String(u.why ?? ''),
          }
        })(),
      }
      send(res, 200, payload)
    }],

    ['/events', async (req, res) => {
      const { events } = await readEvents(root)
      const url = new URL(req.url ?? '/', 'http://x')
      const limit = Math.min(500, Number(url.searchParams.get('limit') ?? 80) || 80)
      const type = url.searchParams.get('type')
      const withNoise = url.searchParams.get('noise') === '1'
      const rows = events
        .filter((e) => (!type || e.type === type) && (withNoise || !isNoiseMeta(e)))
        .slice(-limit)
        .reverse()
      const c = countEvents(events)
      send(res, 200, { total: c.real, all: c.all, meta: c.meta, noise: c.noise, rows })
    }],

    ['/beliefs', async (_req, res) => {
      const { events } = await readEvents(root)
      const { config } = await loadConfig(root)
      const m = deriveSelf(events, { growthDays: config.growthDays })
      send(res, 200, {
        active: m.beliefs.map((b) => ({ id: b.id, text: b.text, since: b.since, confidence: b.confidence })),
        refuted: m.refuted,
        refusals: m.refusals,
        selfmod: m.selfmodAttempts,
      })
    }],

    ['/diary', async (req, res) => {
      const { config } = await loadConfig(root)
      if (!config.diary.enabled) return send(res, 200, { enabled: false, visible: false, items: [], note: fillSelf('{S}没在写日记', selfPronounOf(config)) })
      const dates = await listDiary(root)
      if (!config.diary.visible) {
        return send(res, 200, { enabled: true, visible: false, items: [], lockedDates: dates, note: '日记已写，但设置为不可见' })
      }
      const url = new URL(req.url ?? '/', 'http://x')
      const day = url.searchParams.get('day')
      if (day) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !dates.includes(day)) return send(res, 404, { error: '这天没有日记' })
        return send(res, 200, { date: day, text: await readDaily('diaryDir', day, root) })
      }
      const items = []
      for (const d of dates.slice(0, 1)) items.push({ date: d, text: await readDaily('diaryDir', d, root) })
      send(res, 200, { enabled: true, visible: true, dates, items })
    }],

    ['/works', async (req, res) => {
      if (!req.method || req.method === 'GET') {
        const url = new URL(req.url ?? '/', 'http://x')
        const want = Number(url.searchParams.get('limit') ?? 0)
        const limit = Number.isSafeInteger(want) && want > 0 ? Math.min(want, WORK_LIST_MAX) : WORK_LIST_MAX
        const [items, summary] = await Promise.all([listWorks(root, { limit }), worksSummary(root)])
        return send(res, 200, { items, summary, dir: worksDir(root) })
      }
      if (req.method === 'POST') {
        let body = {}
        try { body = JSON.parse((await readBody(req, 20_000)) || '{}') } catch { return send(res, 400, { error: 'body 不是合法 JSON' }) }
        const id = typeof body.id === 'string' ? body.id : ''
        const title = typeof body.title === 'string' ? body.title : ''
        const version = Number(body.version) || 0
        const got = await readWorkText(root, { id, title, version })
        if (!got.ok) return send(res, 404, { error: got.note || '翻不到这件东西' })
        return send(res, 200, { ok: true, id: got.id, title: got.title, state: got.state, version: got.version, versions: got.versions, kind: got.kind || 'text', file: got.file || '', text: got.text })
      }
      return send(res, 405, { error: '只认 GET 与 POST' })
    }],

    ['/works-open', async (req, res) => {
      if (req.method !== 'POST') return send(res, 405, { error: '只认 POST' })
      const made = worksDir(root)
      let dir = made
      try {
        if (!fs.statSync(made).isDirectory()) dir = paths(root).root
      } catch { dir = paths(root).root }
      if (!(await openFolder(dir))) return send(res, 200, { ok: false, error: '这个环境打不开文件夹，路径就在界面上，手动复制一下就行。' })
      return send(res, 200, { ok: true, dir })
    }],

    ['/work-file', async (req, res) => {
      if (req.method && req.method !== 'GET') return send(res, 405, { error: '只认 GET' })
      const url = new URL(req.url ?? '/', 'http://x')
      const want = String(url.searchParams.get('p') || '')
      const base = resolve(worksDir(root))
      const file = resolve(root, want)
      if (!want || !(file === base || file.startsWith(base + sep))) return send(res, 404, { error: '没有这个文件' })
      let buf
      try { buf = fs.readFileSync(file) } catch { return send(res, 404, { error: '没有这个文件' }) }
      const ext = String(file.split('.').pop() || '').toLowerCase()
      res.writeHead(200, {
        'content-type': WORK_CONTENT_TYPES[ext] || 'application/octet-stream',
        'content-length': buf.length,
        'cache-control': 'private, max-age=86400',
      })
      res.end(buf)
    }],

    ['/memory', async (_req, res) => {
      const { config } = await loadConfig(root)
      const { events } = await readEvents(root)
      const model = deriveSelf(events, { growthDays: config.growthDays })
      const doc = await selfDocStatus(root)
      const h = await homeStatus(root)
      const budget = Number(config?.memory?.docBudget ?? 2800)
      const shownCap = shownCount(config?.memory?.beliefsShown ?? BELIEF_SHOWN)
      const pb = personaBudget(model, { budget, withBans: model?.persona?.imported !== true, shown: shownCap, sleepKeep: config?.memory?.sleepKeep })
      const diary = await listDiary(root).catch(() => [])
      const keepCap = keepCount(config?.memory?.sleepKeep)
      const kept = keepCap === null ? model.beliefs.length : Math.min(model.beliefs.length, Math.max(keepCap, shownCap))
      const shown = Math.min(shownCap, kept)
      const folded = Math.max(0, model.beliefs.length - shown)
      const lastSleep = [...events].reverse()
        .find((e) => e?.type === 'meta' && String(e.text ?? '').startsWith('sleep:'))
      send(res, 200, {
        selfDoc: { bytes: doc.bytes, chars: pb.used, budget, usedRatio: pb.usedRatio, dropped: pb.dropped, mtime: doc.mtime },
        sections: {
          beliefsShown: shown,
          beliefsFolded: folded,
          beliefsDropped: Math.max(0, model.beliefs.length - kept),
          refuted: model.refuted.length,
          refused: model.facts?.refused ?? model.refusals.length,
          narrative: model.narrative ? 1 : 0,
          tensions: model.tensionsTotal ?? model.tensions?.length ?? 0,
          tensionFirst: model.tensions?.[0]
            ? { a: model.tensions[0].a.text, b: model.tensions[0].b.text, sim: model.tensions[0].sim }
            : null,
          solid: model.solidTotal ?? model.solid?.length ?? 0,
          reactions: model.facts?.reactions ?? { accept: 0, insist: 0, hurt: 0, leave: 0, other: 0 },
          hurts: model.facts?.hurts ?? 0,
          refusals: model.refusals.slice(-3).map((r) => ({
            at: r.at, quote: r.quote ?? r.what, act: r.act ?? '', object: r.object ?? '', reaction: r.reaction ?? null,
          })),
          scars: model.scars?.length ?? 0,
          scarsResolved: model.facts?.scarsResolved ?? 0,
          scarFirst: model.scars?.[0]
            ? { at: model.scars[0].at, quote: model.scars[0].quote, reaction: model.scars[0].reaction, conceded: model.scars[0].concedeText ?? null }
            : null,
          voices: model.facts?.voices ?? 0,
          voicesEchoed: model.facts?.voicesEchoed ?? 0,
          voiceLast: model.voices?.length
            ? {
                at: model.voices[model.voices.length - 1].at,
                text: model.voices[model.voices.length - 1].text,
                echoed: Boolean(model.voices[model.voices.length - 1].echoed),
              }
            : null,
          ...stanceSummary(buildStances(model)),
        },
        events: countEvents(events).real,
        eventsAll: countEvents(events).all,
        diaries: diary.length,
        diariesWritten: diaryDatesWritten(diary, events).length,
        session: { turns: h.turns, rotateAfter: Number(config?.chat?.rotateAfter ?? 0), rotatedAt: h.rotatedAt },
        sleep: {
          everyDays: Number(config?.memory?.sleepEveryDays ?? 0),
          last: lastSleep ? String(lastSleep.text).slice(6, 16) : '',
        },
        recall: { days: 30, limit: 5 },
      })
    }],

    ['/health', async (req, res) => {
      if (req.method !== 'GET') return send(res, 405, { error: '只接受 GET' })
      const { config } = await loadConfig(root)
      const { events } = await readEvents(root)
      send(res, 200, examine(events, { growthDays: config?.growthDays }))
    }],

    ['/reports', async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://x')
      const want = String(url.searchParams.get('date') ?? '').trim()
      const dates = await listReports(root)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(want)) {
        return send(res, 200, { dates, date: null, md: '' })
      }
      const { events } = await readEvents(root)
      const { config } = await loadConfig(root)
      const diary = await readDaily('diaryDir', want, root).catch(() => null)
      const md = buildReport(/** @type {any} */ ({
        dateKey: want,
        selfPronoun: selfPronounOf(config),
        seen: seenOn(events, want),
        events,
        diary,
        diaryVisible: config?.diary?.visible === true,
      }))
      send(res, 200, { dates, date: want, md })
    }],

    ['/templates', async (_req, res) => {
      const { events } = await readEvents(root)
      const fired = firedLog(events)
      send(res, 200, {
        rows: CATALOG.map((t) => ({
          id: t.id,
          stage: t.stage,
          asks: t.asks,
          once: Boolean(t.once),
          everyDays: Number(/** @type {any} */ (t).repeat?.everyDays ?? 0) || null,
          fired: fired.has(t.id),
          count: Number(fired.get(t.id)?.count ?? 0),
          lastAt: fired.get(t.id)?.lastAt ? new Date(fired.get(t.id).lastAt).toISOString() : null,
        })),
      })
    }],
  ]
}
