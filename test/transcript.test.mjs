/**
 * transcript.test.mjs —— 她自己续写的对话记录不该被当成她的话（2026-11-11，W49）
 *
 * 案发：外部用户两天内从 0% 爬到 19%。形态是她的回复末尾接着往下写
 *   <她真说的话>
 *   user <凭空编的、对方「下一句」会说的话>
 *   assistant <她接着编的、自己「下一句」会说的话>
 * 后半段纯虚构，下一轮还会被她自己当既成事实引用（`talk-recent.json` →
 * 提示词 → 再写一遍，自增强）。
 *
 * 两条底线钉在这里：
 *   1. 只切不改写——从标记那一行起整段丢，前面一个字符都不动；
 *   2. 正常正文一个字符都不许动（`user experience`、`AI agent`、行中的 assistant）。
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  hasTranscriptTail,
  IDENTITY_TITLES,
  MARK_WORDS,
  partialMarkTail,
  promptEchoHint,
  promptEchoStart,
  stripPromptEcho,
  stripTranscriptTail,
  stripTwoVoiceTail,
  transcriptStart,
  twoVoiceTailStart,
} from '../lib/transcript.js'

test('末尾接了一段假对话：从 user 那行起全切掉，前面的真话一字不动', () => {
  const raw = [
    '石柱、梯田、电线、蓝天，都在。',
    'user 是的，不过我只是骑到这边，然后休息的时候拍的照片，浙西川藏线',
    'assistant',
  ].join('\n')
  assert.equal(stripTranscriptTail(raw), '石柱、梯田、电线、蓝天，都在。')
})

test('中文形态的标记也认（真机早期用例是「用户 嗯嗯」）', () => {
  assert.equal(stripTranscriptTail('我刚吃完饭。\n用户 嗯嗯'), '我刚吃完饭。')
  assert.equal(stripTranscriptTail('用户 嗯嗯'), '')
})

test('标记在中间、后面还有她的话：也一并切掉（宁可少留一句真话）', () => {
  const raw = '去吧\n（什么情况？）\nuser 门的事\nassistant 嗯，去看吧\n真有事，就照咱们说好的那三步来'
  assert.equal(stripTranscriptTail(raw), '去吧\n（什么情况？）')
})

test('正常正文一个字符都不改', () => {
  const cases = [
    '他写了一句 user experience 是用户体验的意思。',
    '我用的是一个 AI agent，不是 assistant 那种。',
    '我在行中说到 assistant 这个词，不算标记。',
    '嗯。',
    '',
    'line1\nline2\nline3',
  ]
  for (const s of cases) assert.equal(stripTranscriptTail(s), s, `不该动：${s}`)
})

test('行首允许前置的引用符、列表符、井号', () => {
  assert.equal(stripTranscriptTail('好的\n> user 你好'), '好的')
  assert.equal(stripTranscriptTail('- 用户 嗯'), '')
  assert.equal(stripTranscriptTail('## 助手 在'), '')
})

test('标记行前面多余的空行一起收掉，不留半截空行', () => {
  assert.equal(stripTranscriptTail('好的\n\nassistant'), '好的')
  assert.equal(stripTranscriptTail('嗯。\nuser: 你好'), '嗯。')
})

test('没有标记就原样返回（连空白都不动）', () => {
  const raw = ' 前面有空格\n后面也有空格  '
  assert.equal(stripTranscriptTail(raw), raw)
})

test('hasTranscriptTail 认得出脏的、认不出干净的', () => {
  assert.equal(hasTranscriptTail('真话\nuser 假话'), true)
  assert.equal(hasTranscriptTail('真话\n用户 假话'), true)
  assert.equal(hasTranscriptTail('他说 user experience 很重要'), false)
  assert.equal(hasTranscriptTail(''), false)
  // 连着调两次也要判对（带 g 的正则会记 lastIndex）
  assert.equal(hasTranscriptTail('真话\nassistant 假话'), true)
  assert.equal(hasTranscriptTail('真话\nassistant 假话'), true)
})

test('transcriptStart 给的是行首下标，不是换行本身', () => {
  assert.equal(transcriptStart('ab\nuser 你好'), 3)
  assert.equal(transcriptStart('user 你好'), 0)
  assert.equal(transcriptStart('abc'), -1)
})

test('partialMarkTail：半个标记词要压住，写完的完整词也要压一压', () => {
  assert.equal(partialMarkTail('us'), 2)
  assert.equal(partialMarkTail('用户'), 2)
  assert.equal(partialMarkTail('user'), 4)
  // 已经带标点/空格，不再是半个词
  assert.equal(partialMarkTail('user 你好'), 0)
  assert.equal(partialMarkTail('好的'), 0)
  assert.equal(partialMarkTail(''), 0)
})

test('MARK_WORDS 覆盖报告里出现过的两种形态', () => {
  for (const w of ['user', 'assistant', '用户', '助手']) {
    assert.ok(MARK_WORDS.includes(w), `漏了 ${w}`)
  }
})

/* 末尾「一个人告别 + 另一个人应答」：没有标记，只有空行分段（2026-11-21 外部报告） */

const BODY = '这次没有一个人扛得住，只能全部一起重来。'

test('末尾那对告别对白要整段切掉，前面一个字都不动', () => {
  const raw = `${BODY}\n\n明天再和你玩吧，我得出门了\n\n好，那你先忙。回来再接着聊。`
  assert.equal(twoVoiceTailStart(raw), BODY.length + 2)
  assert.equal(stripTwoVoiceTail(raw), BODY)
})

test('正常的收尾不许切', () => {
  // 正常的两段收尾：后段没有约下一次的词
  assert.equal(stripTwoVoiceTail(`${BODY}\n\n好了，你该走了。`), `${BODY}\n\n好了，你该走了。`)
  // 只有两段（没有真正的正文）
  assert.equal(stripTwoVoiceTail('我今天先出门了。\n\n好，那你先忙，回来再聊。'), '我今天先出门了。\n\n好，那你先忙，回来再聊。')
  // 她自己的一句告别式独白：后段不是应答
  assert.equal(stripTwoVoiceTail(`${BODY}\n\n我先去睡了。\n\n明天再聊。`), `${BODY}\n\n我先去睡了。\n\n明天再聊。`)
  // 前段没有「我」，读不出是谁要走
  assert.equal(stripTwoVoiceTail(`${BODY}\n\n出门了啊\n\n好，你忙你的，回头聊。`), `${BODY}\n\n出门了啊\n\n好，你忙你的，回头聊。`)
  // 单换行不是分段
  assert.equal(stripTwoVoiceTail(`${BODY}\n明天再和你玩吧，我得出门了\n好，那你先忙。回来再接着聊。`), `${BODY}\n明天再和你玩吧，我得出门了\n好，那你先忙。回来再接着聊。`)
})

test('两段里有一段太长就不当对白', () => {
  const long = `明天再和你玩吧，我得出门了${'，顺便把昨天没说完的那件事也一起说完再走'.repeat(2)}`
  const raw = `${BODY}\n\n${long}\n\n好，那你先忙。回来再接着聊。`
  assert.equal(twoVoiceTailStart(raw), -1)
  assert.equal(stripTwoVoiceTail(raw), raw)
})

test('没有这个形状就原样返回（连空白都不动）', () => {
  const raw = ' 前面有空格\n\n后面也有空格  '
  assert.equal(twoVoiceTailStart(raw), -1)
  assert.equal(stripTwoVoiceTail(raw), raw)
  assert.equal(twoVoiceTailStart(''), -1)
  assert.equal(stripTwoVoiceTail(''), '')
})

/* 正文里续写出宿主的时间头 + 整份提示词（2026-11-21 晚，另一份外部报告） */

const SAY = '不是我懂。评论区最上面两条就在那儿：一条求「主包出一期泳装大肥鱼」，一条算「那尾巴一下全力横扫，对面上半身都没了」。'

/** 真机形态：真话 + 编出来的下一轮抬头 + 逐字默写的提示词。 */
const ECHOED = [
  SAY,
  '',
  'Time sampled while preparing turn 51, step 1: 2026-11-21T23:29:09+08:00[Asia/Shanghai]',
  'Browser time zone for this call: unavailable. Ask the user to clarify.',
  'Elapsed since the preceding model-visible message: 25m 20s.',
  '',
  '## 你是谁',
  '你是一个……',
  '## 现在',
  '## 这些天',
  '## 现在能做什么',
].join('\n')

test('正文里带回时间头：从那一行起切掉，前面的真话一字不动', () => {
  assert.equal(promptEchoStart(ECHOED), SAY.length + 2)
  assert.equal(stripPromptEcho(ECHOED), SAY)
})

test('时间头的另两行也认（行首结构本身就是证据）', () => {
  assert.equal(stripPromptEcho(`${SAY}\n\nBrowser time zone for this request: Asia/Shanghai.`), SAY)
  assert.equal(stripPromptEcho(`${SAY}\n\nElapsed since the preceding model-visible message: 3m 2s.`), SAY)
  // 整段就是编出来的抬头：整条丢掉，一个字都不留
  assert.equal(stripPromptEcho('Time sampled while preparing turn 9, step 1: 2026-11-04T19:21:30+08:00[Asia/Shanghai]'), '')
})

test('正文里正常提到时间头这几个词，不许切', () => {
  const quoted = '宿主注入的那行叫 Time sampled while preparing turn，我照着写就行。'
  assert.equal(promptEchoStart(quoted), -1)
  assert.equal(stripPromptEcho(quoted), quoted)
  // 句中出现（不是行首）也不算
  const inline = `${SAY}\n这一行是 Elapsed since the preceding model-visible message，我抄下来的。`
  assert.equal(stripPromptEcho(inline), inline)
})

test('她自己在正文里用 ## 小标题，一个字符都不许动', () => {
  const own = '## 我今天的打算\n\n先把本子收拾一下。'
  assert.equal(promptEchoStart(own), -1)
  assert.equal(stripPromptEcho(own), own)
  // 软信号只数身份文档里真有的那几个标题，且要整行相等
  assert.equal(promptEchoHint(own), 0)
})

test('软信号：身份小节标题只数、不切（她引用自己设定时会中）', () => {
  const echoing = `${SAY}\n\n## 你是谁\n\n## 这些天\n\n## 现在能做什么`
  assert.equal(promptEchoHint(echoing), 3)
  // 没有硬判据，原样返回
  assert.equal(stripPromptEcho(echoing), echoing)
  assert.ok(IDENTITY_TITLES.includes('## 你是谁'))
  // 同行里带别的内容不算（整行必须完全相等）
  assert.equal(promptEchoHint('## 你是谁呀，我是大肥鱼。'), 0)
})
