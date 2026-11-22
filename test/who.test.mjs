import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWho, validateEvent, WHO_TYPES, WHO_NAME_MAX } from '../lib/schema.js'
import { commentsFrom, chooseVoice } from '../lib/voices.js'
import { declareSource, declaredSpeaker, clearDeclaredSources } from '../lib/turns.js'

// 谁说的（1.0.8，认识人 S1，2026-11-22）
//
// 这一步只做一件事：把「这句话是谁说的」从桥和抓取层搬进事件流。
// 为什么单独一批测试守着：`who` 一旦被写成别的东西（比如让她自己声明、
// 或者拿它当评价分数），「认识人」这件事就会长歪——所以这里只允许两个值，
// 一个稳定的 id、一个会变的名字，别的都不收。

// ------------------------------------------------------------------ 归一化

test('归一化：两边都空就没有这个人，不是空对象', () => {
  assert.equal(normalizeWho(null), null)
  assert.equal(normalizeWho(undefined), null)
  assert.equal(normalizeWho('老王'), null)
  assert.equal(normalizeWho([]), null)
  assert.equal(normalizeWho({}), null)
  assert.equal(normalizeWho({ id: '   ', name: '  ' }), null)
})

test('归一化：名字压空白、去控制符、截断；id 只去控制符', () => {
  assert.deepEqual(normalizeWho({ id: ' owner ', name: '  老  王 ' }), { id: 'owner', name: '老 王' })
  assert.equal(normalizeWho({ id: '', name: 'x'.repeat(200) }).name.length, WHO_NAME_MAX)
  assert.equal(normalizeWho({ id: 'bili:1', name: '\u0000老\u0007王' }).name, '老 王')
  assert.deepEqual(normalizeWho({ id: 'bili:42' }), { id: 'bili:42', name: '' })
})

test('归一化：只有名字也能落——id 留空，不编一个出来', () => {
  assert.deepEqual(normalizeWho({ name: '老王' }), { id: '', name: '老王' })
})

// ------------------------------------------------------------------ 落库口径

test('只有三类事件谈得上「谁说的」', () => {
  assert.deepEqual([...WHO_TYPES].sort(), ['heard', 'utterance', 'voice'])
})

test('voice/heard/utterance 会落 who，别的类型一律丢掉', () => {
  const base = { source: 'system', text: '一句话', refs: [] }
  for (const type of WHO_TYPES) {
    const ev = validateEvent({ ...base, type, who: { id: 'bili:7', name: '老王' } }, { day: 1, stage: 1, source: 'system' })
    assert.deepEqual(ev.who, { id: 'bili:7', name: '老王' }, `${type} 应该带上 who`)
  }
  for (const type of ['meta', 'refusal']) {
    const ev = validateEvent({ ...base, type, who: { id: 'bili:7', name: '老王' } }, { day: 1, stage: 1, source: 'system' })
    assert.equal('who' in ev, false, `${type} 不该带 who`)
  }
})

test('没有 who 就不落这个键（老事件的形状不变）', () => {
  const ev = validateEvent({ source: 'system', type: 'voice', text: '一句话', refs: [] }, { day: 1, stage: 1, source: 'system' })
  assert.equal('who' in ev, false)
})

test('who 洗一遍才落：控制符进不去，空名字不留', () => {
  const ev = validateEvent(
    { source: 'system', type: 'voice', text: '一句话', refs: [], who: { id: 'bili:7', name: ' 老\u0001王 ' } },
    { day: 1, stage: 1, source: 'system' },
  )
  assert.deepEqual(ev.who, { id: 'bili:7', name: '老 王' })
})

// ------------------------------------------------------------------ 抓取层搬上来

test('摊平评论时把作者带出来（原来 mid 和昵称在这里就丢了）', () => {
  const list = commentsFrom([{
    video: { bvid: 'BV1' },
    comments: [
      { text: '这条评论有足够长度', like: 12, mid: 42, user: '老王' },
      { text: '这条只有一个昵称也够长', like: 3, user: '小李' },
      { text: '这条什么都没有但有长度', like: 1 },
    ],
  }])
  assert.deepEqual(list[0].who, { id: 'bili:42', name: '老王' })
  assert.deepEqual(list[1].who, { id: '', name: '小李' })
  assert.equal('who' in list[2], false)
})

test('选中的那条仍然带着作者（三级优先都不该把它抖掉）', () => {
  const list = commentsFrom([{
    video: { bvid: 'BV1' },
    comments: [{ text: '这条评论有足够长度', like: 99999, mid: 42, user: '老王' }],
  }])
  const picked = chooseVoice(list, { rng: () => 0 })
  assert.deepEqual(picked.who, { id: 'bili:42', name: '老王' })
  assert.equal(picked.why, 'liked')
})

// ------------------------------------------------------------------ 桥那边

test('桥报的说话人按 rpcId 查得回来', () => {
  clearDeclaredSources()
  declareSource({ rpcId: 'r1', scene: 'group', owner: false, speakerId: 'bili:99', speakerName: '路人' })
  assert.deepEqual(declaredSpeaker({ source: { rpcId: 'r1' } }), { id: 'bili:99', name: '路人' })
})

test('桥没报说话人时，群里那句按「他本人」算；别处就是不知道', () => {
  clearDeclaredSources()
  declareSource({ rpcId: 'r2', scene: 'group', owner: true })
  assert.deepEqual(declaredSpeaker({ source: { rpcId: 'r2' } }, { owner: true }), { id: 'owner', name: '' })
  assert.equal(declaredSpeaker({ source: { rpcId: 'r2' } }), null)
  assert.equal(declaredSpeaker({ source: {} }), null)
  assert.equal(declaredSpeaker(undefined), null)
})
