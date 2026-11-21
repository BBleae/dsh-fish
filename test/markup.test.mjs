/**
 * markup.test.mjs —— 工具调用标记漏进正文时，别把它当成她说的话（issue #25）
 *
 * 这一组守四件事：
 *   ① 只有标记的一步：清洗后是空串，不留任何残渣；
 *   ② 标记旁边还有真话：留真话，只去掉标记；
 *   ③ 正常正文里出现 `<` `>` 的，一个字符都不动；
 *   ④ 流被截断、标记没闭合的，从第一个残标切到行尾。
 *   ⑤ 整段被 `<parameter name="…">…</parameter></invoke>` 包住的参数壳（issue #166）：
 *      剥壳留话；正文中间提到、或者壳没收尾的，一个字符都不动。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { hasToolMarkup, stripToolMarkup, stripToolShell } from '../lib/markup.js'
import { assistantText } from '../lib/turns.js'

/** issue #25 里真实的默认收尾标记（全角竖线 U+FF5C，不是半角 `|`） */
const CLOSE = '</｜｜DSML｜｜ invoke>'

test('只有标记的一步：清洗后是空串', () => {
  assert.equal(stripToolMarkup(CLOSE), '')
  assert.equal(stripToolMarkup(`  ${CLOSE}  `), '')
  assert.equal(stripToolMarkup(`</｜｜DSML｜｜ calls>`), '')
})

test('码点对得上：是全角竖线 U+FF5C，不是半角', () => {
  // 写死这几个码点，免得以后谁手滑把它「修」成半角竖线——那样线上就永远认不出来
  assert.equal(CLOSE[2].codePointAt(0), 0xff5c)
  assert.equal(CLOSE[3].codePointAt(0), 0xff5c)
  assert.equal(hasToolMarkup(CLOSE), true)
  // 半角竖线的顺手版本不该被认成标记
  assert.equal(hasToolMarkup('</||DSML|| invoke>'), false)
})

test('标记旁边还有真话：留真话，只去掉标记', () => {
  assert.equal(stripToolMarkup(`我把窗关上了。${CLOSE}`), '我把窗关上了。')
  assert.equal(stripToolMarkup(`${CLOSE}\n我把窗关上了。`), '我把窗关上了。')
  assert.equal(stripToolMarkup(`前半句${CLOSE}后半句`), '前半句后半句')
})

test('正常正文一个字符都不改', () => {
  const plain = '他写了一句 a < b && c > d，还有 <div> 这种标签。'
  assert.equal(stripToolMarkup(plain), plain)
  assert.equal(stripToolMarkup('没有符号的一句话'), '没有符号的一句话')
  assert.equal(stripToolMarkup(''), '')
  assert.equal(stripToolMarkup(null), '')
  assert.equal(stripToolMarkup(undefined), '')
  assert.equal(hasToolMarkup('<div>不是标记</div>'), false)
})

test('流被截断、标记没闭合：从第一个残标切到行尾', () => {
  // 现实里流断在参数中间，后面跟着的是调用参数，不是她说的话
  assert.equal(stripToolMarkup(`我把窗关上了。${CLOSE.slice(0, -1)}`), '我把窗关上了。')
  assert.equal(stripToolMarkup('我说完了。</｜｜DSML｜｜ invoke name="x"'), '我说完了。')
  // 整个都是残标
  assert.equal(stripToolMarkup('</｜｜DSML｜｜'), '')
})

test('大小写不影响：小写的 dsml 也认', () => {
  assert.equal(stripToolMarkup('收到。</｜｜dsml｜｜ invoke>'), '收到。')
  assert.equal(hasToolMarkup('</｜｜Dsml｜｜ invoke>'), true)
})

test('assistantText：只剩标记的一步取到空串（不会被记成她的话）', () => {
  assert.equal(assistantText({ message: { content: [{ type: 'text', text: CLOSE }] } }), '')
  // content 是字符串兜底的那条路也要洗
  assert.equal(assistantText({ message: { content: CLOSE } }), '')
  assert.equal(assistantText({ text: CLOSE }), '')
  // reasoning 后面跟一段纯标记：仍然是空
  assert.equal(
    assistantText({ message: { content: [{ type: 'reasoning', text: '想想' }, { type: 'text', text: CLOSE }] } }),
    '',
  )
})

test('assistantText：标记和真话混在同一步时，真话照常留下', () => {
  assert.equal(
    assistantText({
      message: {
        content: [
          { type: 'text', text: '我把窗关上了。' },
          { type: 'text', text: CLOSE },
        ],
      },
    }),
    '我把窗关上了。',
    '纯标记的块被丢掉，不留空行',
  )
  assert.equal(
    assistantText({ message: { content: [{ type: 'text', text: `我把窗关上了。${CLOSE}` }] } }),
    '我把窗关上了。',
  )
})

/** issue #166 里真实漏出来的形状：没有 invoke 头，只有参数段 + 收尾 */
const SHELL = '<parameter name="text">我把窗关上了。</parameter>\n</invoke>'

test('参数壳：整段被包住时剥壳留话（issue #166）', () => {
  assert.equal(stripToolShell(SHELL), '我把窗关上了。')
  assert.equal(stripToolMarkup(SHELL), '我把窗关上了。')
  // 带 invoke 头的完整壳也认
  assert.equal(
    stripToolMarkup('<invoke name="her_say"><parameter name="text">我把窗关上了。</parameter></invoke>'),
    '我把窗关上了。',
  )
  // 收尾链长一点（parameter → invoke → calls）照样剥
  assert.equal(stripToolShell('<parameter name="text">嗯。</parameter></invoke></calls>'), '嗯。')
  // 空壳 = 这一步她没有正文
  assert.equal(stripToolMarkup('<parameter name="text"></parameter></invoke>'), '')
})

test('参数壳：只在整段被包住时才动手', () => {
  const prose = '他说 <parameter name="text"> 是模板里的占位符。'
  assert.equal(stripToolMarkup(prose), prose)
  const half = '<parameter name="text">这半截没收尾'
  assert.equal(stripToolMarkup(half), half)
  // `<div>` 和 `a < b` 那条底线不受影响
  assert.equal(stripToolMarkup('<div>不是标记</div>'), '<div>不是标记</div>')
})

test('assistantText：参数壳不会被记成她的话（issue #166）', () => {
  assert.equal(assistantText({ message: { content: [{ type: 'text', text: SHELL }] } }), '我把窗关上了。')
  // content 是字符串兜底那条路也要过
  assert.equal(assistantText({ message: { content: SHELL } }), '我把窗关上了。')
})
