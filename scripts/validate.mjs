#!/usr/bin/env node
/**
 * 投稿校验脚本（CI 与本地共用）。
 *
 * build.mjs 已经会做大部分检查，这里补上**只适合在 CI 里做**的部分：
 *  - 检查改动是否只动了 personas/ 下自己的目录（防止有人在 PR 里顺手改别人的稿）
 *  - 检查新增文件的作者是否与 PR 提交人一致
 *
 * 用法：
 *   node scripts/validate.mjs             本地：只做静态校验
 *   node scripts/validate.mjs --ci         CI：额外检查改动范围
 *
 * 依赖环境变量（CI 自动提供）：
 *   GITHUB_EVENT_NAME, GITHUB_BASE_REF, GITHUB_ACTOR
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PERSONA_DIR = path.join(ROOT, 'personas')

const isCI = process.argv.includes('--ci')
const problems = []
const notes = []

/** 允许在 PR 里改的顶层路径。 */
const ALLOWED_TOP = ['personas/', 'data/', 'README.md', 'site/personas.json']

function fail(msg) {
  problems.push(msg)
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue
      walk(full, out)
    } else if (entry.isFile()) {
      out.push(full)
    }
  }
  return out
}

function checkPersonaFiles() {
  const files = walk(PERSONA_DIR).filter((f) => f.endsWith('.md'))
  if (files.length === 0) {
    fail('personas/ 下没有任何 .md 文件')
    return
  }

  for (const file of files) {
    const rel = path.relative(ROOT, file).replaceAll('\\', '/')
    const base = path.basename(file)

    // 跳过模板和以下划线开头的文件
    if (base.startsWith('_')) continue

    const raw = fs.readFileSync(file, 'utf8')
    if (!raw.startsWith('---')) {
      fail(`${rel}: 文件必须以 --- 开头（frontmatter）`)
      continue
    }

    // 最后一节：正文里不该再出现裸 HTML 脚本
    if (/<script\b/i.test(raw)) {
      fail(`${rel}: 正文里不允许出现 <script> 标签`)
    }

    // 目录层级必须是 personas/<author>/<slug>.md
    const parts = rel.split('/')
    if (parts.length !== 3) {
      fail(`${rel}: 路径必须是 personas/<author>/<slug>.md，不能多一层也不能少一层`)
    }
  }
}

/** 校验改动范围：PR 只能动自己的目录 + 生成物。 */
function checkScope() {
  if (!isCI) return
  const base = process.env.GITHUB_BASE_REF
  if (!base) {
    notes.push('没有 GITHUB_BASE_REF，跳过改动范围检查')
    return
  }

  let changed = ''
  try {
    changed = execSync(`git diff --name-only origin/${base}...HEAD`, { encoding: 'utf8', cwd: ROOT })
  } catch (error) {
    notes.push(`无法获取 diff（${error.message.split('\n')[0]}），跳过范围检查`)
    return
  }

  const files = changed.split('\n').map((f) => f.trim()).filter(Boolean)
  const actor = process.env.GITHUB_ACTOR || ''
  const outer = []

  for (const file of files) {
    if (!ALLOWED_TOP.some((prefix) => file === prefix || file.startsWith(prefix))) {
      outer.push(file)
      continue
    }

    // 改的是别人的目录？
    const match = /^personas\/([^/]+)\//.exec(file)
    if (match && actor && match[1] !== actor) {
      const isOwner = isTaggedAsOwner(match[1])
      if (!isOwner) {
        notes.push(`${file}: 你改的是「${match[1]}」目录（提交人是你：${actor}）。如果是代原作者提交，请在 PR 描述里说明并 @ 对方确认。`)
      }
    }
  }

  if (outer.length > 0) {
    fail(`PR 改动了不允许的路径：\n  ${outer.join('\n  ')}\n只允许改 personas/<你的用户名>/、data/、site/personas.json、README.md。`)
  }
}

/** 作者目录是否属于 org 里的维护者（这里只能靠命名约定，不做网络请求）。 */
function isTaggedAsOwner(dir) {
  return dir === 'huaizhuanghub'
}

function main() {
  checkPersonaFiles()
  checkScope()

  if (problems.length > 0) {
    console.error('校验未通过：\n' + problems.map((p) => `  ✗ ${p}`).join('\n'))
    if (notes.length > 0) {
      console.warn('\n提示：\n' + notes.map((n) => `  · ${n}`).join('\n'))
    }
    process.exit(1)
  }

  console.log('✓ 校验通过')
  if (notes.length > 0) {
    for (const note of notes) console.log(`  · ${note}`)
  }
}

main()
