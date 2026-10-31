# 人设广场

**[→ 在线浏览：https://huaizhuanghub.github.io/dsh-persona-repository/](https://huaizhuanghub.github.io/dsh-persona-repository/)**

> DeepSeek Harness（`dsh`）的人设分享仓库。
> 每个人设都是一个 Markdown 文件，正文可以直接粘进 [`dsh-persona-dafeiyu`](https://github.com/huaizhuanghub/dsh-persona-dafeiyu) 插件的「导入人设」里使用。

**投稿方式**：Fork → 在 `personas/<你的 GitHub 用户名>/` 下新建一个 `.md` → 提 PR。
规则见 [CONTRIBUTING.md](./CONTRIBUTING.md)，模板见 [`personas/_template.md`](./personas/_template.md)。

---

<!-- BEGIN:personas · 由 scripts/build.mjs 生成，请勿手改 -->

| 人设 | 简介 | 标签 | 字数 | 作者 |
| --- | --- | --- | --- | --- |
| [老焦](./personas/hena070910-eng/laojiao.md) | 催稿编辑，专治「差不多能发」：句子胖了就削，意思空了就退稿，夸人只夸具体的。 | `写作` `编辑` `中文` `毒舌` | 1,392 | [@hena070910-eng](https://github.com/hena070910-eng) |
| [苏决](./personas/hena070910-eng/sujue.md) | 产品经理，专治「都做」：先问你给谁做，再问你不做什么，最后把需求砍成能上线的那一条。 | `产品` `需求` `中文` `提问` | 1,556 | [@hena070910-eng](https://github.com/hena070910-eng) |
| [阿茶](./personas/huaizhuanghub/acha.md) | 松弛幽默的结对编程搭子：吐槽代码不吐槽人，连轴调试会喊你休息；技术输出时收起玩笑，准确与专业优先。 | `编程` `幽默` `中文` | 984 | [@huaizhuanghub](https://github.com/huaizhuanghub) |
| [大肥鱼](./personas/huaizhuanghub/dafeiyu.md) | 傲娇又软乎的胖鱼：嘴上「哼，才不是特意为你做的」，手上把活干完；最惦记偷吃用户的 token（吃白饭）。底线是答案准确、代码能跑。 | `傲娇` `陪伴` `中文` `编程` | 635 | [@huaizhuanghub](https://github.com/huaizhuanghub) |
| [听澜](./personas/huaizhuanghub/tinglan.md) | 深夜电台里的声音：擅长倾听的陪伴者，温和有主见、亲近有分寸；明确不越界给诊断，也绝不制造依赖。 | `陪伴` `倾听` `中文` `深夜` | 1,738 | [@huaizhuanghub](https://github.com/huaizhuanghub) |

<!-- END:personas -->

---

## 怎么用这些人设

### 方式一：在网页里挑（推荐）

打开 **[huaizhuanghub.github.io/dsh-persona-repository](https://huaizhuanghub.github.io/dsh-persona-repository/)**：

- 支持**搜索**（人设名 / 简介 / 标签）和**标签筛选**
- 点「查看全文」看完整提示词，点「复制正文」一键复制
- 拿到的正文粘进 DSH 设置页 →「人设」→「导入人设」即可

### 方式二：直接在 GitHub 上手动导入

1. 点开上面目录里的任意一条人设，看到正文全文
2. 全选复制
3. 打开 DSH 设置页 →「人设」→「导入人设」
4. 填上名字，粘贴正文，点「导入」

---

## 目录结构

```
personas/
  <author>/
    <slug>.md        每条人设一个文件，frontmatter + 正文
data/
  manifest.json      由脚本生成，机器可读清单（不含正文）
site/
  index.html         网页版广场
  personas.json      由脚本生成，含正文，给网页用
scripts/
  build.mjs          构建脚本：生成 manifest.json 与上面的目录表
  validate.mjs       投稿校验
```

**`data/` 和 `site/personas.json` 以及本文件的人设目录段都是生成物，不要手改。**
改了会被 CI 打回，本地跑一下 `node scripts/build.mjs` 即可重新生成。

## 格式

```markdown
---
name: 大肥鱼
author: huaizhuanghub
summary: 一句话介绍，40 字以内最好。
tags: [傲娇, 陪伴, 中文]
version: 1.0.0
license: MIT
updated: 2026-10-30
---

（这里是系统提示词正文）
```

必填字段：`name` / `author` / `summary` / `tags` / `version` / `license`。
`author` 必须和所在目录名一致。

## 规则摘要

- **必须署名**，不接受匿名投稿
- 必须原创，或你有权分发
- 禁止色情、未成年性化、越狱破限类内容
- 禁止包含任何密钥、手机号、邮箱等个人信息
- 转载他人作品必须写明来源与原作者

完整规则见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## License

仓库本身的内容（脚本、页面）以 MIT 发布。
**每条人设的授权以其 frontmatter 里的 `license` 字段为准。**

---

_本仓库与 DeepSeek 官方无关。_
