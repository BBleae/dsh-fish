#!/usr/bin/env node
// @ts-check
/**
 * scripts/build-client.mjs —— 把 `lib/client/*.js` 按序拼成浏览器单入口 `lib/client.js`
 *
 * 为什么这样拆而不引打包器：
 *   1. 零依赖铁律（dependencies / peerDependencies / devDependencies 全空），不能引 esbuild / rollup；
 *   2. 支持 `dsh plugin add "github:mochi-fish/dsh-fish"` 与 `link:` 源码直连，仓库里必须直接有可跑的 `lib/client.js`；
 *   3. 宿主客户端加载器（`window.__ModuleLoader__.load`）按 `./client` 单脚本装载。
 *
 * 同时把服务端 `lib/session-pressure-formulas.js` 的共享公式自动嵌进 `// BEGIN shared pressure formulas` 槽位，
 * 不再需要两处手抄同步。
 *
 * 用法：
 *   node scripts/build-client.mjs          # 重新生成 lib/client.js
 *   node scripts/build-client.mjs --check  # 只校验 lib/client.js 与分片源码是否逐字节一致（测试与 CI 用）
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const CLIENT_PARTS_DIR = path.join(ROOT, 'lib', 'client')
export const CLIENT_OUT_FILE = path.join(ROOT, 'lib', 'client.js')
export const FORMULAS_FILE = path.join(ROOT, 'lib', 'session-pressure-formulas.js')
export const FORMULAS_PLACEHOLDER = '    // {{SHARED_PRESSURE_FORMULAS}}'

/**
 * 读取服务端 `session-pressure-formulas.js`（去掉末尾 `export {...}`），缩进 4 格嵌入客户端壳。
 * @param {string} [root]
 * @returns {string}
 */
export function renderSharedFormulas(root = ROOT) {
  const raw = fs.readFileSync(path.join(root, 'lib', 'session-pressure-formulas.js'), 'utf8').replace(/\r\n/g, '\n')
  const body = raw.split('\nexport {')[0].trimEnd()
  const indented = body
    .split('\n')
    .map((line) => (line.length ? `    ${line}` : ''))
    .join('\n')
  return `    // BEGIN shared pressure formulas\n${indented}\n    // END shared pressure formulas`
}

/**
 * 按文件名顺序读取 `lib/client/*.js` 并拼出完整的 `lib/client.js` 源码（LF 换行）。
 * @param {string} [root]
 * @returns {{ code: string, parts: string[] }}
 */
export function buildClientSource(root = ROOT) {
  const dir = path.join(root, 'lib', 'client')
  const parts = fs.readdirSync(dir).filter((f) => /^\d{2}-.*\.js$/.test(f)).sort()
  if (!parts.length) {
    throw new Error(`lib/client/ 下没有找到客户端分片文件（${dir}）`)
  }
  const chunks = parts.map((name) => {
    const text = fs.readFileSync(path.join(dir, name), 'utf8').replace(/\r\n/g, '\n')
    if (name === '00-shell.js') {
      if (!text.includes(FORMULAS_PLACEHOLDER)) {
        throw new Error(`lib/client/00-shell.js 缺少共享公式占位符：${FORMULAS_PLACEHOLDER}`)
      }
      return text.replace(FORMULAS_PLACEHOLDER, renderSharedFormulas(root))
    }
    return text
  })
  return { code: chunks.join('\n'), parts }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const checkOnly = process.argv.includes('--check')
  const { code, parts } = buildClientSource(ROOT)
  if (checkOnly) {
    const current = fs.readFileSync(CLIENT_OUT_FILE, 'utf8').replace(/\r\n/g, '\n')
    if (current !== code) {
      console.error('✖ lib/client.js 与 lib/client/*.js 分片不一致。请运行：node scripts/build-client.mjs')
      process.exit(1)
    }
    console.log(`✔ lib/client.js 与 ${parts.length} 个分片及共享公式逐字节一致。`)
  } else {
    fs.writeFileSync(CLIENT_OUT_FILE, code, 'utf8')
    console.log(`✔ 已从 ${parts.length} 个分片生成 lib/client.js（${Buffer.byteLength(code, 'utf8')} 字节）。`)
  }
}
