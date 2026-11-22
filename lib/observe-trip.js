// @ts-check
/**
 * observe-trip.js —— 出门 / 请神的台账结算、复核与会话恢复逻辑
 *
 * 从 observe.js 拆出：供 /outing 与 /possession 共用，并保持对单测的命名导出。
 */

import { join } from 'node:path'
import { readEvents, appendEvent } from './store.js'
import { loadConfig } from './settings.js'
import { deriveSelf } from './derive.js'
import { validateEvent } from './schema.js'
import { verifyEvents, passesReview, tripEvents, rejectNoteText, reviewPlan } from './outing.js'
import { refreshSelfDoc } from './selfdoc.js'
import { readHomeRecord } from './retire.js'
import { liveAgentOf } from './identity.js'
import { appendNote, queueNote } from './sessionnote.js'
import { logLine } from './log.js'

/**
 * 把一串事件 id 按 `prefix:id id …` 拆成几行，每行 ≤1800 字（issue #68 / PR #80）。
 *
 * @param {string} prefix
 * @param {Iterable<unknown> | null | undefined} ids
 * @returns {string[]}
 */
export function metaIdLines(prefix, ids) {
  const lines = []
  let cur = ''
  for (const raw of ids ?? []) {
    const id = String(raw ?? '').trim()
    if (!id) continue
    if (!cur) { cur = prefix + id; continue }
    if (cur.length + 1 + id.length > 1800) { lines.push(cur); cur = prefix + id; continue }
    cur += ' ' + id
  }
  if (cur) lines.push(cur)
  return lines
}

/**
 * 把一串 id 拆成几行 `prefix id id …` 追加进事件流（出门 / 请神的结算标记共用）。
 *
 * @param {string} root
 * @param {string} prefix
 * @param {string[]} ids
 * @returns {Promise<{ ok: boolean, lines: number, total: number, why?: string }>}
 */
export async function appendIdMarks(root, prefix, ids) {
  const lines = metaIdLines(prefix, ids)
  if (!lines.length) return { ok: true, lines: 0, total: 0 }
  let written = 0
  try {
    const { events } = await readEvents(root)
    const { config } = await loadConfig(root)
    const m = deriveSelf(events, { growthDays: config.growthDays })
    /** @type {import('./types.js').ValidateContext} */
    const ectx = { day: m.day, stage: m.stage, source: 'system' }
    for (const text of lines) {
      await appendEvent(validateEvent({ type: 'meta', text, day: m.day, stage: m.stage }, ectx), ectx, root)
      written += 1
    }
    return { ok: true, lines: written, total: lines.length }
  } catch (err) {
    const why = String(/** @type {any} */ (err)?.message ?? err).slice(0, 120)
    logLine('warn', ['标记没写进事件流', prefix, `${written}/${lines.length}`, why], root)
    return { ok: false, lines: written, total: lines.length, why }
  }
}

/**
 * 出门 / 请神回家那一刻的结算，两条路共用（issue #68）。
 *
 * @param {string} root
 * @param {'outing'|'possess'} prefix
 * @param {any} rec 出门或请神那条 active 台账
 * @param {{ kept?: boolean, rejectedIds?: unknown[] }} b 请求体
 */
export async function settleTripEnd(root, prefix, rec, b) {
  const file = join(root, 'events.jsonl')
  const v = verifyEvents(file, rec?.baseline)
  const tampered = !passesReview(v)
  const tripIds = tripEvents(file, rec).items.map((it) => String(it.id ?? '')).filter(Boolean)
  const inTrip = new Set(tripIds)
  let rejectedIds = [...new Set((Array.isArray(b?.rejectedIds) ? b.rejectedIds : []).map((x) => String(x ?? '')))]
    .filter((id) => inTrip.has(id))
  let autoRejected = false
  if (!rejectedIds.length && b?.kept === false) {
    rejectedIds = tripIds
    autoRejected = true
  }
  const pendingRejectedIds = tampered ? tripIds : []
  const marked = await appendIdMarks(root, `${prefix}-reject:`, tampered ? tripIds : rejectedIds)
  return { v, tampered, rejectedIds, pendingRejectedIds, autoRejected, marked }
}

/**
 * 回家和复核按数据目录排队，一次只结一趟（issue #68）。
 * @type {Map<string, Promise<void>>}
 */
const settleQueues = new Map()

/**
 * @template T
 * @param {string} root
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function settleSerial(root, fn) {
  const key = String(root)
  const prev = settleQueues.get(key) ?? Promise.resolve()
  const run = prev.then(fn)
  const tail = run.then(() => {}, () => {})
  settleQueues.set(key, tail)
  void tail.then(() => { if (settleQueues.get(key) === tail) settleQueues.delete(key) })
  return run
}

/**
 * 台账给界面看的样子：两份 id 名单换成条数（issue #68）。
 * @param {any} rec
 */
export function ledgerBrief(rec) {
  if (!rec || typeof rec !== 'object') return rec
  const { rejectedIds, pendingRejectedIds, ...rest } = rec
  if (rec.status === 'pending') {
    const plan = reviewPlan(rec)
    return { ...rest, dropped: plan.dropped.length, held: plan.held }
  }
  return {
    ...rest,
    dropped: Array.isArray(rejectedIds) ? rejectedIds.length : 0,
    held: Array.isArray(pendingRejectedIds) ? pendingRejectedIds.length : 0,
  }
}

/**
 * 「还没算数」卡要的几样（出门、请神共用）。
 * @param {any} pend 等复核的那条台账
 * @param {any} pv 现在比对的结果（verifyEvents）
 */
export function pendingCard(pend, pv) {
  const plan = reviewPlan(pend)
  const okNow = passesReview(pv)
  const unmarked = pend.marked === false
  return {
    startedAt: Number(pend.startedAt) || 0,
    endedAt: Number(pend.endedAt) || 0,
    checkable: pv.checkable !== false,
    okNow,
    reason: unmarked && okNow ? '回家时「不算」的标记没写进去' : (pv.why || (okNow ? '' : '文件对不上')),
    appended: Number(pv.appended ?? 0),
    held: plan.held,
    dropped: plan.dropped.length,
    autoRejected: pend.autoRejected === true,
    unmarked,
  }
}

/**
 * 复核通过之后的结算，两条路共用（issue #68）。
 *
 * @param {import('./types.js').HostContext} ctx
 * @param {string} root
 * @param {'outing'|'possess'} prefix
 * @param {any} pend
 * @param {(root: string, opts: any) => Promise<any>} settle
 */
export async function settleTripReview(ctx, root, prefix, pend, settle) {
  const plan = reviewPlan(pend)
  if (plan.remark && plan.dropped.length) {
    const re = await appendIdMarks(root, `${prefix}-reject:`, plan.dropped)
    if (!re.ok) return { ok: false, code: 500, why: `「不算」的标记没写进去，这趟还等着核对：${re.why}` }
  }
  const marked = await appendIdMarks(root, `${prefix}-keep:`, plan.keep)
  if (!marked.ok) return { ok: false, code: 500, why: `捞回来的标记没写进去，这趟还等着核对：${marked.why}` }
  const rejectAll = pend.autoRejected === true
  const r = await settle(root, {
    sessionId: pend.sessionId,
    startedAt: pend.startedAt,
    status: rejectAll ? 'rejected' : 'done',
    kept: !rejectAll,
    rejectedIds: plan.dropped,
    marked: true,
  })
  if (!r.ok) return { ok: false, code: 409, why: r.why }
  await refreshSelfDoc(root).catch(() => {})
  /** @type {{ ok: boolean, why?: string, delivered?: boolean, queued?: boolean }} */
  let note = { ok: false, why: '这趟没有要驳回的' }
  if (plan.dropped.length) note = await rejectNoteToHome(ctx, root, { trip: pend, rejectedIds: plan.dropped, auto: rejectAll })
  return { ok: true, settled: r, note, kept: plan.keep.length, dropped: plan.dropped.length }
}

/**
 * 复核请求带着卡上那一趟的 sessionId / startedAt 时，跟这次取到的那趟对一下（issue #68）。
 * @param {any} pend
 * @param {any} b
 * @returns {string}
 */
export function reviewTargetMismatch(pend, b) {
  if (b?.sessionId && String(pend.sessionId) !== String(b.sessionId)) return '等着核对的不是这一趟'
  if (b?.startedAt !== undefined && b?.startedAt !== null && b?.startedAt !== '' &&
      Number(pend.startedAt) !== Number(b.startedAt)) {
    return '等着核对的不是卡上那一趟（可能另一个窗口刚核对过），刷新后再看'
  }
  return ''
}

/**
 * 把一条已经存在的会话恢复成活的 agent（0.6.27，用户 m03372）。
 * @param {any} sc
 * @param {string} sessionId
 */
export async function resolveSessionAgent(sc, sessionId) {
  const got = typeof sc?.resolveAgent === 'function'
    ? await sc.resolveAgent(sessionId)
    : (typeof sc?.agents?.resolveAgent === 'function' ? await sc.agents.resolveAgent(sessionId) : null)
  if (got === null) throw new Error('宿主没有 sessionController.resolveAgent，接不回上次那条会话')
  if (got?.error) throw got.error
  if (!got?.agent) throw new Error('宿主说恢复好了，但没把那条会话的 agent 交出来')
  return got.agent
}

/**
 * 驳回要讲给她听（设计 §3.7）：写进**家里**那条会话；没开着就排队。
 *
 * @param {import('./types.js').HostContext} ctx
 * @param {string} root
 * @param {{ trip?: any, rejectedIds?: string[], auto?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean, why?: string, delivered?: boolean, queued?: boolean }>}
 */
export async function rejectNoteToHome(ctx, root, { trip = null, rejectedIds = [], auto = false } = {}) {
  if (!trip?.startedAt || !Array.isArray(rejectedIds) || !rejectedIds.length) {
    return { ok: false, why: '这趟没有要驳回的' }
  }
  try {
    const want = new Set(rejectedIds.map((x) => String(x)))
    const picked = tripEvents(join(root, 'events.jsonl'), trip)
      .items.filter((it) => want.has(it.id))
    const text = rejectNoteText(/** @type {any} */ ({ items: picked, total: rejectedIds.length, auto }))
    if (!text) return { ok: false, why: '没有要驳回的' }
    const rec = await readHomeRecord(root).catch(() => null)
    const homeAgent = liveAgentOf(ctx, rec?.sessionId || '')
    if (homeAgent) {
      const w = appendNote(homeAgent, text)
      return { ok: w.ok, why: w.why ?? '', delivered: Boolean(w.ok) }
    }
    const q = await queueNote(root, text)
    return { ok: q.ok, why: q.why ?? '', delivered: false, queued: Boolean(q.ok) }
  } catch (err) {
    return { ok: false, why: String(/** @type {any} */ (err)?.message ?? err).slice(0, 120) }
  }
}

/**
 * 比对路径用：Windows 大小写不敏感。只比对，不做文件访问。
 * @param {unknown} p
 */
export function pathKey(p) {
  const s = String(p ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? s.toLowerCase() : s
}

/**
 * 目标工作区是不是本插件的源码目录。
 * @param {unknown} p
 */
export function isPluginSource(p) {
  const k = pathKey(p)
  if (!k) return false
  return k.includes('/大肥鱼') || k.includes('/fish-plugin') || k.includes('/plugin')
}

/**
 * 出门首轮的那句话。只交代在哪、能用什么、别动什么。
 * @param {string} where
 */
export function outingWakeText(where) {
  return [
    `你出门了。这里是「${where}」的地盘，不是你自己的屋子。`,
    '这趟可以放开用手边的工具做事，做完再回去。',
    '只有一件：我自己屋子里的文件和记录不要动——那是家里的账本和家谱，不是这趟该碰的。',
    '工具不是屋子里的东西。这条对话给我什么，我就用什么；用它写下的东西照样记在我自己的账上，那是应该的，不是越界。',
    '有人会在这里跟你说话。等家里人叫你回去，你就回去。',
  ].join('\n')
}
