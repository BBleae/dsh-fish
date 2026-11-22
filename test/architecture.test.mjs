/**
 * architecture.test.mjs —— 模块拆分、客户端分片拼接、零依赖类型契约与漏检缺陷回归守卫
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ALL_TYPES, HER_TYPES, SCENES, FLAGS } from '../lib/schema.js'
import { noteRisk, riskState } from '../lib/risk.js'
import { deriveStatus } from '../lib/status.js'
import { registerObserve, metaIdLines, settleTripReview, resolveSessionAgent } from '../lib/observe.js'
import { buildClientSource } from '../scripts/build-client.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIB = join(ROOT, 'lib')

/** 从 `types.d.ts` 的 `export type Name = ...` 段落里提取全部单引号字面量。 */
function extractUnionLiterals(dts, typeName) {
  const re = new RegExp(`export type ${typeName}\\s*=([\\s\\S]*?)(?=\\n\\n|\\nexport )`)
  const m = dts.match(re)
  assert.ok(m, `types.d.ts 里找不到 ${typeName}`)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

test('客户端分片：scripts/build-client.mjs 拼出的结果与 lib/client.js 逐字节一致，且单分片不过大', async () => {
  const { code, parts } = buildClientSource(ROOT)
  const disk = (await readFile(join(LIB, 'client.js'), 'utf8')).replace(/\r\n/g, '\n')
  assert.equal(disk, code, '改了 lib/client/*.js 或共享公式后请跑一次 node scripts/build-client.mjs')
  assert.ok(parts.length >= 10, `客户端分片数量异常：${parts.length}`)

  for (const name of parts) {
    const text = await readFile(join(LIB, 'client', name), 'utf8')
    const lines = text.split('\n').length
    assert.ok(lines <= 1000, `lib/client/${name} 有 ${lines} 行，超过 1000 行上限，请继续按页签/职责拆薄`)
  }
})

test('观测台拆分：observe.js 保持原命名导出，且各 observe*.js 模块行数受控', async () => {
  assert.equal(typeof registerObserve, 'function')
  assert.equal(typeof metaIdLines, 'function')
  assert.equal(typeof settleTripReview, 'function')
  assert.equal(typeof resolveSessionAgent, 'function')

  const files = (await readdir(LIB)).filter((f) => f === 'observe.js' || (f.startsWith('observe-') && f.endsWith('.js')))
  assert.ok(files.length >= 7, `observe 子模块数量异常：${files.join(', ')}`)
  for (const f of files) {
    const text = await readFile(join(LIB, f), 'utf8')
    const lines = text.split('\n').length
    assert.ok(lines <= 800, `lib/${f} 有 ${lines} 行，超过 800 行上限`)
  }
})

test('类型契约防漂移：types.d.ts 与 schema.js 的事件类型、场次、标记字面量完全一致', async () => {
  const jsconfig = JSON.parse(await readFile(join(ROOT, 'jsconfig.json'), 'utf8'))
  assert.equal(jsconfig.compilerOptions?.allowJs, true)
  assert.equal(jsconfig.compilerOptions?.noEmit, true)
  assert.equal(jsconfig.compilerOptions?.strictNullChecks, true)

  const dts = await readFile(join(LIB, 'types.d.ts'), 'utf8')
  const herTypes = extractUnionLiterals(dts, 'HerEventType')
  const sysTypes = extractUnionLiterals(dts, 'SystemOnlyEventType')
  const scenes = extractUnionLiterals(dts, 'EventScene')
  const flags = extractUnionLiterals(dts, 'EventFlag')

  assert.deepEqual([...herTypes].sort(), [...HER_TYPES].sort(), 'HerEventType 与 schema.js HER_TYPES 不一致')
  assert.deepEqual([...new Set([...herTypes, ...sysTypes])].sort(), [...new Set(ALL_TYPES)].sort(), 'EventType 与 schema.js ALL_TYPES 不一致')
  assert.deepEqual([...scenes].sort(), [...SCENES].sort(), 'EventScene 与 schema.js SCENES 不一致')
  assert.deepEqual([...flags].sort(), [...FLAGS].sort(), 'EventFlag 与 schema.js FLAGS 不一致')
})

test('核心中枢模块保持首行 // @ts-check 开启', async () => {
  const hubs = [
    'index.js',
    'schema.js',
    'settings.js',
    'derive.js',
    'status.js',
    'observe.js',
    'observe-http.js',
    'observe-trip.js',
    'observe-state.js',
    'observe-config.js',
    'observe-bili.js',
    'observe-home.js',
    'observe-data.js',
    'observe-outing.js',
  ]
  for (const f of hubs) {
    const first = (await readFile(join(LIB, f), 'utf8')).split(/\r?\n/, 1)[0]
    assert.equal(first, '// @ts-check', `lib/${f} 首行必须保持 // @ts-check`)
  }
})

test('回归：POST /dsh-fish/cloud/target 保存文件夹目标回 200 且落盘脱敏回执（修 publicTarget 漏引与未 await）', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fish-arch-cloud-'))
  try {
    const routes = []
    const ctx = {
      get: (k) => (k === 'connection'
        ? { requestRejection: () => null }
        : k === 'webServer'
          ? { register: (def) => { routes.push(def); return () => {} } }
          : null),
    }
    const obs = registerObserve(ctx, { root })
    try {
      const route = routes.find((r) => r.path === '/dsh-fish/cloud/target')
      assert.ok(route, '要有 /cloud/target 路由')

      const body = JSON.stringify({
        target: { kind: 'git', repo: 'owner/private-bak', token: 'ghp_secret123456', branch: 'main' },
      })
      const req = {
        method: 'POST',
        url: '/dsh-fish/cloud/target',
        headers: { 'content-type': 'application/json' },
        on(ev, fn) {
          if (ev === 'data') fn(Buffer.from(body, 'utf8'))
          if (ev === 'end') fn()
        },
      }
      let status = 0
      let payload = null
      const res = {
        writeHead(s) { status = s },
        end(s) { payload = JSON.parse(String(s || '{}')) },
      }
      await route.handler(req, res)
      assert.equal(status, 200, `保存云端目标不应 500：${JSON.stringify(payload)}`)
      assert.equal(payload.ok, true)
      assert.equal(payload.target?.kind, 'git')
      assert.equal(payload.target?.token, '', '回执必须经过 publicTarget 擦除明文 token')
      assert.equal(payload.target?.filled?.token, true)
    } finally {
      obs.dispose()
    }
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})

test('回归：POST /dsh-fish/risk 传 {"clear":true} 真能解冻风控，且 deriveStatus 空配置不抛错', async () => {
  const st = deriveStatus({ events: [], config: {} })
  assert.equal(typeof st.phase, 'string')

  const root = await mkdtemp(join(tmpdir(), 'fish-arch-risk-'))
  try {
    noteRisk(root, 'http 412')
    assert.ok(riskState(root).strikes > 0, '先制造一次风控记录')

    const routes = []
    const ctx = {
      get: (k) => (k === 'connection'
        ? { requestRejection: () => null }
        : k === 'webServer'
          ? { register: (def) => { routes.push(def); return () => {} } }
          : null),
    }
    const obs = registerObserve(ctx, { root })
    try {
      const route = routes.find((r) => r.path === '/dsh-fish/risk')
      assert.ok(route, '要有 /risk 路由')

      const body = JSON.stringify({ clear: true })
      const req = {
        method: 'POST',
        url: '/dsh-fish/risk',
        headers: { 'content-type': 'application/json' },
        on(ev, fn) {
          if (ev === 'data') fn(Buffer.from(body, 'utf8'))
          if (ev === 'end') fn()
        },
      }
      let status = 0
      let payload = null
      const res = {
        writeHead(s) { status = s },
        end(s) { payload = JSON.parse(String(s || '{}')) },
      }
      await route.handler(req, res)
      assert.equal(status, 200)
      assert.equal(payload.cleared, true, 'JSON 请求体应被解析并执行 clearRisk')
      assert.equal(riskState(root).strikes, 0)
    } finally {
      obs.dispose()
    }
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})
