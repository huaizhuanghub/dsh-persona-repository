#!/usr/bin/env node
/**
 * 不依赖浏览器的站点自检：验证 index.html 与 personas.json 的数据契约对得上。
 *
 * 检查的是「页面要读的字段，数据里到底有没有」，比跑浏览器更稳定，
 * 也能在 CI 里跑。真正的视觉验证请看 scripts/verify-site.mjs。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const checks = []
function check(label, fn) {
  try {
    fn()
    checks.push([label, true, ''])
  } catch (error) {
    checks.push([label, false, error.message])
  }
}

const htmlPath = path.join(ROOT, 'site', 'index.html')
const dataPath = path.join(ROOT, 'site', 'personas.json')
const manifestPath = path.join(ROOT, 'data', 'manifest.json')

const html = fs.readFileSync(htmlPath, 'utf8')
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

check('index.html 能读到 personas.json', () => {
  if (!html.includes("fetch('personas.json'")) throw new Error('页面没有 fetch personas.json')
})

check('页面用到的字段在数据里都存在', () => {
  for (const p of data.personas) {
    for (const field of ['id', 'name', 'summary', 'tags', 'chars', 'author', 'body', 'blob']) {
      if (p[field] === undefined) throw new Error(`${p.id} 缺少字段 ${field}`)
    }
    if (typeof p.chars !== 'number') throw new Error(`${p.id} 的 chars 不是数字`)
    if (!Array.isArray(p.tags)) throw new Error(`${p.id} 的 tags 不是数组`)
  }
})

check('网页数据比 manifest 多出正文（这是设计）', () => {
  if (data.personas.length !== manifest.personas.length) throw new Error('两边条目数不一致')
  if (manifest.personas.some((p) => 'body' in p)) throw new Error('manifest 不该含正文')
  if (data.personas.some((p) => !p.body)) throw new Error('网页数据缺少正文')
})

check('每条正文的 sha256 与 manifest 一致', () => {
  for (const p of manifest.personas) {
    const full = data.personas.find((x) => x.id === p.id)
    const hash = createHash('sha256').update(full.body).digest('hex')
    if (hash !== p.sha256) throw new Error(`${p.id} 正文哈希对不上`)
  }
})

check('页面没有内联脚本注入点（正文一律走 textContent）', () => {
  if (!html.includes('document.createTextNode') && !html.includes('.textContent')) {
    throw new Error('页面似乎没有用 textContent 渲染正文')
  }
  if (html.includes('innerHTML =') && !html.includes('innerHTML = \'\'')) {
    throw new Error('发现 innerHTML 赋值，正文可能有 XSS 风险')
  }
})

check('站点不含第三方请求', () => {
  const external = html.match(/https?:\/\/[^"'\s)]+/g) || []
  const allowed = external.filter((u) => !u.includes('github.com') && !u.includes('githubusercontent.com'))
  if (allowed.length > 0) throw new Error('发现意外的外部地址：' + allowed.join(', '))
})

let failed = 0
for (const [label, ok, message] of checks) {
  console.log((ok ? '✓ ' : '✗ ') + label + (ok ? '' : ' — ' + message))
  if (!ok) failed++
}
process.exit(failed === 0 ? 0 : 1)
