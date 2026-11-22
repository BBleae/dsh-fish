// @ts-check
/**
 * 兼容旧入口：把 `lib/session-pressure-formulas.js` 与 `lib/client/*.js` 一并拼回 `lib/client.js`。
 */
import { writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { CLIENT_OUT_FILE, buildClientSource } from './build-client.mjs'

const { code } = buildClientSource()
const original = readFileSync(CLIENT_OUT_FILE, 'utf8').replace(/\r\n/g, '\n')
if (code !== original) {
  if (process.argv.includes('--check')) throw new Error('Client formulas or slices are out of sync')
  await writeFile(CLIENT_OUT_FILE, code, 'utf8')
}
