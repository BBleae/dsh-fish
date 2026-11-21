/**
 * append-failure.test.mjs —— 事件写不进去时，不能再静默（2026-11-21，用户 m00612）。
 *
 * 外部复核发现：11-21 两次 `drive-spend` 都没有对应的 `proactive-silent`。
 * 代码链是 `store.js` 的 `ensureDir` 在 `appendEvent` 的 try 外——它抛错时
 * 连「事件没写进去」都不会打，调用方的 `.catch(() => {})` 又把错误吞掉。
 *
 * 这里直接替换 `fs.promises.mkdir`（store.js 用的是同一个对象）：
 *   1. 第一次 EACCES、第二次成功 → 重试能过，事件真的写进去；
 *   2. 每次都 EACCES → 重试耗尽后抛错，日志里必须有「事件没写进去」和错误码。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { appendEvent, paths } = await import('../lib/store.js')
const { logFile } = await import('../lib/log.js')

const realMkdir = fs.mkdir
const denied = () => {
  const err = new Error('denied by test')
  err.code = 'EACCES'
  return err
}
const ctx = { day: 1, stage: 1, source: 'tool' }
const event = { type: 'utterance', text: '测试一条' }

function freshRoot() {
  return mkdtempSync(join(tmpdir(), 'fish-append-'))
}

test('ensureDir 瞬时失败：重试一次后事件照常写进去', async (t) => {
  const root = freshRoot()
  let calls = 0
  fs.mkdir = async (...args) => {
    calls += 1
    if (calls === 1) throw denied()
    return realMkdir(...args)
  }
  t.after(() => {
    fs.mkdir = realMkdir
    rmSync(root, { recursive: true, force: true })
  })

  const ev = await appendEvent(event, ctx, root)
  assert.ok(ev.id, '重试成功后应返回带 id 的事件')
  assert.equal(calls, 2, '第一次失败、第二次成功，正好两次 mkdir')
  const lines = readFileSync(paths(root).events, 'utf8').trim().split('\n')
  assert.equal(lines.length, 1)
  assert.equal(JSON.parse(lines[0]).text, event.text)
})

test('ensureDir 一直失败：重试耗尽后抛错，日志留下「事件没写进去」和错误码', async (t) => {
  const root = freshRoot()
  let calls = 0
  fs.mkdir = async () => {
    calls += 1
    throw denied()
  }
  t.after(() => {
    fs.mkdir = realMkdir
    rmSync(root, { recursive: true, force: true })
  })

  await assert.rejects(
    () => appendEvent(event, ctx, root),
    (err) => err?.code === 'EACCES',
  )
  assert.ok(calls >= 2, '瞬时错误应重试，而不是第一下就放弃')
  const log = readFileSync(logFile(root), 'utf8')
  assert.match(log, /事件没写进去/)
  assert.match(log, /EACCES/)
})
