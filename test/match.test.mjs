/**
 * match.test.mjs —— 新材料 × 还悬着的事（1.0.8，C/D/H）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  matchScore,
  pickMatch,
  pickForText,
  recordShown,
  materialsOf,
  matchesOn,
  seedMatch,
  shownToday,
  canShowMore,
  dayMax,
  blockedCached,
  resetMatchState,
  cooldownDays,
} from '../lib/match.js'
import { appendEvent, readEvents } from '../lib/store.js'
import { logFile } from '../lib/log.js'
import { readFileSync } from 'node:fs'
import { writeNotes } from '../lib/note.js'
import { dateKey, updateConfig } from '../lib/settings.js'

async function withRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), 'fish-match-'))
  resetMatchState()
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('matchScore：共享二字组够多、覆盖过半才算碰上', () => {
  const hit = matchScore('为什么海水看起来是蓝色的？', '海水看起来发蓝，是因为阳光里的蓝光散得最开')
  assert.ok(hit)
  assert.equal(hit.score >= 0.4, true)
  assert.equal(matchScore('为什么海水看起来是蓝色的？', '今天晚饭吃面'), null)
  // 只撞一个常见词不算
  assert.equal(matchScore('今天有点累', '今天天气不错'), null)
})

test('pickMatch：分高的优先，同分取更新的材料，冷却表里的跳过', () => {
  const loops = [
    { kind: 'note', id: 'n1', text: '为什么海水看起来是蓝色的？' },
    { kind: 'note', id: 'n2', text: '想问问鲸鱼会不会做梦' },
  ]
  const materials = [
    { id: 'ev_a', text: '海水看起来发蓝，是因为蓝光散得最开', at: 1 },
    { id: 'ev_b', text: '海水看起来是蓝的，其实水本身没有颜色', at: 2 },
  ]
  const best = pickMatch({ loops, materials, now: 10 })
  assert.equal(best.kind, 'note')
  assert.equal(best.materialId, 'ev_b')
  const blocked = new Set([`${best.key}\u0000ev_b`, `${best.key}\u0000ev_a`])
  assert.equal(pickMatch({ loops, materials, now: 10, blocked }), null)
})

test('materialsOf：只要最近两天、有正文的 voice / heard', () => {
  const now = Date.now()
  const list = materialsOf([
    { id: 'a', type: 'voice', text: '海水看起来发蓝，是因为蓝光散得最开', at: new Date(now - 60_000).toISOString() },
    { id: 'b', type: 'heard', text: '他说的这句', at: new Date(now - 60_000).toISOString() },
    { id: 'c', type: 'voice', text: '海水看起来发蓝，是因为蓝光散得最开', at: new Date(now - 3 * 86400_000).toISOString() },
  ], { now })
  assert.deepEqual(list.map((m) => m.id), ['a'])
})

test('pickForText + recordShown：摆过一次就留 cmatch、进冷却、当日计数 +1', async () => {
  await withRoot(async (root) => {
    await appendEvent({ type: 'voice', text: '海水看起来发蓝，是因为蓝光散得最开' }, { source: 'system' }, root)
    const { events } = await readEvents(root)
    seedMatch({ root, events })

    const loops = [{ kind: 'note', id: 'n1', text: '为什么海水看起来是蓝色的？' }]
    const best = pickForText({ text: '海水看起来发蓝，是因为蓝光散得最开', loops })
    assert.ok(best)
    assert.match(best.loop, /海水/)

    await recordShown({ root, best })
    const after = await readEvents(root)
    assert.ok(after.events.some((e) => e.type === 'meta' && String(e.text).startsWith('cmatch:')))
    assert.equal(matchesOn(after.events, dateKey(new Date())), 1)
    assert.equal(shownToday(), 1)
    assert.equal(blockedCached(root).has(`${best.key}\u0000${best.materialId}`), true)

    // 同一对进了冷却，当天再问就是 null
    assert.equal(pickForText({ text: '海水看起来发蓝，是因为蓝光散得最开', loops, blocked: blockedCached(root) }), null)

    const logged = readFileSync(logFile(root), 'utf8')
    assert.match(logged, /today=1/)
    assert.match(logged, /hits=1/)
  })
})

test('dayMax：默认 2，代码级可调，钳 1–5', async () => {
  assert.equal(dayMax(), 2)
  await withRoot(async (root) => {
    await updateConfig({ match: { dayMax: 5 } }, root)
    assert.equal(dayMax(), 5)
    await updateConfig({ match: { dayMax: 99 } }, root)
    assert.equal(dayMax(), 5)
    await updateConfig({ match: { dayMax: 0 } }, root)
    assert.equal(dayMax(), 1)
    await updateConfig({ match: { dayMax: '' } }, root)
    assert.equal(dayMax(), 2)
  })
})

test('canShowMore：到日上限就 false，seedMatch 换天会归零', async () => {
  await withRoot(async (root) => {
    const now = Date.now()
    seedMatch({ root, events: [] })
    assert.equal(canShowMore(now), true)
    const best = {
      kind: 'note',
      id: 'n1',
      key: 'note\u0000k',
      loop: '为什么海水看起来是蓝色的？',
      materialId: 'turn:x',
      material: '海水看起来发蓝',
      score: 0.9,
    }
    await recordShown({ root, best, now })
    await recordShown({ root, best: { ...best, materialId: 'turn:y' }, now })
    assert.equal(shownToday(now), 2)
    assert.equal(canShowMore(now), false)
    // 换一天：从事件里恢复的次数是 0
    const { events } = await readEvents(root)
    seedMatch({ root, events, now: now + 86400_000 })
    assert.equal(shownToday(now + 86400_000), 0)
    assert.equal(canShowMore(now + 86400_000), true)
  })
})

test('冷却天数：config.match.cooldownDays 可调，默认 3、0 不冷却、上限 14', async () => {
  await withRoot(async (root) => {
    assert.equal(cooldownDays(), 3)
    await updateConfig({ match: { cooldownDays: 0 } }, root)
    assert.equal(cooldownDays(), 0)
    await updateConfig({ match: { cooldownDays: 99 } }, root)
    assert.equal(cooldownDays(), 14)
    await updateConfig({ match: { cooldownDays: '' } }, root)
    assert.equal(cooldownDays(), 3)
  })
})

test('blockedFrom：三天内摆过的同一对进冷却，过期放开', async () => {
  await withRoot(async (root) => {
    const now = Date.now()
    await appendEvent({ type: 'meta', text: `cmatch:${new Date(now - 3600_000).toISOString()} k1 material:1` }, { source: 'system' }, root)
    await appendEvent({ type: 'meta', text: `cmatch:${new Date(now - 4 * 86400_000).toISOString()} k2 material:2` }, { source: 'system' }, root)
    const { events } = await readEvents(root)
    seedMatch({ root, events, now })
    const set = blockedCached(root, now)
    assert.equal(set.has('k1\u0000material:1'), true)
    assert.equal(set.has('k2\u0000material:2'), false)
  })
})

test('writeNotes 的便条能被 pickForText 撞上（悬着的五路之一）', async () => {
  await withRoot(async (root) => {
    await writeNotes(root, [{ id: 'n1', text: '为什么海水看起来是蓝色的？', status: 'open', created: new Date().toISOString() }])
    const best = pickForText({
      text: '海水看起来发蓝，是因为蓝光散得最开',
      loops: [{ kind: 'note', id: 'n1', text: '为什么海水看起来是蓝色的？' }],
    })
    assert.ok(best)
    assert.equal(best.kind, 'note')
  })
})
