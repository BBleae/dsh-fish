/**
 * talkmem-amend-queue.test.mjs —— 「继续」那一轮补话，和另一轮结账排同一队
 *
 * 只在本地合并分支上有的缝：amendLastExchange（「继续」之后把她的话补进最后一轮）
 * 和 addExchange（记一轮）改的是同一份 talk-recent.json。addExchange 已经按文件排队
 * （store.js 的 mutateJson），amendLastExchange 当时是直接读、改、写——两个撞上时各读
 * 各的旧快照，后落盘的把先落盘的整份盖掉，两边都回 ok，盘上只剩一边。
 *
 * 守的事：
 *   1. 补话和群聊那一桶的一轮同时落盘，两边都在；
 *   2. 补话和书房那一桶的下一轮同时落盘，按调用的先后排：先补上、再记新的一轮；
 *   3. 反过来（新的一轮先排上）就不补——最后一轮已经不是那一句了，这是原来的规矩。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { addExchange, amendLastExchange, recentExchanges } from '../lib/talkmem.js'

async function withRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-fish-amend-'))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const ROUNDS = 12

test('补话和群聊的一轮同时落盘：补上的话在，群聊那一轮也在', async () => {
  for (let i = 0; i < ROUNDS; i++) {
    await withRoot(async (root) => {
      await addExchange(root, { me: '问一句', her: '' })
      // 两种先后都试：谁先调都不许丢另一边
      const amend = () => amendLastExchange(root, { me: '问一句', her: '后来答上的话' })
      const add = () => addExchange(root, { me: '群里一句', her: '群里回的', scene: 'group' })
      const [a, b] = await Promise.all(i % 2 ? [amend(), add()] : [add(), amend()])
      assert.equal(a.ok, true)
      assert.equal(b.ok, true)
      const home = await recentExchanges(root, 20)
      const group = await recentExchanges(root, 20, 'group')
      assert.deepEqual(home.map((r) => [r.me, r.her]), [['问一句', '后来答上的话']], `第 ${i} 遍：补的话没了`)
      assert.deepEqual(group.map((r) => r.me), ['群里一句'], `第 ${i} 遍：群聊那一轮没了`)
    })
  }
})

test('补话先排上、书房的下一轮后排上：先补、再记，两轮都在', async () => {
  for (let i = 0; i < ROUNDS; i++) {
    await withRoot(async (root) => {
      await addExchange(root, { me: '问一句', her: '半句' })
      const [a, b] = await Promise.all([
        amendLastExchange(root, { me: '问一句', her: '后半句' }),
        addExchange(root, { me: '又问一句', her: '又答一句' }),
      ])
      assert.equal(a.ok, true)
      assert.equal(b.ok, true)
      const home = await recentExchanges(root, 20)
      assert.deepEqual(home.map((r) => [r.me, r.her]), [['问一句', '半句 后半句'], ['又问一句', '又答一句']], `第 ${i} 遍`)
    })
  }
})

test('书房的下一轮先排上：最后一轮已经不是那一句，不补，新的一轮原样在', async () => {
  await withRoot(async (root) => {
    await addExchange(root, { me: '问一句', her: '' })
    const [b, a] = await Promise.all([
      addExchange(root, { me: '又问一句', her: '又答一句' }),
      amendLastExchange(root, { me: '问一句', her: '后来答上的话' }),
    ])
    assert.equal(b.ok, true)
    assert.equal(a.ok, false)
    const home = await recentExchanges(root, 20)
    assert.deepEqual(home.map((r) => [r.me, r.her]), [['问一句', ''], ['又问一句', '又答一句']])
  })
})
