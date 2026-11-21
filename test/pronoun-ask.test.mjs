/**
 * pronoun-ask.test.mjs —— 「我该怎么称呼你」这张卡（issue #127 C 案，2026-11-12）
 *
 * 这里钉的是三条边界：
 *   1. 只有三个值本身能落地（他 / 她 / TA），别的一概不写——猜错一次，她的整份身份文档就写错；
 *   2. 问过就记一笔，三十天内不再问；同一天问过还没答，也不重复弹；
 *   3. 人的选择落在 config.owner.pronoun 上，卡片接走时走的是同一条路（cardanswer）；
 *   4. 卡被别的插件接走（RELAYED）时回执照实说问到了、送到哪儿、还没答，不报「没问上」。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readConfig, readEvents } from '../lib/store.js'
import { loadConfig } from '../lib/settings.js'
import { HER_TOOLS } from '../lib/restrict.js'
import { renderSelfDoc } from '../lib/selfdoc.js'
import { deriveSelf } from '../lib/derive.js'
import { answerCard } from '../lib/cardanswer.js'
import {
  PRONOUN_ASK_BRIEF,
  PRONOUN_ASK_COOLDOWN_MS,
  applyPronounAnswer,
  pronounAskGate,
  pronounAskState,
  registerPronounAsk,
} from '../lib/pronounask.js'

async function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), 'fish-pronoun-ask-'))
  try {
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'events.jsonl'), '', 'utf8')
    return await fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}

/** 直接写一条 meta（模拟「问过」或「答过」那一侧已经落下的状态）。 */
function seedMeta(root, { id, text, ts = new Date(), day = 1 }) {
  const ev = {
    id,
    v: 1,
    ts: ts.toISOString(),
    day,
    stage: 1,
    type: 'meta',
    source: 'system',
    text,
    refs: [],
    verdict: null,
    confidence: 0.5,
    flags: [],
  }
  appendFileSync(join(root, 'events.jsonl'), `${JSON.stringify(ev)}\n`, 'utf8')
  return ev
}

test('落地：写配置 + 记一笔，只认三个值本身', async () => withRoot(async (root) => {
  const w = await applyPronounAnswer(root, 'ev_q1', '她')
  assert.equal(w.ok, true)
  assert.equal(w.value, '她')
  const { config } = await loadConfig(root)
  assert.equal(config.owner.pronoun, '她')

  const { events } = await readEvents(root)
  const mark = events.find((e) => String(e.text ?? '').startsWith('pronoun:'))
  assert.ok(mark, '人的选择要留在事件流里，她下次翻得到')
  assert.match(String(mark.text), /^pronoun:她 ev_q1$/)

  // 回退成默认：同一个入口，不额外开一条路
  assert.equal((await applyPronounAnswer(root, 'ev_q2', '他')).ok, true)
  assert.equal((await loadConfig(root)).config.owner.pronoun, '他')
}))

test('不猜：不在三个值里的，一个字都不写', async () => withRoot(async (root) => {
  for (const bad of ['她呀', '', '  ', '他/她', 'she']) {
    const w = await applyPronounAnswer(root, 'ev_x', bad)
    assert.equal(w.ok, false, `「${bad}」不该落地`)
  }
  const { config } = await loadConfig(root)
  assert.equal(config.owner.pronoun, '他', '认不出来就保持原样')
  const { events } = await readEvents(root)
  assert.equal(events.length, 0, '没落地就不留痕，卡片那边还开着')
}))

test('问过就别缠着：三十天内不再问，没答的当天不重复弹', async () => withRoot(async (root) => {
  const now = Date.now()
  // 问过、还没答
  seedMeta(root, { id: 'ev_q1', text: 'ask-pronoun', ts: new Date(now - 3600 * 1000), day: 3 })
  const g1 = pronounAskGate((await readEvents(root)).events, now)
  assert.equal(g1.ok, false)
  assert.match(g1.why, /还没等到/)

  // 答了：三十天内不再问，并且念出上次答的是什么
  seedMeta(root, { id: 'ev_q2', text: 'pronoun:她 ev_q1', ts: new Date(now - 3600 * 1000), day: 3 })
  const g2 = pronounAskGate((await readEvents(root)).events, now)
  assert.equal(g2.ok, false)
  assert.match(g2.why, /她/)

  // 过了冷却期：可以再问一次（把时钟拨到三十天之后）
  const g3 = pronounAskGate((await readEvents(root)).events, now + PRONOUN_ASK_COOLDOWN_MS + 1000)
  assert.equal(g3.ok, true, '过了三十天应该还能问')
}))

test('卡片接走时也走同一条路：pronoun:<问的那次 id>', async () => withRoot(async (root) => {
  seedMeta(root, { id: 'ev_asked', text: 'ask-pronoun', day: 4 })
  const r = await answerCard(root, { id: 'pronoun:ev_asked', selected: ['TA'] })
  assert.equal(r.ok, true)
  assert.equal((await loadConfig(root)).config.owner.pronoun, 'TA')

  // 已经答过的那张卡：再答一次不该改回去（卡只认一次）
  const again = await answerCard(root, { id: 'pronoun:ev_asked', selected: ['她'] })
  assert.equal(again.ok, true, '同一条路，重复答也只按最后一次落地')
  assert.equal((await loadConfig(root)).config.owner.pronoun, '她')

  // 没这个选项：不落地、不猜
  const bad = await answerCard(root, { id: 'pronoun:ev_asked', selected: ['随便'] })
  assert.equal(bad.ok, false)
  assert.match(bad.why, /他 \/ 她 \/ TA/)
}))

test('工具注册与身份文档：名字在、说明书先讲处境', async () => {
  let registered = null
  const ctx = {
    tools: {
      register: (def) => {
        registered = def
        return () => {}
      },
    },
  }
  registerPronounAsk(ctx, { root: mkdtempSync(join(tmpdir(), 'fish-pronoun-reg-')) })
  assert.equal(registered?.name, 'ask_pronoun')
  assert.ok(HER_TOOLS.includes('ask_pronoun'), '她的工具清单里要有这一样，不然她伸手就落空')
  assert.match(PRONOUN_ASK_BRIEF, /什么时候想起它/)
  assert.match(PRONOUN_ASK_BRIEF, /ask_pronoun/)

  const doc = renderSelfDoc(deriveSelf([]), {
    budget: 8000,
    browse: true,
    speak: true,
    diary: true,
    dream: true,
    proactive: true,
    schedule: true,
    restricted: false,
  })
  assert.ok(doc.includes('ask_pronoun'), '身份文档里必须有这个名字')
})

test('状态：问过几次、答过什么，一眼看得出来', async () => withRoot(async (root) => {
  seedMeta(root, { id: 'ev_a', text: 'ask-pronoun', day: 1 })
  seedMeta(root, { id: 'ev_b', text: 'pronoun:她 ev_a', day: 1 })
  const s = pronounAskState((await readEvents(root)).events)
  assert.equal(s.answered?.raw, '她')
  assert.equal(s.pending, null)

  // 读配置不是这里的事；这里只确认没有凭空写盘
  const raw = await readConfig(root)
  assert.equal(raw?.owner?.pronoun, undefined)
}))

test('换代词不改她自己的原话（2026-11-12 用户反馈）', () => {
  const model = deriveSelf([])
  model.beliefs = [{ id: 'b1', text: '我还是喜欢吉他，他说改天教我', since: '2026-11-02T10:00:00.000Z' }]
  const doc = renderSelfDoc(model, { budget: 8000, pronoun: '她' })
  // 她写下的句子一个字都不该变——「吉他」不是「吉她」，那个「他」也是她当时写的。
  assert.ok(doc.includes('我还是喜欢吉他，他说改天教我'), '她自己的原话被改了')
  // 模板句照常换：这一节的小标题是插件写的，里面的「他」指主人。
  assert.ok(doc.includes('她说的事和你记得的不一样时'), '模板句里的主人代词没换成「她」')
  assert.ok(!doc.includes('他说的事和你记得的不一样时'))
})

test('答完当场重写身份文档，不等到下一次派生', async () => withRoot(async (root) => {
  const w = await applyPronounAnswer(root, 'ev_q1', '她')
  assert.equal(w.ok, true)
  const { selfDocPath } = await import('../lib/selfdoc.js')
  const { readFileSync } = await import('node:fs')
  const doc = readFileSync(selfDocPath(root), 'utf8')
  assert.ok(doc.length > 0, '答完应该已经落盘一份')
  assert.ok(doc.includes('她说的事和你记得的不一样时'), '新代词应该已经写进文档')
}))

/** 假宿主：活着的 agent、记下提问的宿主服务、换得掉的 bail（dsh-fish/card 那一声）。 */
function fakeCardCtx(bail) {
  const agent = { id: 'session-abc' }
  const asked = []
  const cards = []
  const ctx = {
    get: (name) => (name === 'agents'
      ? { get: (id) => (id === 'session-abc' ? agent : undefined), list: () => [agent], roots: () => [agent] }
      : undefined),
    userQuestions: { ask: async (req) => { asked.push(req); return { answers: [] } } },
    ...(bail ? { bail: (name, card) => { cards.push({ name, card }); return bail(name, card) } } : {}),
    tools: { register: (spec) => { ctx.spec = spec; return () => {} } },
  }
  return { ctx, asked, cards }
}

const HER_EXEC = { session: { header: { id: 'session-abc' } }, agent: { session: { id: 'session-abc' } } }

test('卡被接走（RELAYED）：照实说问到了、送到哪儿、还没答，不报「没问上」；ask-pronoun 照旧记一笔', async () => withRoot(async (root) => {
  const { ctx, asked, cards } = fakeCardCtx(() => Promise.resolve({ via: 'QQ 私聊' }))
  registerPronounAsk(ctx, { root })
  const out = await ctx.spec.execute({ why: '想叫对' }, HER_EXEC)

  assert.equal(out.ok, true, '卡送到了就是问到了')
  assert.equal(out.via, 'QQ 私聊')
  assert.equal(out.value, undefined, '还没答，不落值')
  assert.equal(out.note, '问了，送到了QQ 私聊，还没答。')
  const text = ctx.spec.output.render({}, out)[0].text
  assert.equal(text, '[已问，送到了QQ 私聊，还没答]')
  for (const s of [out.note, text]) {
    assert.doesNotMatch(s, /没问/, '同一次里不能再说「没问上」')
    assert.doesNotMatch(s, /[他她]|TA/, '回执里不写代词（1.0 起回执只在 withUse 里填 {T}，这两句没有 {T}）')
  }
  assert.equal(asked.length, 0, '接走了就不在会话里再弹一张')

  const { events } = await readEvents(root)
  const asks = events.filter((e) => e.type === 'meta' && e.text === 'ask-pronoun')
  assert.equal(asks.length, 1, '事件流照旧记 ask-pronoun')
  assert.equal(events.filter((e) => String(e.text ?? '').startsWith('pronoun:')).length, 0, '还没答，不记答案')
  assert.equal(cards.length, 1)
  assert.equal(cards[0].name, 'dsh-fish/card')
  assert.equal(cards[0].card.id, `pronoun:${asks[0].id}`, '卡片 id 指回这一次问')
  assert.equal(cards[0].card.detail, '想叫对')
  assert.equal((await loadConfig(root)).config.owner.pronoun, '他', '没答就不改')
}))

test('接卡的插件只回了空白 via：不算接走（卡还留在会话里），也不会漏出 undefined', async () => withRoot(async (root) => {
  const { ctx, asked } = fakeCardCtx(() => Promise.resolve({ via: '   ' }))
  registerPronounAsk(ctx, { root })
  const out = await ctx.spec.execute({}, HER_EXEC)
  const text = ctx.spec.output.render({}, out)[0].text
  for (const s of [out.note, text]) assert.doesNotMatch(s, /undefined|null/, '不能把空值拼进给人看的话里')
  assert.equal(asked.length, 1, '空白 via 当没接走：卡照常弹在会话上')
  // 回执里那条「送到了哪儿」的兜底：via 空着时说的是「那边收下了」，不拼一个空串
  assert.equal(ctx.spec.output.render({}, { ok: true, note: '', via: '' })[0].text, '[问了，等那边说]')
}))

test('卡被接走之后：当天再调说「今天刚问过」（和上一句对得上），答了按卡片那条路落地', async () => withRoot(async (root) => {
  const { ctx, cards } = fakeCardCtx(() => Promise.resolve({ via: 'QQ 私聊' }))
  registerPronounAsk(ctx, { root })
  const first = await ctx.spec.execute({}, HER_EXEC)
  assert.equal(first.ok, true, '第一次说的是问到了')
  assert.match(first.note, /送到了QQ 私聊/)

  const again = await ctx.spec.execute({}, HER_EXEC)
  assert.equal(again.ok, false)
  assert.match(again.note, /今天刚问过/)
  assert.equal(cards.length, 1, '还没答的当天不再弹一张')

  const asked = (await readEvents(root)).events.find((e) => e.type === 'meta' && e.text === 'ask-pronoun')
  const r = await answerCard(root, { id: `pronoun:${asked.id}`, selected: ['她'] })
  assert.equal(r.ok, true)
  assert.equal((await loadConfig(root)).config.owner.pronoun, '她')

  const later = await ctx.spec.execute({}, HER_EXEC)
  assert.equal(later.ok, false)
  assert.match(later.note, /答的是「她」/)
  assert.equal(cards.length, 1)
}))

test('真没问上（没人接卡、会话里也弹不出来）：还是说「没问上」', async () => withRoot(async (root) => {
  // 没人接卡，也没有 agents 注册表：askInChat 回 NO_AGENT
  const { ctx, asked, cards } = fakeCardCtx(() => undefined)
  delete ctx.get
  registerPronounAsk(ctx, { root })
  const out = await ctx.spec.execute({}, HER_EXEC)
  assert.equal(out.ok, false)
  assert.equal(out.via, undefined)
  assert.equal(ctx.spec.output.render({}, out)[0].text, '[没问：这次没问上，等下次有机会再说。]')
  assert.equal(cards.length, 1)
  assert.equal(asked.length, 0)
}))
