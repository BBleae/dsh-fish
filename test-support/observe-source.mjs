/**
 * observe-source.mjs —— 观测台服务端全部模块的源码拼接（供源码守门测试用）
 *
 * observe.js 按职责拆成 observe.js + observe-*.js 后，无论是正向断言（某条路由用没用某个守卫）
 * 还是反向断言（整个观测台都不许再出现某个废弃接口），统一扫全部 observe*.js 才不会漏掉子模块。
 *
 * 放在 test-support/ 而不是 test/ 下：Node 内置的 `node --test` 默认会把 test 目录下的全部脚本
 * 当成测试文件执行，助手模块放进 test/ 会多出一条零断言的空文件用例。
 */

import { readdirSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib')

function observeFiles() {
  return readdirSync(LIB)
    .filter((f) => f === 'observe.js' || (f.startsWith('observe-') && f.endsWith('.js')))
    .sort()
}

export function readObserveSourceSync() {
  return observeFiles()
    .map((f) => readFileSync(join(LIB, f), 'utf8'))
    .join('\n')
}

export async function readObserveSource() {
  const parts = await Promise.all(observeFiles().map((f) => readFile(join(LIB, f), 'utf8')))
  return parts.join('\n')
}
