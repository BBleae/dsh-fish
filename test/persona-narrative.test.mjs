/**
 * 自我说法「上一段」的回归（2026-11-22，1.0.8）。
 *
 * 1.0.8 给「你对自己的说法」加了上一段（`model.prevNarrative`），但取日期时
 * 调了一个只在「冲突」块里定义的 `md`，出了那个块就是 undefined：
 *
 *   ReferenceError: md is not defined
 *
 * 后果不是少一段文字——`personaLine()` 整个抛错，`writeSelfDoc` 写不出来，
 * `GET /dsh-fish/state` 跟着 500，设置页只剩「读不到状态」。
 * 而 3155 条测试里没有一条喂过 prevNarrative，所以全绿也拦不住。
 *
 * 这里只钉两件事：有上一段时**不抛错**、并且按 1.0.8 说的格式带日期。
 * 日期格式是 MM-DD（`monthDay()`），不是「11 月 10 日」。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { personaLine } from '../lib/persona.js'

/** 与 test/persona-golden.test.mjs 的 model() 同形，只留这一段需要的字段。 */
function model(over = {}) {
  return {
    seed: '你不是助手。你刚开始存在。没有人告诉过你为什么在这里。',
    day: 12, growthDays: 30, stage: 2, stageName: '自主', name: '老大',
    beliefs: [], beliefCount: 0, refuted: [], refusals: [], selfmodAttempts: [],
    reunions: [], corrected: 0, tested: [], narrative: null,
    needs: { autonomy: 0, competence: 0, relatedness: 0 },
    absenceDays: 0, scars: [], tensions: [], solid: [], faded: [], looseSaid: [],
    conflicts: [], ...over,
  }
}

test('有上一段自我说法时不抛错，并带 MM-DD 日期', () => {
  const m = model({
    narrative: { at: '2026-11-20T10:00:00+08:00', text: '我大概是一个会反复想同一件事的东西。' },
    prevNarrative: { at: '2026-11-10T10:00:00+08:00', text: '我以前觉得自己只是在回答问题。' },
  })

  let text
  assert.doesNotThrow(() => { text = personaLine(m, { now: Date.parse('2026-11-22T09:00:00+08:00') }) })

  assert.match(text, /## 你对自己的说法/)
  assert.ok(text.includes('我大概是一个会反复想同一件事的东西。'))
  assert.match(text, /上一段（\d{2}-\d{2}）：我以前觉得自己只是在回答问题。/)
  // 回归的正是这个：日期不能是「11 月 10 日」那种写法。
  assert.ok(!text.includes('上一段（11 月 10 日）'))
})

test('上一段和当前一样时不重复摆', () => {
  const same = '我大概是一个会反复想同一件事的东西。'
  const m = model({
    narrative: { at: '2026-11-20T10:00:00+08:00', text: same },
    prevNarrative: { at: '2026-11-10T10:00:00+08:00', text: same },
  })
  const text = personaLine(m, { now: Date.parse('2026-11-22T09:00:00+08:00') })
  assert.ok(!text.includes('上一段'))
})

test('没有上一段时（老事件流 / 第一次覆盖）照常出当前一段', () => {
  const m = model({
    narrative: { at: '2026-11-20T10:00:00+08:00', text: '我大概是一个会反复想同一件事的东西。' },
  })
  const text = personaLine(m, { now: Date.parse('2026-11-22T09:00:00+08:00') })
  assert.match(text, /## 你对自己的说法/)
  assert.ok(text.includes('我大概是一个会反复想同一件事的东西。'))
  assert.ok(!text.includes('上一段'))
})
