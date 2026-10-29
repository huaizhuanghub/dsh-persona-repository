#!/usr/bin/env node
/**
 * 反例测试：故意造几条坏稿件，确认校验器真的会拦。
 * 一条好稿件混在里面，确认它不会被误伤。
 *
 * 用法：node scripts/test-guards.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 每条反例：期望 build.mjs --check 或 validate.mjs 非零退出。 */
const CASES = [
  {
    name: '缺必填字段',
    expectBlock: true,
    file: 'personas/testuser/broken.md',
    content: `---
name: 缺字段的稿子
author: testuser
---

正文。
`,
  },
  {
    name: 'author 与目录不一致',
    expectBlock: true,
    file: 'personas/testuser/mismatch.md',
    content: `---
name: 冒名
author: someoneelse
summary: 想冒用别人的目录
tags: [测试]
version: 1.0.0
license: MIT
---

正文。
`,
  },
  {
    name: '正文里夹密钥',
    expectBlock: true, // 凭据一律直接拦
    file: 'personas/testuser/secret.md',
    content: `---
name: 夹带密钥
author: testuser
summary: 正文里塞了 key
tags: [测试]
version: 1.0.0
license: MIT
---

我的 key 是 sk-abcdefghijklmnopqrstuvwxyz123456
`,
  },
  {
    name: '文件名含大写与下划线',
    expectBlock: true,
    file: 'personas/testuser/Bad_Name.md',
    content: `---
name: 命名不规范
author: testuser
summary: 文件名不合法
tags: [测试]
version: 1.0.0
license: MIT
---

正文。
`,
  },
  {
    name: '正文为空',
    expectBlock: true,
    file: 'personas/testuser/empty.md',
    content: `---
name: 空稿
author: testuser
summary: 没有正文
tags: [测试]
version: 1.0.0
license: MIT
---
`,
  },
  {
    name: '合法稿件（不该被拦）',
    expectBlock: false,
    file: 'personas/testuser/good.md',
    content: `---
name: 一份规矩的稿子
author: testuser
summary: 用来确认校验器不会误伤正常人设。
tags: [测试, 中文]
version: 1.0.0
license: MIT
updated: 2026-10-30
---

# 人设：测试角色

从现在起你是「测试角色」。

## 底线

- 答案必须准确。
`,
  },
]

function run(command, args, cwd) {
  try {
    // 用 inherit 而不是 pipe：部分受限环境禁止子进程通过管道回传 stdio。
    const out = execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    return { code: 0, out: out || '' }
  } catch (error) {
    return { code: error.status ?? 1, out: (error.stdout || '') + (error.stderr || '') }
  }
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'plaza-guards-'))
let failed = 0

// 只拷源码与脚本，不拷生成物和 .git：生成物由被测脚本自己重建，
// 带着旧的 manifest 进去会让合法稿件因为「生成物不一致」被误判。
const SKIP = /[\\/](\.git|node_modules|_site|data|site)[\\/]?$/

for (const item of CASES) {
  const dir = path.join(work, 'repo-' + Math.random().toString(36).slice(2, 8))
  fs.mkdirSync(dir, { recursive: true })
  fs.cpSync(ROOT, dir, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(ROOT, src).replaceAll('\\', '/')
      if (rel === '') return true
      if (rel.startsWith('.git/') || rel === '.git') return false
      if (rel.startsWith('node_modules')) return false
      if (rel.startsWith('_site')) return false
      if (rel === 'data' || rel === 'site') return false
      return true
    },
  })

  const target = path.join(dir, item.file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, item.content)

  // build.mjs 会自己重建 data/ 与 site/personas.json
  const result = run(process.execPath, ['scripts/build.mjs'], dir)
  const blocked = result.code !== 0
  const ok = blocked === item.expectBlock

  console.log(`${ok ? '✓' : '✗'} ${item.name} — ${blocked ? '已拦截' : '放行'}${ok ? '' : '（预期相反）'}`)
  if (!ok) {
    failed++
    console.log('  输出：' + result.out.split('\n').slice(0, 6).join(' | '))
  }
}

fs.rmSync(work, { recursive: true, force: true })

if (failed > 0) {
  console.error(`\n${failed} 个用例不符合预期`)
  process.exit(1)
}
console.log(`\n全部 ${CASES.length} 个用例符合预期`)
