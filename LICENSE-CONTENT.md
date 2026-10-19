# 内容与数据许可声明

本项目是**代码 MIT + 词库数据 CC BY-NC 4.0** 的混合许可项目。

## 一、源代码（MIT）

适用文件：

- `entrypoints/**`（内容脚本、后台、设置页）
- `lib/dictionary/terms.ts`、`terms-tech-extra.ts`、`terms-jargon-extra.ts`（自建词条）
- `lib/utils/**`
- `scripts/**`
- 配置文件（`package.json`、`wxt.config.ts`、`tsconfig.json` 等）

**许可**：[MIT](LICENSE) —— 可自由使用、修改、分发，包括商业用途。

## 二、术语词库数据（CC BY-NC 4.0）

适用文件：

- `lib/dictionary/terms-embodiedterms.ts`
- `public/dict.json`（含上述数据的构建产物）

**来源**：[embodiedterms.com](https://embodiedterms.com) —
《具身智能新手名词表》（可lip说AI 整理，2926 条术语）

**许可**：[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.zh-hans)
（署名 — 非商业性使用）

**你可以**：

- ✅ 自由复制、分发、改编这些数据
- ✅ 用于个人学习、研究、非商业项目

**你必须**：

- ✅ **署名**：注明数据来自 embodiedterms.com

**你不得**：

- ❌ **用于商业用途**（包括但不限于：商业产品、付费服务、带广告的商业网站）

**署名格式**（已在扩展的提示框与 README 中保留）：

> 术语数据来自 [embodiedterms.com](https://embodiedterms.com)（CC BY-NC 4.0）

## 三、商业使用

如果你需要将本项目用于**商业用途**：

1. 源代码（MIT）部分可直接商用
2. **必须移除** `lib/dictionary/terms-embodiedterms.ts`（CC BY-NC 部分）
3. 运行 `npm run dict` 重新生成 `public/dict.json`（此时只含自建词条）
4. 或自行准备合规的术语数据源替换

移除后，扩展仍可正常工作（自建词条 + 疑似术语识别 + AI 兜底三层机制不受影响）。

## 四、数据获取

`lib/dictionary/terms-embodiedterms.ts` 由脚本生成，原始数据不随仓库分发：

```bash
python -X utf8 scripts/build_dict.py   # 需要根目录有 embodiedterms_zh.json
```

数据文件可从 [embodiedterms.com](https://embodiedterms.com) 获取
（浏览器开发者工具可见其 `/data/zh.<hash>.json` 引用）。

## 五、独立发布的远程增量词库

新增的 `data/dictionary/entries.json` 与 `public/dictionary/` 是独立的数据层，按词条记录其原始来源、固定提交链接、上游许可证、署名、原始定义及 PlainAI 的翻译/简化记录。**这些数据不会因为被 AI 改写而自动变成 MIT，也不会改变上述 embodiedterms 数据的 CC BY-NC 4.0 许可。**

自动准入范围仅包括经过内容范围审阅的 MIT、Apache-2.0、CC0-1.0、CC-BY-4.0 来源。完整上游许可通知保存在 `data/dictionary/licenses/`，并随远程发布内容提供；来源范围证据见 `data/dictionary/source-review.md`。再分发者需保留适用的许可全文、署名与改写标记；CC BY 4.0 内容按其条件署名，并明确说明翻译和简化。各来源的许可条件继续分别适用，不将整个混合词库笼统重标为单一许可。

发现报告只列出待核实的仓库候选，不代表已获准复制内容。未知或不在自动准入范围内的许可不自动采集；许可证变化需人工审阅 PR 更新证据和锁定值。详见 [每周词库更新说明](docs/dictionary-updates.md)。
