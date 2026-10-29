#!/usr/bin/env node
/**
 * 用无头浏览器验证 site/index.html 真的能渲染出来。
 * 不依赖 puppeteer：用 Edge/Chrome 的 --headless --dump-dom。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SITE = path.join(ROOT, 'site')

const candidates = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]
const browser = candidates.find((p) => fs.existsSync(p))
if (!browser) {
  console.error('找不到 Edge 或 Chrome，跳过浏览器验证')
  process.exit(2)
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'plaza-verify-'))
const url = 'file:///' + path.join(SITE, 'index.html').replaceAll('\\', '/')

let dom
try {
  dom = execFileSync(browser, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--allow-file-access-from-files',
    '--virtual-time-budget=4000',
    '--user-data-dir=' + profile,
    '--dump-dom',
    url,
  ], { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] })
} catch (error) {
  console.error('浏览器执行失败：' + error.message.split('\n')[0])
  process.exit(2)
}

const checks = [
  ['渲染出卡片', /class="card"/.test(dom)],
  ['三个名字都在', ['大肥鱼', '阿茶', '听澜'].every((n) => dom.includes(n))],
  ['显示字数', /\d+ 字/.test(dom)],
  ['标签按钮生成', /class="tag"/.test(dom)],
  ['计数正确', /显示 3 \/ 3 条/.test(dom)],
  // 注意：--dump-dom 会把 <script> 源码一起输出，所以不能直接搜「加载失败」这个字符串，
  // 要看的是 meta 元素里实际渲染出来的内容。
  ['没有落在加载失败分支', !/id="meta"[^>]*>加载失败/.test(dom)],
]

let failed = 0
for (const [label, ok] of checks) {
  console.log((ok ? '✓ ' : '✗ ') + label)
  if (!ok) failed++
}

fs.rmSync(profile, { recursive: true, force: true })
process.exit(failed === 0 ? 0 : 1)
