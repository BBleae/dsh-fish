/**
 * works.test.mjs —— 「她留下的东西」的锁定测试（2026-11-16，1.0.4）
 *
 * 守这几件事：
 *   1. 留一件：正文落到 works/<id>/vN-标题.md，账里只有索引，读得回来；
 *   2. 同名再给一次就是第二版，第一版不覆盖（用户 m00130：反复改才真实）；
 *   3. 改版时换名字还是同一件，旧的那件还在；
 *   4. 硬上限：名字四十字、一版两千字、一天起一件新的、七天三件新的、一天两版、手上最多两件；
 *   5. 收尾/放下；放下必须说一句为什么；
 *   6. 读回正文不留痕：账里不记、不写事件、桌上不会因此多出一行；
 *   7. 桌上只摆一件事实：十四天内动过的、还没弄完的；
 *   8. 坏账只当空，读永远不抛。
 *   9. file 带进来的文件按解开链接以后的真实路径判：数据目录里面的什么都收（凭据文件除外），
 *      屋外的只收图 / 声音 / 影像；网络共享和设备路径在碰文件系统之前就拒。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  WORK_NEW_PER_WEEK,
  WORK_PER_DAY,
  WORK_TEXT_MAX,
  WORK_TITLE_MAX,
  WORK_VERSIONS_PER_DAY,
  WORK_WIP_MAX,
  closeWork,
  findWork,
  listWorks,
  makeWork,
  readWorkText,
  readWorks,
  worksDir,
  worksFile,
  worksForDesk,
  worksSummary,
} from '../lib/works.js'

async function withRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-fish-works-'))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

// 2026-11-16 10:00 本地时间；日期键都按本地算。
const NOW = new Date(2026, 10, 16, 10, 0, 0).getTime()
const DAY = 86_400_000
const day = (n) => new Date(2026, 10, 16 + n, 10, 0, 0).getTime()

test('留一件：正文落盘、账里只放索引、读得回来', async () => {
  await withRoot(async (root) => {
    const r = await makeWork(root, {
      title: '一条没写完的广告',
      text: '第一段：它其实不响。\n第二段：但你会一直听见它。',
      intent: '想写得像有人在耳边说话',
      refs: ['ev_a', 'ev_b'],
      now: NOW,
    })
    assert.equal(r.ok, true)
    assert.ok(r.id.startsWith('w-'))
    assert.equal(r.version, 1)
    assert.equal(r.state, 'wip')
    assert.match(r.note, /留下了《一条没写完的广告》/)

    const files = await readdir(join(worksDir(root), r.id))
    assert.equal(files.length, 1)
    assert.match(files[0], /^v1-/)
    const body = await readFile(join(worksDir(root), r.id, files[0]), 'utf8')
    assert.match(body, /^# 一条没写完的广告/)
    assert.match(body, /第 1 版/)
    assert.match(body, /想做成：想写得像有人在耳边说话/)
    assert.match(body, /第二段：但你会一直听见它。/)

    const db = await readWorks(root)
    assert.equal(db.items.length, 1)
    assert.equal(db.items[0].title, '一条没写完的广告')
    assert.equal(db.items[0].day, '2026-11-16')
    assert.equal(db.items[0].versions.length, 1)
    assert.equal(db.items[0].refs.length, 2)
    assert.ok(db.items[0].line.length <= 120)

    const back = await readWorkText(root, { title: '一条没写完的广告' })
    assert.equal(back.ok, true)
    assert.equal(back.version, 1)
    assert.deepEqual(back.versions, [1])
    assert.match(back.text, /第二段/)
  })
})

test('同名再给一次就是第二版，第一版不覆盖', async () => {
  await withRoot(async (root) => {
    const a = await makeWork(root, { title: '那条广告', text: '第一版：先说响。', now: NOW })
    const b = await makeWork(root, { title: '那条广告', text: '第二版：先说静。', now: NOW + 60_000 })
    assert.equal(b.ok, true)
    assert.equal(b.id, a.id)
    assert.equal(b.version, 2)
    assert.match(b.note, /改了第 2 版/)

    const files = (await readdir(join(worksDir(root), a.id))).sort()
    assert.equal(files.length, 2)
    const first = await readFile(join(worksDir(root), a.id, files.find((f) => f.startsWith('v1-'))), 'utf8')
    const second = await readFile(join(worksDir(root), a.id, files.find((f) => f.startsWith('v2-'))), 'utf8')
    assert.match(first, /第一版：先说响。/)
    assert.match(second, /第二版：先说静。/)

    const one = await readWorkText(root, { title: '那条广告', version: 1 })
    assert.match(one.text, /第一版/)
    const two = await readWorkText(root, { title: '那条广告' })
    assert.equal(two.version, 2)
    assert.deepEqual(two.versions, [1, 2])
    assert.match(two.text, /第二版/)

    const db = await readWorks(root)
    assert.equal(db.items.length, 1)
  })
})

test('改版换名字：还是同一件，只是名字变了（另一件不会凭空多出来）', async () => {
  await withRoot(async (root) => {
    const a = await makeWork(root, { title: '旧名字', text: '一稿。', now: NOW })
    const b = await makeWork(root, { title: '新名字', text: '二稿。', basedOn: a.id, newName: true, now: NOW + 1000 })
    assert.equal(b.ok, true)
    assert.equal(b.id, a.id)
    assert.equal(b.version, 2)
    const db = await readWorks(root)
    assert.equal(db.items.length, 1, '换名字不另起一件：不然「改了很多遍」会被拆成很多陌生人')
    assert.equal(db.items[0].title, '新名字')
    assert.equal(db.items[0].versions.length, 2)

    const files = (await readdir(join(worksDir(root), a.id))).sort()
    assert.equal(files.length, 2)
    assert.match(files[0], /^v1-旧名字\.md$/, '第一版文件名留着当时的名字，不跟着改')
    assert.match(files[1], /^v2-新名字\.md$/)
    const one = await readWorkText(root, { id: a.id, version: 1 })
    assert.match(one.text, /^# 旧名字/)
    const two = await readWorkText(root, { id: a.id })
    assert.match(two.text, /^# 新名字/)
  })
})

test('写入口挡：没名字、空正文、名字太长、正文太多', async () => {
  await withRoot(async (root) => {
    assert.equal((await makeWork(root, { title: '', text: '正文', now: NOW })).ok, false)
    assert.equal((await makeWork(root, { title: '   ', text: '正文', now: NOW })).ok, false)
    assert.equal((await makeWork(root, { title: '有名字', text: '   ', now: NOW })).ok, false)
    const longTitle = '名'.repeat(WORK_TITLE_MAX + 1)
    assert.equal((await makeWork(root, { title: longTitle, text: '正文', now: NOW })).ok, false)
    const longText = '字'.repeat(WORK_TEXT_MAX + 1)
    assert.equal((await makeWork(root, { title: '有名字', text: longText, now: NOW })).ok, false)
    assert.equal((await readWorks(root)).items.length, 0, '挡下来的不能留半截')
  })
})

test('手上最多两件没弄完，第三件挡回去；收一件就能再留', async () => {
  await withRoot(async (root) => {
    await makeWork(root, { title: '甲', text: '甲的正文。', now: day(0) })
    await makeWork(root, { title: '乙', text: '乙的正文。', now: day(1) })
    const third = await makeWork(root, { title: '丙', text: '丙的正文。', now: day(2) })
    assert.equal(third.ok, false)
    assert.match(third.note, /《甲》/)
    assert.match(third.note, /《乙》/)
    assert.equal(WORK_WIP_MAX, 2)

    assert.equal((await closeWork(root, { title: '甲', state: 'done', now: day(2) })).ok, true)
    const again = await makeWork(root, { title: '丙', text: '丙的正文。', now: day(2) })
    assert.equal(again.ok, true)
  })
})

test('一天两版：接着改两次就停，明天还能接着改', async () => {
  await withRoot(async (root) => {
    const a = await makeWork(root, { title: '一天里的东西', text: '一。', now: NOW })
    assert.equal((await makeWork(root, { title: '一天里的东西', text: '二。', now: NOW + 1000 })).ok, true)
    const third = await makeWork(root, { title: '一天里的东西', text: '三。', now: NOW + 2000 })
    assert.equal(third.ok, false)
    assert.match(third.note, /今天已经改过 2 版了/)
    assert.equal(WORK_VERSIONS_PER_DAY, 2)
    assert.equal((await readWorks(root)).items[0].versions.length, 2)

    const tomorrow = await makeWork(root, { title: '一天里的东西', text: '三。', now: day(1) })
    assert.equal(tomorrow.ok, true)
    assert.equal(tomorrow.version, 3)
    assert.equal(a.id, tomorrow.id)
  })
})

test('一天只起一件新的；七天三件到顶就停', async () => {
  await withRoot(async (root) => {
    await makeWork(root, { title: '甲', text: '甲的正文。', now: day(0) })
    const sameDay = await makeWork(root, { title: '乙', text: '乙的正文。', now: day(0) + 1000 })
    assert.equal(sameDay.ok, false)
    assert.match(sameDay.note, /今天已经起过一件了/)
    assert.equal(WORK_PER_DAY, 1)
    assert.equal((await makeWork(root, { title: '乙', text: '乙的正文。', now: day(1) })).ok, true)
    await closeWork(root, { title: '甲', state: 'done', now: day(1) })
    await closeWork(root, { title: '乙', state: 'done', now: day(1) })
    assert.equal((await makeWork(root, { title: '丙', text: '丙的正文。', now: day(2) })).ok, true)
    await closeWork(root, { title: '丙', state: 'done', now: day(2) })

    const fourth = await makeWork(root, { title: '丁', text: '丁的正文。', now: day(3) })
    assert.equal(fourth.ok, false)
    assert.match(fourth.note, /这七天里起的东西够多了/)
    assert.equal(WORK_NEW_PER_WEEK, 3)

    // 最早那件滑出七天之后，就能再起一件新的。
    assert.equal((await makeWork(root, { title: '丁', text: '丁的正文。', now: day(8) })).ok, true)
  })
})

test('收尾与放下：放下必须说一句为什么，放下之后不算「留着」', async () => {
  await withRoot(async (root) => {
    await makeWork(root, { title: '要收尾的', text: '写完了。', now: NOW })
    const done = await closeWork(root, { title: '要收尾的', state: 'done', now: NOW + 1000 })
    assert.equal(done.ok, true)
    assert.match(done.note, /收了尾/)

    await makeWork(root, { title: '要放下的', text: '算了。', now: day(1) })
    const noWhy = await closeWork(root, { title: '要放下的', state: 'dropped', now: day(1) + 1000 })
    assert.equal(noWhy.ok, false)
    assert.match(noWhy.note, /为什么/)
    const dropped = await closeWork(root, { title: '要放下的', state: 'dropped', reason: '越写越假，不做了', now: day(1) + 2000 })
    assert.equal(dropped.ok, true)
    const row = (await readWorks(root)).items.find((it) => it.title === '要放下的')
    assert.equal(row.state, 'dropped')
    assert.equal(row.droppedReason, '越写越假，不做了')

    const summary = await worksSummary(root)
    assert.equal(summary.count, 1, '放下的不算留着')
    assert.equal(summary.wip, 0)
    assert.equal((await closeWork(root, { title: '没这件', now: NOW })).ok, false)
  })
})

test('读回正文不留痕：账里不记，不写事件，桌上不会因此多出一行', async () => {
  await withRoot(async (root) => {
    const a = await makeWork(root, { title: '点开过的', text: '一稿。', now: NOW })
    const back = await readWorkText(root, { id: a.id })
    assert.equal(back.ok, true)
    assert.match(back.text, /一稿/)

    const db = await readWorks(root)
    assert.equal('lookedAt' in db.items[0], false, '读就是读，账里不留任何痕迹')
    const files = await readdir(root)
    assert.ok(!files.includes('events.jsonl'), '看过的记录不进事件流')
    assert.deepEqual(await worksForDesk(root, { now: NOW + DAY }), {
      wip: { id: a.id, title: '点开过的', stale: false, kind: 'text' },
    }, '桌上不会因此多摆一行「他看过了」')
  })
})

test('桌上总摆那一件：超过十四天就改说「有些天没动了」', async () => {
  await withRoot(async (root) => {
    const a = await makeWork(root, { title: '摊着的那件', text: '一稿。', now: NOW })
    const fresh = await worksForDesk(root, { now: NOW + 13 * DAY })
    assert.equal(fresh.wip.id, a.id)
    assert.equal(fresh.wip.stale, false, '十四天内还是「弄了一半」')
    // 1.0.5：过了十四天不是不摆，是改一句说法——不摆会变成看不见的堵死。
    const old = await worksForDesk(root, { now: NOW + 15 * DAY })
    assert.equal(old.wip.id, a.id, '过了十四天也还摆着')
    assert.equal(old.wip.stale, true, '只是改说「有些天没动了」')

    // 收起来了就不再摆。
    await closeWork(root, { title: '摊着的那件', state: 'done', now: NOW })
    assert.equal((await worksForDesk(root, { now: NOW })).wip, null)
  })
})

test('列表与摘要：最近的在前，摘要只给第一件和最近一件', async () => {
  await withRoot(async (root) => {
    await makeWork(root, { title: '早的', text: '先做的。', now: NOW })
    await makeWork(root, { title: '晚的', text: '后做的。', now: day(1) })
    const items = await listWorks(root, { limit: 10 })
    assert.deepEqual(items.map((it) => it.title), ['晚的', '早的'])
    assert.deepEqual(items.map((it) => it.versions), [[1], [1]])
    const summary = await worksSummary(root)
    assert.equal(summary.count, 2)
    assert.equal(summary.wip, 2)
    assert.equal(summary.latest.title, '晚的')
    assert.equal(summary.first.title, '早的')
  })
})

test('按名字找：只看名字本身，不拿「包含」去猜', async () => {
  await withRoot(async (root) => {
    const a = await makeWork(root, { title: '那条广告', text: '一稿。', now: NOW })
    const db = await readWorks(root)
    assert.equal(findWork(db.items, '《那条广告》').id, a.id, '书名号不算名字的一部分')
    assert.equal(findWork(db.items, a.id).id, a.id)
    assert.equal(findWork(db.items, '广告'), null, '只写半截名字不猜：猜错了就会把新东西写进旧账')
    assert.equal(findWork(db.items, '没写过的东西'), null)
    assert.equal(findWork(db.items, ''), null)
  })
})

test('坏账只当空：读永远不抛', async () => {
  await withRoot(async (root) => {
    await assert.rejects(readFile(worksFile(root), 'utf8'), { code: 'ENOENT' })
    assert.deepEqual((await readWorks(root)).items, [])
    const { writeFile } = await import('node:fs/promises')
    await writeFile(worksFile(root), '{坏了', 'utf8')
    assert.deepEqual((await readWorks(root)).items, [])
    assert.equal((await listWorks(root)).length, 0)
    assert.equal((await readWorkText(root, { title: '什么都没有' })).ok, false)
  })
})

// ---------------------------- 1.0.5：做出来的是一份文件 ----------------------------
// 她能画图 / 导出声音 / 剪一段影像（放行了对应工具就有），作品容器不能只收文字。

test('做出来的是一张图：文件复制进家里，账里记 kind 与那句说明', async () => {
  await withRoot(async (root) => {
    const { writeFile, mkdir } = await import('node:fs/promises')
    await mkdir(join(root, 'home'), { recursive: true })
    const src = join(root, 'home', 'lamp.png')
    await writeFile(src, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]))
    const r = await makeWork(root, {
      title: '一盏纸灯',
      text: '灯罩这里还太硬，压不下去。',
      file: src,
      now: NOW,
    })
    assert.equal(r.ok, true)
    const items = await listWorks(root, { limit: 5 })
    assert.equal(items[0].kind, 'image', '按扩展名认它是张图')
    const got = await readWorkText(root, { title: '一盏纸灯' })
    assert.equal(got.kind, 'image')
    assert.equal(got.file, `works/${r.id}/v1-一盏纸灯.png`)
    assert.equal(got.text, '灯罩这里还太硬，压不下去。', '读回来的是她写的那句说明，不是二进制')
    const bytes = await readFile(join(root, got.file))
    assert.equal(bytes.length, 8, '文件真的复制进家里了')
  })
})

test('文件产物：找不到就说找不到；相对路径从她的屋子算', async () => {
  await withRoot(async (root) => {
    const { writeFile, mkdir } = await import('node:fs/promises')
    const miss = await makeWork(root, { title: '空的', text: '想画点什么。', file: 'nope.png', now: NOW })
    assert.equal(miss.ok, false)
    assert.match(miss.note, /翻不到/)

    await mkdir(join(root, 'home'), { recursive: true })
    await writeFile(join(root, 'home', 'hum.mp3'), Buffer.from([1, 2, 3]))
    const rel = await makeWork(root, {
      title: '一段曲子',
      text: '主旋律总是往下掉。',
      file: 'hum.mp3',
      now: NOW,
    })
    assert.equal(rel.ok, true, '相对路径按 home/ 解析')
    const back = await readWorkText(root, { title: '一段曲子' })
    assert.equal(back.kind, 'audio')
    assert.match(back.file, /\.mp3$/)
  })
})

test('文件产物：工具给的是从根算的路径（home/drawings/…）也认', async () => {
  await withRoot(async (root) => {
    const { writeFile, mkdir } = await import('node:fs/promises')
    await mkdir(join(root, 'home', 'drawings'), { recursive: true })
    await writeFile(join(root, 'home', 'drawings', 'lamp.png'), Buffer.from([9, 9, 9, 9]))
    // 预演里她照着画图工具返回的路径抄过来，那串是从根算的（home/drawings/…）。
    // 只认「从自己屋子算」的话，这一版会白丢一次。
    const r = await makeWork(root, {
      title: '画下来的灯',
      text: '翘起来的那一圈照着画了，没有画平。',
      file: 'home/drawings/lamp.png',
      now: NOW,
    })
    assert.equal(r.ok, true, '从根算的相对路径也要认')
    const got = await readWorkText(root, { title: '画下来的灯' })
    assert.equal(got.kind, 'image')
    assert.equal(got.file, `works/${r.id}/v1-画下来的灯.png`)
  })
})

test('文件产物：只有文件没有说明也算留下了', async () => {
  await withRoot(async (root) => {
    const { writeFile } = await import('node:fs/promises')
    const src = join(root, 'shot.webp')
    await writeFile(src, Buffer.from([1, 2, 3, 4, 5]))
    const r = await makeWork(root, { title: '一张没说明的图', file: src, now: NOW })
    assert.equal(r.ok, true)
    const items = await listWorks(root, { limit: 5 })
    assert.equal(items[0].line, '（图）', '没写说明时，桌上/列表里只说它是图')
  })
})

// ---------------------------- 带进来的文件从哪儿来 ----------------------------
// file 收的是「她做出来的那一份」：她自己那几处（home / works / keepsakes / diary）里的东西
// 不分扩展名都收（图、声音、影像、代码、脚本、表格、幻灯片）；凭据文件（owner.json、
// config.json、cookie 这类）不收；数据目录里别处跟屋外一个口径，只收图 / 声音 / 影像。
// 下面的「凭据」全是合成的假字符串。

/** 一个临时的外层目录：里面一份数据根（data/）、一份根外的目录（elsewhere/）。 */
async function withRootAndOutside(fn) {
  const base = await mkdtemp(join(tmpdir(), 'dsh-fish-works-src-'))
  const { mkdir, writeFile } = await import('node:fs/promises')
  const root = join(base, 'data')
  const outside = join(base, 'elsewhere')
  await mkdir(join(root, 'home'), { recursive: true })
  await mkdir(outside, { recursive: true })
  await writeFile(join(outside, 'notes.key'), 'FAKE-KEY-0000\n')
  await writeFile(join(outside, 'shot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 7, 7]))
  await writeFile(join(root, 'owner.json'), JSON.stringify({ cookie: 'FAKECOOKIE=0000' }))
  await writeFile(join(root, 'cloud-key.txt'), 'fake-passphrase-0000\n')
  try {
    return await fn({ root, outside })
  } finally {
    await rm(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}

async function worksFiles(root) {
  const out = []
  const walk = async (dir, pre) => {
    let list = []
    try { list = await readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of list) {
      const rel = pre ? `${pre}/${e.name}` : e.name
      if (e.isDirectory()) await walk(join(dir, e.name), rel)
      else out.push(rel)
    }
  }
  await walk(worksDir(root), '')
  return out
}

test('文件产物：根外的普通文件不收，什么都不搬', async () => {
  await withRootAndOutside(async ({ root, outside }) => {
    const r = await makeWork(root, { title: '一份', text: '说明', file: join(outside, 'notes.key'), now: NOW })
    assert.equal(r.ok, false)
    assert.match(r.note, /不能当成作品带进来/)
    assert.deepEqual(await worksFiles(root), [], 'works/ 里不该多出任何文件')
    assert.deepEqual((await readWorks(root)).items, [])
  })
})

test('文件产物：数据目录里不是她的那些文件（owner.json / cloud-key.txt）不收', async () => {
  await withRootAndOutside(async ({ root }) => {
    const tries = [
      '../owner.json',
      '../cloud-key.txt',
      'home/../config.json',
      join(root, 'owner.json'),
    ]
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(root, 'config.json'), JSON.stringify({ cloud: { targets: [{ token: 'FAKETOKEN0000' }] } }))
    for (const [i, file] of tries.entries()) {
      const r = await makeWork(root, { title: `第${i}份`, text: '说明', file, now: day(i) })
      assert.equal(r.ok, false, `${file} 不该被收`)
      assert.match(r.note, /不能当成作品带进来/)
    }
    assert.deepEqual(await worksFiles(root), [])
  })
})

test('文件产物：设备路径（\\\\?\\、\\\\.\\、\\??\\）不收，哪怕指到根外的图', async () => {
  await withRootAndOutside(async ({ root, outside }) => {
    const img = join(outside, 'shot.png')
    const tries = [`\\\\?\\${img}`, `\\\\.\\${img}`, `\\??\\${img}`]
    for (const [i, file] of tries.entries()) {
      const r = await makeWork(root, { title: `设备${i}`, text: '说明', file, now: day(i) })
      assert.equal(r.ok, false, `${file} 不该被收`)
      assert.match(r.note, /网络共享和设备路径不收/)
    }
    assert.deepEqual(await worksFiles(root), [])
  })
})

test('文件产物：网络共享路径不收，也不去碰文件系统', async () => {
  await withRootAndOutside(async ({ root }) => {
    // 主机名用 .invalid：万一判断漏了，也连不到真主机。
    const tries = [
      '\\\\fakehost.invalid\\share\\x.png',
      '//fakehost.invalid/share/x.png',
      '\\??\\UNC\\fakehost.invalid\\share\\x.png',
    ]
    for (const [i, file] of tries.entries()) {
      const t0 = Date.now()
      const r = await makeWork(root, { title: `共享${i}`, text: '说明', file, now: day(i) })
      assert.equal(r.ok, false, `${file} 不该被收`)
      assert.match(r.note, /网络共享和设备路径不收/)
      assert.ok(Date.now() - t0 < 2000, '拒绝应当在碰文件系统之前，不该等网络超时')
    }
    assert.deepEqual(await worksFiles(root), [])
  })
})

test('文件产物：根外的图照收（画图工具的输出目录不在她屋子里）', async () => {
  await withRootAndOutside(async ({ root, outside }) => {
    const r = await makeWork(root, { title: '外面画的', text: '工具画的', file: join(outside, 'shot.png'), now: NOW })
    assert.equal(r.ok, true, r.note)
    const got = await readWorkText(root, { title: '外面画的' })
    assert.equal(got.kind, 'image')
    assert.equal((await readFile(join(root, got.file))).length, 6)
  })
})

test('文件产物：她自己屋子里的文件不管是什么类型都收', async () => {
  await withRootAndOutside(async ({ root }) => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(root, 'home', 'plan.json'), '{"steps":["先画轮廓"]}')
    const r = await makeWork(root, { title: '一份方案', text: '写成了文件', file: 'plan.json', now: NOW })
    assert.equal(r.ok, true, r.note)
    const got = await readWorkText(root, { title: '一份方案' })
    assert.equal(got.kind, 'file')
    assert.equal(await readFile(join(root, got.file), 'utf8'), '{"steps":["先画轮廓"]}')
  })
})

test('文件产物：她自己那几处目录里到处的文件都收——代码、脚本、表格、幻灯片都行', async () => {
  await withRootAndOutside(async ({ root }) => {
    const { mkdir, writeFile } = await import('node:fs/promises')
    await mkdir(join(root, 'home', 'proj'), { recursive: true })
    await writeFile(join(root, 'home', 'proj', 'main.py'), 'print(1)\n')
    await writeFile(join(root, 'home', 'plan.docx'), Buffer.from([0x50, 0x4b, 3, 4]))
    await writeFile(join(root, 'home', 'worksheet.xlsx'), Buffer.from([0x50, 0x4b, 3, 4]))
    const cases = [
      ['home/plan.docx', '一份文档'],
      ['home/worksheet.xlsx', '一张表'],
      ['home/proj/main.py', '自己写的小脚本'],
    ]
    for (const [i, [file, title]] of cases.entries()) {
      const r = await makeWork(root, { title, text: '做成了文件', file, now: day(i) })
      assert.equal(r.ok, true, `${file}：${r.note}`)
      const got = await readWorkText(root, { title })
      assert.equal(got.kind, 'file', `${file} 是普通文件，不是图`)
      await closeWork(root, { title, now: day(i) })
    }
    const files = await worksFiles(root)
    for (const ext of ['.docx', '.xlsx', '.py']) {
      assert.ok(files.some((f) => f.endsWith(ext)), `works/ 里该有 ${ext}：${files.join(', ')}`)
    }
  })
})

test('文件产物：数据目录别处（根上、out/ 里）的普通文件不收——那不是她自己的东西', async () => {
  await withRootAndOutside(async ({ root }) => {
    const { mkdir, writeFile } = await import('node:fs/promises')
    await mkdir(join(root, 'out'), { recursive: true })
    await writeFile(join(root, 'plan.docx'), Buffer.from([0x50, 0x4b, 3, 4]))
    await writeFile(join(root, 'out', '2026-11-21.md'), '# 今天的记录\n')
    await writeFile(join(root, 'events.jsonl'), '{"ts":"2026-11-21T00:00:00Z"}\n')
    const tries = ['plan.docx', 'out/2026-11-21.md', 'events.jsonl', join(root, 'out', '2026-11-21.md')]
    for (const [i, file] of tries.entries()) {
      const r = await makeWork(root, { title: `别处${i}`, text: '说明', file, now: day(i) })
      assert.equal(r.ok, false, `${file} 不该被收`)
      assert.match(r.note, /别处的只收图、声音、影像/)
    }
    assert.deepEqual(await worksFiles(root), [], 'works/ 里不该多出任何文件')
  })
})

test('文件产物：凭据文件按精确名字判，不收', async () => {
  await withRootAndOutside(async ({ root }) => {
    const { writeFile } = await import('node:fs/promises')
    const cases = [
      ['home/.env', 'TOKEN=1\n'],
      ['home/cookies.txt', 'a=b\n'],
      ['home/key.pem', '-----BEGIN FAKE-----\n'],
      ['home/credentials.json', '{"token":"FAKE"}\n'],
    ]
    for (const [i, [name, body]] of cases.entries()) {
      await writeFile(join(root, ...name.split('/')), body)
      const r = await makeWork(root, { title: `钥匙${i}`, text: '说明', file: name, now: day(i) })
      assert.equal(r.ok, false, `${name} 不该被收`)
      assert.match(r.note, /凭据/, `${name} 该说清是凭据`)
    }
    assert.deepEqual(await worksFiles(root), [], 'works/ 里不该多出任何文件')
  })
})

test('文件产物：名字里带 token / secret 的正常文件照收，不按词根猜', async () => {
  await withRootAndOutside(async ({ root }) => {
    const { writeFile } = await import('node:fs/promises')
    const cases = [
      ['home/tokenizer.py', 'def split(s): return s.split()\n'],
      ['home/token_budget.md', '# 今天的额度\n'],
      ['home/secret-santa.md', '# 抽签\n'],
      ['home/.gitignore', 'node_modules/\n'],
    ]
    // 一周最多起三件（WORK_NEW_PER_WEEK = 3），第四件放到下一周。
    const days = [0, 1, 2, 8]
    for (const [i, [name, body]] of cases.entries()) {
      await writeFile(join(root, ...name.split('/')), body)
      const title = `正常${i}`
      const r = await makeWork(root, { title, text: '说明', file: name, now: day(days[i]) })
      assert.equal(r.ok, true, `${name} 该收：${r.note}`)
      await closeWork(root, { title, now: day(days[i]) })
    }
    assert.equal((await worksFiles(root)).length, 4)
  })
})

test('文件产物：屋子里的链接指到外面的普通文件，也不收', async (t) => {
  await withRootAndOutside(async ({ root, outside }) => {
    const { symlink, writeFile } = await import('node:fs/promises')
    // 目录链接：Windows 上用 junction（不要管理员权限），别处用普通目录软链。
    // 两头都在这次测试自己建的临时目录里。
    let dirLinked = true
    try {
      await symlink(outside, join(root, 'home', 'drawings'), process.platform === 'win32' ? 'junction' : 'dir')
    } catch {
      dirLinked = false
    }
    if (dirLinked) {
      const viaDir = await makeWork(root, { title: '链进来的', text: '说明', file: 'drawings/notes.key', now: NOW })
      assert.equal(viaDir.ok, false, '目录链接指到根外，普通文件不收')
      assert.match(viaDir.note, /不能当成作品带进来/)
      const img = await makeWork(root, { title: '链进来的图', text: '说明', file: 'drawings/shot.png', now: day(1) })
      assert.equal(img.ok, true, '链到根外的图还是图，照收')
    }
    // 文件链接：起个像图的名字，指到根外的普通文件、或者根里的 owner.json；
    // 再起一个指到她屋子里的一段声音。Windows 上没有权限建文件软链就跳过这一半。
    await writeFile(join(root, 'home', 'tune.mp3'), Buffer.from([1, 2, 3]))
    let fileLinked = true
    try {
      await symlink(join(outside, 'notes.key'), join(root, 'home', 'look.png'), 'file')
      await symlink(join(root, 'owner.json'), join(root, 'home', 'face.png'), 'file')
      await symlink(join(root, 'home', 'tune.mp3'), join(root, 'home', 'alias.png'), 'file')
    } catch {
      fileLinked = false
    }
    if (fileLinked) {
      for (const [i, file] of ['look.png', 'face.png'].entries()) {
        const r = await makeWork(root, { title: `改名的${i}`, text: '说明', file, now: day(2 + i) })
        assert.equal(r.ok, false, `${file} 指的不是图`)
        assert.match(r.note, /不能当成作品带进来/)
      }
      // 指到屋子里的东西照收，但类型和扩展名按真实那份算，不按链接的名字。
      const own = await makeWork(root, { title: '链到自己的', text: '说明', file: 'alias.png', now: day(4) })
      assert.equal(own.ok, true, own.note)
      const got = await readWorkText(root, { title: '链到自己的' })
      assert.equal(got.kind, 'audio', '类型按真实那份算')
      assert.match(got.file, /\.mp3$/, '扩展名也按真实那份算')
    }
    if (!dirLinked && !fileLinked) t.skip('这台机器上建不了链接')
    const files = await worksFiles(root)
    assert.ok(!files.some((f) => /\.(key|json)$/.test(f)), `works/ 里不该有 .key / .json：${files.join(', ')}`)
  })
})
