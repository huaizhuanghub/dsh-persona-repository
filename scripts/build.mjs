#!/usr/bin/env node
/**
 * 人设广场构建脚本。
 *
 * 唯一真相来源是 personas/<author>/<slug>.md。本脚本从这些人设文件生成：
 *
 *   1. data/manifest.json  —— 给插件和网页读的机器可读清单
 *   2. README.md 里的人设目录段 —— 给人看的表格
 *   3. site/index.html 用的数据  —— 直接把 manifest 内联进 static site
 *
 * 所有生成物都不可手改：CI 会重跑本脚本并检查 git 是否有 diff。
 *
 * 用法：
 *   node scripts/build.mjs            生成全部
 *   node scripts/build.mjs --check    只校验，不写文件（CI 用，有 diff 就失败）
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PERSONA_DIR = path.join(ROOT, 'personas')
const DATA_DIR = path.join(ROOT, 'data')
const SITE_DIR = path.join(ROOT, 'site')
const README = path.join(ROOT, 'README.md')

const README_BEGIN = '<!-- BEGIN:personas'
const README_END = '<!-- END:personas -->'

/** 仓库标识：CI 里由 GitHub 提供；本地回落成真实仓库名，别让占位符进产物。 */
const REPO = process.env.GITHUB_REPOSITORY || 'huaizhuanghub/dsh-persona-repository'
/** Pages 站点根地址。 */
const PAGES_BASE = process.env.PAGES_BASE || `https://${REPO.split('/')[0]}.github.io/${REPO.split('/')[1]}/`

/**
 * blob / raw 链接里用的分支名。
 *
 * pull_request 事件里 `GITHUB_REF_NAME` 是 `4/merge` 这类合成 ref，拿它拼链接会得到
 * `.../blob/4/merge/...`，而仓库里提交的生成物写的是 `main`，于是 `--check` 每次都在
 * PR 上误报「生成物不一致」——与投稿内容无关，所有 PR 一律被打回。
 *
 * 所以：优先取 PR 的目标分支（`GITHUB_BASE_REF`），其次取看起来像真实分支名的 ref，
 * 最后回落 `main`。push 到 main 时 `GITHUB_REF_NAME=main`，结果不变。
 */
function resolveBranch() {
  const base = process.env.GITHUB_BASE_REF
  if (base) return base

  const ref = process.env.GITHUB_REF_NAME || ''
  // 合成 ref 一定含 `/`（`4/merge`、`merge_group/...`），含 `/` 就不是分支名
  if (/^[A-Za-z0-9._-]+$/.test(ref)) return ref

  return 'main'
}

const BRANCH = resolveBranch()

const REQUIRED_FIELDS = ['name', 'author', 'summary', 'tags', 'version', 'license']

const errors = []
const warnings = []

/**
 * 极简 YAML frontmatter 解析器。
 *
 * 只支持本项目需要的子集：`key: value`、行内数组 `[a, b]`、块状数组
 * （`- a` 换行）。引入完整 YAML 解析器会让构建多一个依赖，不划算。
 */
export function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  if (!match) return { data: null, body: raw, error: '缺少 --- 包裹的 frontmatter' }

  const [, head, body] = match
  const data = {}
  let listKey = null

  for (const rawLine of head.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '')
    if (!line.trim() || line.trim().startsWith('#')) continue

    // 块状数组的续行：  - item
    const listItem = /^\s*-\s+(.*)$/.exec(line)
    if (listItem && listKey) {
      data[listKey].push(unquote(listItem[1]))
      continue
    }

    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (!kv) {
      errors.push(`无法解析的 frontmatter 行: ${line}`)
      continue
    }
    const [, key, rest] = kv
    const value = rest.trim()

    if (value === '') {
      // 空值后面可能跟块状数组
      data[key] = []
      listKey = key
      continue
    }

    listKey = null
    if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((item) => unquote(item.trim()))
        .filter(Boolean)
    } else {
      data[key] = unquote(value)
    }
  }

  return { data, body, error: null }
}

function unquote(text) {
  const trimmed = text.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/** 递归找出所有投稿的人设文件（跳过 _template.md 与以 _ 开头的文件）。 */
function collectPersonaFiles() {
  const found = []
  if (!fs.existsSync(PERSONA_DIR)) return found

  for (const entry of fs.readdirSync(PERSONA_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue
    const authorDir = path.join(PERSONA_DIR, entry.name)
    const author = entry.name

    for (const file of fs.readdirSync(authorDir)) {
      if (!file.endsWith('.md') || file.startsWith('_') || file.startsWith('.')) continue
      found.push({ author, slug: file.replace(/\.md$/, ''), file: path.join(authorDir, file) })
    }
  }
  return found
}

/** 扫描常见的密钥 / 个人信息泄漏特征。 */
const SECRET_PATTERNS = [
  { re: /sk-[A-Za-z0-9]{20,}/, label: '疑似 OpenAI 风格 key' },
  { re: /ghp_[A-Za-z0-9]{30,}/, label: '疑似 GitHub token' },
  { re: /gh[pousr]_[A-Za-z0-9]{20,}/, label: '疑似 GitHub token' },
  { re: /Bearer\s+[A-Za-z0-9._-]{20,}/, label: '疑似 Bearer token' },
  { re: /AKIA[0-9A-Z]{16}/, label: '疑似 AWS key' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: '疑似私钥' },
]

/** 个人信息：只提醒，不拦（正文里出现「用户」的邮箱可能是故意举例）。 */
const PII_PATTERNS = [
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, label: '疑似邮箱地址' },
  { re: /(?<!\d)1[3-9]\d{9}(?!\d)/, label: '疑似手机号' },
]

function analyzeBody(body, relPath) {
  const chars = body.length
  if (chars === 0) errors.push(`${relPath}: 正文为空`)
  if (chars > 64000) errors.push(`${relPath}: 正文 ${chars} 字符，超过 64000 上限`)

  // 密钥：直接拦。这类东西一旦进了公开仓库就收不回来了。
  for (const { re, label } of SECRET_PATTERNS) {
    if (re.test(body)) errors.push(`${relPath}: ${label} —— 正文里不允许出现任何凭据，请删掉`)
  }
  // 个人信息：提醒，由维护者人工判断是不是举例
  for (const { re, label } of PII_PATTERNS) {
    if (re.test(body)) warnings.push(`${relPath}: ${label}（如果是举例请忽略，否则请删掉）`)
  }
  return chars
}

function normalizeTags(tags, relPath) {
  const list = Array.isArray(tags) ? tags : []
  if (list.length === 0) warnings.push(`${relPath}: tags 为空`)
  if (list.length > 8) warnings.push(`${relPath}: tags 超过 8 个`)

  const seen = new Set()
  for (const tag of list) {
    const trimmed = String(tag).trim()
    if (trimmed !== tag) warnings.push(`${relPath}: 标签「${tag}」含多余空格`)
    if (trimmed.length > 20) warnings.push(`${relPath}: 标签「${trimmed}」超过 20 字符`)
    if (seen.has(trimmed)) warnings.push(`${relPath}: 标签「${trimmed}」重复`)
    seen.add(trimmed)
  }
  return [...seen]
}

function buildOne({ author, slug, file }) {
  const relPath = path.relative(ROOT, file).replaceAll('\\', '/')
  const raw = fs.readFileSync(file, 'utf8')
  const { data, body, error } = parseFrontmatter(raw)

  if (error) {
    errors.push(`${relPath}: ${error}`)
    return null
  }

  for (const field of REQUIRED_FIELDS) {
    if (data[field] === undefined || data[field] === '' || (Array.isArray(data[field]) && data[field].length === 0)) {
      errors.push(`${relPath}: 缺少必填字段 \`${field}\``)
    }
  }

  // 目录名必须和 author 一致：投稿人没法冒用别人的目录
  if (data.author && data.author !== author) {
    errors.push(`${relPath}: frontmatter 里 author 是「${data.author}」，但目录是「${author}」，两者必须一致`)
  }

  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    errors.push(`${relPath}: 文件名「${slug}.md」只允许小写字母、数字、连字符`)
  }

  const name = data.name || slug
  if (String(name).length > 40) warnings.push(`${relPath}: 人设名「${name}」超过 40 字符`)
  if (String(data.summary || '').length > 200) warnings.push(`${relPath}: 简介超过 200 字符，列表里会截断`)

  const content = body.trim()
  const chars = analyzeBody(content, relPath)
  const tags = normalizeTags(data.tags, relPath)
  const hash = crypto.createHash('sha256').update(content).digest('hex')

  return {
    id: `${author}/${slug}`,
    name: String(name),
    author,
    summary: String(data.summary || '').trim(),
    tags,
    version: String(data.version || '0.0.0'),
    license: String(data.license || '未声明'),
    updated: String(data.updated || ''),
    chars,
    hash,
    sha256: hash,
    path: relPath,
    blob: `https://github.com/${REPO}/blob/${BRANCH}/${relPath}`,
    raw: `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${relPath}`,
    body: content,
  }
}

function renderReadmeTable(personas) {
  if (personas.length === 0) {
    return '> 还没有人设。投稿方式见 [CONTRIBUTING.md](./CONTRIBUTING.md)。'
  }

  const rows = personas
    .slice()
    .sort((a, b) => (b.updated || '').localeCompare(a.updated || '') || a.name.localeCompare(b.name, 'zh'))
    .map((p) => {
      const tags = p.tags.map((t) => `\`${t}\``).join(' ')
      const summary = p.summary.replaceAll('|', '\\|')
      return `| [${p.name}](./${p.path}) | ${summary} | ${tags} | ${p.chars.toLocaleString('en-US')} | [@${p.author}](https://github.com/${p.author}) |`
    })

  return [
    '| 人设 | 简介 | 标签 | 字数 | 作者 |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

function writeIfChanged(file, content, checkMode) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
  const changed = current !== content
  if (changed && !checkMode) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
  return changed
}

function main() {
  const checkMode = process.argv.includes('--check')
  const files = collectPersonaFiles()
  const personas = files.map(buildOne).filter(Boolean)

  // 同名撞车检测：不同作者可以同名，但同一个作者不能
  const seenIds = new Set()
  for (const p of personas) {
    if (seenIds.has(p.id)) errors.push(`重复的 id: ${p.id}`)
    seenIds.add(p.id)
  }

  if (errors.length > 0) {
    console.error('构建失败：\n' + errors.map((e) => `  ✗ ${e}`).join('\n'))
    if (warnings.length > 0) {
      console.warn('\n提醒：\n' + warnings.map((w) => `  ! ${w}`).join('\n'))
    }
    process.exit(1)
  }

  // 生成时间必须**可复现**：用内容推导而不是取当前时钟，否则每次构建都产生 diff，
  // `--check` 会永远报「生成物不一致」，CI 也就失去意义了。
  // 取所有条目里最新的 updated（没有就用固定值），再加一个摘要哈希。
  const latestUpdated = personas
    .map((p) => p.updated || '')
    .sort()
    .pop() || '1970-01-01'
  const contentDigest = crypto
    .createHash('sha256')
    .update(personas.map((p) => `${p.id}:${p.sha256}`).sort().join('\n'))
    .digest('hex')
    .slice(0, 16)

  const manifest = {
    schemaVersion: 1,
    updatedAt: latestUpdated,
    digest: contentDigest,
    repo: REPO,
    count: personas.length,
    personas: personas
      .slice()
      .sort((a, b) => (b.updated || '').localeCompare(a.updated || '') || a.name.localeCompare(b.name, 'zh'))
      .map(({ body, ...rest }) => rest),
  }

  // 网页需要正文才能展开，单独出一份
  const full = {
    ...manifest,
    personas: manifest.personas.map((meta) => {
      const source = personas.find((p) => p.id === meta.id)
      return { ...meta, body: source.body }
    }),
  }

  let dirty = false
  dirty = writeIfChanged(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', checkMode) || dirty
  dirty = writeIfChanged(path.join(SITE_DIR, 'personas.json'), JSON.stringify(full, null, 2) + '\n', checkMode) || dirty

  // README 的目录段：只替换标记之间的内容
  if (fs.existsSync(README)) {
    const readme = fs.readFileSync(README, 'utf8')
    const table = renderReadmeTable(personas)
    const start = readme.indexOf(README_BEGIN)
    const end = readme.indexOf(README_END)
    if (start >= 0 && end > start) {
      const head = readme.slice(0, readme.lastIndexOf('\n', start) + 1)
      const tail = readme.slice(end + README_END.length)
      const next = `${head}${README_BEGIN} · 由 scripts/build.mjs 生成，请勿手改 -->\n\n${table}\n\n${README_END}${tail}`
      dirty = writeIfChanged(README, next, checkMode) || dirty
    } else {
      errors.push('README.md 缺少 <!-- BEGIN:personas ... --> / <!-- END:personas --> 标记')
      console.error(errors.join('\n'))
      process.exit(1)
    }
  } else {
    errors.push('缺少 README.md')
    console.error(errors.join('\n'))
    process.exit(1)
  }

  if (warnings.length > 0) {
    console.warn('提醒：\n' + warnings.map((w) => `  ! ${w}`).join('\n'))
  }

  const summary = `收录 ${personas.length} 条人设`
  if (checkMode) {
    if (dirty) {
      console.error(`✗ ${summary}，但生成物与提交内容不一致。请本地跑 \`node scripts/build.mjs\` 后重新提交。`)
      process.exit(1)
    }
    console.log(`✓ ${summary}，生成物已是最新`)
    return
  }

  console.log(`✓ ${summary}${dirty ? '，已更新生成物' : '，生成物无变化'}`)
  for (const p of personas) {
    console.log(`  · ${p.id}  「${p.name}」 ${p.chars} 字`)
  }
}

main()
