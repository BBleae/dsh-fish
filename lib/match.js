/**
 * match.js —— 新材料碰上她手上还悬着的事（1.0.8，C）
 *
 * 1.0.7 把「悬着的事」收成了一张清单（loops.js），但那张清单只在好奇/便条/约定
 * 各自的地方用；新材料进来（她读到的一段话、他新说的一句）不会自动去碰它。
 * 这一层就是那个「便宜的后台」：纯字符串比对，不调模型、不花 token，只在真碰上
 * 的时候留一行给她下一轮看。
 *
 * 设计边界：
 *   - 只比对「最近还悬着的」（openLoops，最多 20 条）和「最近 48 小时的新材料」；
 *   - 阈值：共享二字组 ≥ 3 且覆盖到那件事的一半以上，宁缺勿滥；
 *   - 只在两个当轮入口比对：他开口那一轮（cue.js 的 flashFor）、她读到材料那一刻
 *     （materialFlash，附在工具结果末尾）；不另开一轮，也不事后补摆（用户 m02704）；
 *   - 一天最多摆 `config.match.dayMax` 次，同一对冷却 `cooldownDays` 天（D）；
 *   - 只摆原话，不解释为什么像、不给分数、不催她去看（黑名单：不读自身数值）。
 */

import { appendEvent } from './store.js'
import { logLine } from './log.js'
import { dateKey, configCache } from './settings.js'

/** 只碰最近两天的材料。更老的，她自己有 her_recall。 */
export const MATCH_WINDOW_MS = 48 * 60 * 60_000
/**
 * 同一件事 × 同一份材料，隔几天才允许再摆一次（`config.match.cooldownDays`）。
 * 默认 3 天；0 = 不冷却；上限 14 天。没有独立的设置项——这个数只有看得懂
 * 「一件事被一份材料碰到之后隔多久再提」的人才会去改，放进设置页反而误导。
 */
export const MATCH_COOLDOWN_DAYS = 3
export const MATCH_COOLDOWN_MAX_DAYS = 14
export function cooldownDays() {
  const raw = configCache()?.match?.cooldownDays
  if (raw === undefined || raw === null || raw === '') return MATCH_COOLDOWN_DAYS
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n)) return MATCH_COOLDOWN_DAYS
  return Math.max(0, Math.min(MATCH_COOLDOWN_MAX_DAYS, n))
}

/**
 * 一天最多摆几次（`config.match.dayMax`，默认 2，0 不设上限? —— 不，最少 1）。
 * 用户 m02704：E 一开，一天撞上三五件事就可能连着摆，那会变成骚扰，所以给个日上限。
 * 代码级配置，不放进设置页（和冷却天数同一个理由）。
 */
export const MATCH_DAY_MAX = 2
export const MATCH_DAY_MAX_MAX = 5
export function dayMax() {
  const raw = configCache()?.match?.dayMax
  if (raw === undefined || raw === null || raw === '') return MATCH_DAY_MAX
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n)) return MATCH_DAY_MAX
  return Math.max(1, Math.min(MATCH_DAY_MAX_MAX, n))
}

let shown = { dk: '', n: 0 }
let blockedCache = { root: '', set: new Set(), at: 0 }

/** 轮次结账时把「今天摆了几次」和「哪些对还在冷却」一次性读进内存。 */
export function seedMatch({ root = '', events = [], now = Date.now() } = {}) {
  const dk = dateKey(new Date(now))
  shown = { dk, n: matchesOn(events, dk) }
  blockedCache = { root: String(root ?? ''), set: blockedFrom(events, now), at: now }
}

export function shownToday(now = Date.now()) {
  const dk = dateKey(new Date(now))
  if (shown.dk !== dk) shown = { dk, n: 0 }
  return shown.n
}

export function canShowMore(now = Date.now()) {
  return shownToday(now) < dayMax()
}

/** 同步取一份冷却集合；换了屋子或太旧就当没有。 */
export function blockedCached(root = '', now = Date.now()) {
  if (String(root ?? '') !== blockedCache.root) return new Set()
  if (now - blockedCache.at > MATCH_WINDOW_MS) return new Set()
  return blockedCache.set
}

/** 一句话 × 还悬着的事：人开口那一轮用这个（同步）。 */
export function pickForText({ text = '', loops = [], blocked = new Set(), now = Date.now() } = {}) {
  const t = String(text ?? '').trim()
  if (!t) return null
  return pickMatch({
    loops,
    materials: [{ id: `turn:${hashOf(t)}`, text: t, at: now }],
    now,
    blocked,
  })
}

/**
 * 真摆出去之后记账：写 `cmatch:`、加今天那一次、把这一对放进冷却。
 * 用户 m02704：「算她看到过」——冷却和每日计数按「摆过」记，避免同一段材料每轮重复附。
 */
export async function recordShown({ root, best, now = Date.now() } = {}) {
  if (!root || !best?.key) return false
  try {
    await appendEvent(
      { type: 'meta', text: `cmatch:${new Date(now).toISOString()} ${best.key} ${best.materialId}` },
      { source: 'system' },
      root,
    )
  } catch { /* 记不下也不挡这一行 */ }
  const today = shownToday(now) + 1
  shown = { dk: dateKey(new Date(now)), n: today }
  // 先把这间屋子认下来：materialFlash 第一次记录时 blockedCache.root 还是空的，
  // 不认的话下一次取冷却集合会当成「换了屋子」，同一对会再附一次。
  blockedCache.root = String(root)
  blockedCache.at = now
  blockedCache.set.add(`${best.key}\u0000${best.materialId}`)
  try {
    const dk = dateKey(new Date(now))
    if (today === 1) logLine('info', ['match', 'day', dk, 'hits=1'], root)
    logLine(
      'info',
      ['match', 'hit', `kind=${best.kind}`, `score=${best.score.toFixed(2)}`, `material=${best.materialId}`, `today=${today}`],
      root,
    )
  } catch { /* 日志挂了不挡 match */ }
  return true
}

/** 测试用：清掉内存里的计数与冷却。 */
export function resetMatchState() {
  shown = { dk: '', n: 0 }
  blockedCache = { root: '', set: new Set(), at: 0 }
}

/** 摆出去的一行最多这么长（码点）。 */
export const MATCH_TEXT_MAX = 60
/** 至少共享三个有信息量的二字组。 */
export const MATCH_MIN_SHARED = 3
/** 共享词要覆盖到那件事的一半，光撞一个常见词不算。 */
export const MATCH_MIN_RATIO = 0.4

const STOP_BI = new Set([
  '什么', '不是', '可以', '我们', '你们', '他们', '这个', '那个', '时候',
  '知道', '觉得', '一个', '没有', '就是', '还是', '因为', '所以', '但是',
  '如果', '真的', '自己', '事情', '东西', '现在', '已经', '一点', '有点',
  '怎么', '这样', '那样', '可能', '应该', '需要', '喜欢', '不要', '不会',
])

function bigrams(s) {
  const chars = [...String(s ?? '').replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, '')]
  const out = new Set()
  for (let i = 0; i + 1 < chars.length; i++) {
    const g = chars[i] + chars[i + 1]
    if (!STOP_BI.has(g)) out.add(g)
  }
  return out
}

function clipText(s, n = MATCH_TEXT_MAX) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return [...t].length > n ? `${[...t].slice(0, n).join('')}…` : t
}

function msOf(v, fallback) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const t = Date.parse(String(v ?? ''))
  return Number.isFinite(t) ? t : fallback
}

/** 稳定的小哈希，只用来给冷却记录当键。 */
function hashOf(s) {
  let h = 5381
  for (const ch of String(s ?? '')) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0
  return h.toString(36)
}

/**
 * 纯函数：一件事的文字和一份材料碰得多紧。
 * @returns {{ score: number, shared: number }|null}
 */
export function matchScore(loopText, materialText) {
  const a = bigrams(loopText)
  if (a.size < MATCH_MIN_SHARED) return null
  const b = bigrams(materialText)
  if (!b.size) return null
  let shared = 0
  for (const g of a) if (b.has(g)) shared++
  if (shared < MATCH_MIN_SHARED) return null
  const ratio = shared / a.size
  if (ratio < MATCH_MIN_RATIO) return null
  return { score: ratio, shared }
}

/**
 * 从清单和材料里挑一条最该摆的。纯函数，便于单测。
 * @returns {{ kind: string, id: string, loop: string, materialId: string, material: string, at: number, score: number }|null}
 */
export function pickMatch({ loops = [], materials = [], now = Date.now(), blocked = new Set() } = {}) {
  let best = null
  for (const loop of loops) {
    const text = String(loop?.text ?? '').trim()
    if (!text) continue
    const key = `${loop?.kind ?? ''}\u0000${hashOf(text)}`
    for (const m of materials) {
      const mt = String(m?.text ?? '').trim()
      if (!mt) continue
      if (blocked.has(`${key}\u0000${m?.id ?? ''}`)) continue
      const hit = matchScore(text, mt)
      if (!hit) continue
      const cand = {
        kind: String(loop?.kind ?? ''),
        id: String(loop?.id ?? ''),
        loop: clipText(text),
        materialId: String(m?.id ?? ''),
        material: clipText(mt),
        at: msOf(m?.at, now),
        score: hit.score,
        key,
      }
      if (!best) { best = cand; continue }
      if (cand.score > best.score) best = cand
      else if (cand.score === best.score && cand.at > best.at) best = cand
    }
  }
  return best
}

/** 冷却记录：近 14 天的 `cmatch:`，同一对不再摆（冷却天数见 `cooldownDays()`）。 */
function blockedFrom(events, now) {
  const blocked = new Set()
  const ms = cooldownDays() * 24 * 60 * 60_000
  if (ms <= 0) return blocked
  for (const e of events ?? []) {
    const t = String(e?.text ?? '')
    if (e?.type !== 'meta' || !t.startsWith('cmatch:')) continue
    const parts = t.split(/\s+/)
    if (parts.length < 3) continue
    const at = Date.parse(parts[0].slice('cmatch:'.length))
    if (!(now - at <= 14 * 24 * 60 * 60_000)) continue
    if (now - at < ms) blocked.add(`${parts[1]}\u0000${parts[2]}`)
  }
  return blocked
}

/** 最近的、像「材料」的东西：她读到的和他说的。 */
export function materialsOf(events = [], { now = Date.now() } = {}) {
  return (events ?? [])
    .filter((e) => (e?.type === 'voice' || e?.type === 'heard') && e?.text)
    .map((e) => ({ id: String(e.id ?? ''), text: String(e.text), at: msOf(e.at, now) }))
    .filter((m) => m.id && [...String(m.text).trim()].length >= 8 && now - m.at <= MATCH_WINDOW_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, 80)
}

/** 诊断用：今天命中了几次（只读 `cmatch:`，给 H 的每日计数）。 */
export function matchesOn(events = [], dk = dateKey(new Date())) {
  let n = 0
  for (const e of events ?? []) {
    if (e?.type !== 'meta') continue
    const t = String(e.text ?? '')
    if (!t.startsWith('cmatch:')) continue
    const at = Date.parse(t.split(/\s+/)[0].slice('cmatch:'.length))
    if (dateKey(new Date(at)) === dk) n++
  }
  return n
}
