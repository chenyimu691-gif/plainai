# AGENTS.md — 给 AI 助手的项目说明

> 本文件供 AI 编码助手（Claude Code / Cursor / Codex / Reasonix / Copilot 等）快速理解本项目。
> 人类读者请看 [README.md](README.md)。

## 项目是什么

**降维翻译器 PlainAI** —— 一个 Chrome 浏览器扩展（Manifest V3）。用户在设置中多选行业词库，网页只标注已选分类的术语和别名，悬停显示大白话解释。自动标注不调用模型，也不标注未收录的英文缩写。

一句话：**把高密度行业黑话翻译成人话**。

## 技术栈

- 框架：[WXT](https://wxt.dev/)（浏览器扩展构建工具，Vite 驱动）
- 语言：TypeScript；React 仅用于设置页
- 内容脚本：原生 DOM 操作（**刻意不用框架**，保证体积与性能）
- 词库：JSON 按需加载（**不打包进 content script**）

## 目录结构

```
entrypoints/
  content.tsx        内容脚本：页面扫描、标注、解释、即时刷新已选词库
  background.ts      后台：合并与筛选词库、同步、统计
  popup/             设置页（React）：行业多选、更新状态、可选高级设置
lib/
  dictionary/
    lookup.ts        词库合并入口（fullDictionary，去重、自建优先）
    terms.ts         自建词条（可直接编辑）★
    terms-tech-extra.ts    自建技术词条 ★
    terms-jargon-extra.ts  自建职场黑话词条 ★
    terms-embodiedterms.ts 生成文件，勿手改（CC BY-NC 数据）
    types.ts         DictEntry 类型定义
    categories.ts    分类选项、默认四类、存储与筛选
  utils/ai.ts        AI 配置读写 + 调用（OpenAI 兼容接口）
scripts/
  build_dict.py      生成 terms-embodiedterms.ts（需根目录 embodiedterms_zh.json）
  export-dict.cjs    把 TS 词库导出为 public/dict.json
  verify.cjs         验证脚本（11 项检查）
public/
  dict.json          词库构建产物（扩展运行时 fetch 加载）
```

## 关键约定（改代码前必读）

### 1. 许可边界 —— 最重要

本项目是**双许可**，改代码时不能混淆：

| 内容 | 许可 | 约束 |
|:----|:----|:----|
| 源代码（entrypoints/、lib/utils/、scripts/） | MIT | 自由使用 |
| 自建词条（terms.ts / terms-tech-extra.ts / terms-jargon-extra.ts） | MIT | 自由使用 |
| **`terms-embodiedterms.ts` + `public/dict.json`** | **CC BY-NC 4.0** | **禁止商用；必须署名 embodiedterms.com** |

- **不要**删除或修改 `terms-embodiedterms.ts` 中的署名字段
- **不要**把 embodiedterms 数据用于商业场景的描述写进文档
- 新增数据源时必须确认其许可是否与 NC 兼容

### 2. 词库构建链路（改词库必跑）

```
terms*.ts（源）
   ↓ python -X utf8 scripts/build_dict.py     （仅当改了 embodiedterms 数据）
terms-embodiedterms.ts（生成）
   ↓ npm run dict                              （esbuild 打包 + 导出 JSON）
public/dict.json（产物）
   ↓ npm run build                             （WXT 构建，自动跑 dict）
.output/chrome-mv3/（可加载的扩展）
```

注意：`npm run build` 已包含 `npm run dict`，**不需要手动分步执行**。

### 3. 词库加载方式（性能约束）

词库有 3000+ 条（约 762 KB），**不能** import 进 content script，否则 bundle 会到 780 KB。

正确做法（现状）：
- 词库放 `public/dict.json`
- 内容脚本在运行时 `fetch(browser.runtime.getURL('/dict.json'))` 异步加载
- `wxt.config.ts` 里配置了 `web_accessible_resources`

**陷阱**：
- `getURL()` 的参数必须是 `/dict.json`（**带前导斜杠**），否则 TypeScript 报 `PublicPath` 类型错误
- 改 `wxt.config.ts` 的 `web_accessible_resources` 后，改动 `public/` 下的新文件需要重新 `npx wxt prepare` 生成类型

### 4. 内容脚本与行业选择

`content.tsx` 的 `buildIndex()` 构建一个组合正则：

1. 后台合并内置与已验证远程数据，再按 `plainai_dictionary_categories` 多选值筛选；内置词条与别名全局优先。
2. **词库精确匹配**：只索引所选分类的 term + aka；空数组代表不标注，缺省值保持原有四类。
3. **常见词过滤**：`COMMON_WORDS` 集合（100+ 个，如 `CEO`/`USB`/`CPU`）不标注，避免噪音。
4. 分类或远程缓存变化时移除自有标记并重建，不需要刷新网页；后台不可用时的内置数据回退也必须读取行业选择。不得恢复库外缩写的自动标记来绕过选择。

匹配时用 `(?<!\w)` / `(?!\w)` 做边界：**只防英文粘连，允许中文接续**（"VLA架构" 要能匹配 "VLA"）。

### 5. Tooltip 交互

- 悬停显示，`mouseleave` 后 **300ms 延迟隐藏**（给用户移到 tooltip 上点击链接的时间）
- tooltip 自身 `mouseenter` 取消隐藏
- tooltip 跟随鼠标（X + Y 都要跟），并处理视口边缘溢出

改交互时注意保留这几点，否则社群链接点不到。

### 6. 模型配置

- 配置从 `browser.storage.local` 读（`lib/utils/ai.ts`）
- 接口为 OpenAI 兼容格式：`POST {endpoint}`，body 含 `{model, messages, temperature, max_tokens}`
- 设置保留在可选的高级区域；不得让行业词库或默认更新依赖模型配置
- 自动标注只使用已选词库，不自动向模型发送术语

## 常见任务

### 加词条

编辑 `lib/dictionary/terms.ts`（或 tech-extra / jargon-extra）：

```ts
{
  term: '术语名',
  category: 'embodied-ai',   // 取值见 types.ts 与 categories.ts（原有四类 + 八个行业）
  plain: '一句话大白话（30 字左右）',
  example: '使用场景（可选）',
  analogy: '生活类比（可选）',
  aka: ['别名', 'English Name'],  // 可选
}
```

然后 `npm run build`。

### 改 tooltip 样式

`content.tsx` 顶部注入的 `<style>` 字符串（搜索 `.plainai-tooltip`）。

### 改 AI 兜底逻辑

`lib/utils/ai.ts` 的 `explainWithAI()`（prompt 与请求体）+ `content.tsx` 的 `showAITooltip()`。

### 改设置页

`entrypoints/popup/App.tsx`（React，样式为内联对象）。

### 验证改动

```bash
npm run compile          # TypeScript 类型检查（必须 0 错误）
npm run build            # 构建
node scripts/verify.cjs  # 11 项检查
```

## 已知约束与坑

1. **不要提交** `embodiedterms_zh.json`（5 MB 源数据，已在 .gitignore）
2. **不要提交** `node_modules/`、`.output/`、`.wxt/`
3. 路径中含中文（Windows 环境），Python 脚本必须用 `python -X utf8` 运行
4. `content.js` 体积应保持在 **100 KB 以下**（`verify.cjs` 会检查）；若暴涨说明误把词库 import 进来了
5. 扩展目前**未发布** Chrome Web Store，用户需自行构建加载

## 修改后请遵守

- 跑 `npm run compile` 确认无类型错误
- 跑 `node scripts/verify.cjs` 确认 11 项通过
- 涉及词库数据的改动，确认没有违反 CC BY-NC 的署名与商用限制

## 每周远程词库更新

- Node.js 24；在现有 WXT/TypeScript 中实现，不需要新增后端。
- `scripts/dictionary/` 默认采集已有中文原文并做程序检查，无需模型或逐条人工审核；英文与不合格解释隔离。显式 `DICTIONARY_MODE=ai` 才启用保留的双模型路径。`data/dictionary/` 保存来源、许可证据与已检查数据。
- 不得把程序检查描述成语义准确性保证，或伪造模型/人工审核记录；`quality.method=source-copy` 的 `plain` 必须与原始定义完全一致。
- 行业多选保存在本机并即时应用于内置、远程和回退路径；暂无词条的分类必须如实显示，不得宣传成已有覆盖。
- `lib/dictionary/remote-schema.ts` 和 `remote-sync.ts` 是构建脚本与扩展共享的协议/同步逻辑；内置词条及别名优先，远程失败保留可用缓存。
- 新来源和许可证哈希变动必须单独审阅；发现报告不代表来源已批准。原有 CC BY-NC 条件继续适用。
- 构建通过 `verifyRelease` 验证后，将当前已批准快照作为 `dictionary-seed.json` 随扩展打包（数据文件按需读取，不能 import 进脚本）。原有 `public/dict.json` 仍为 3,093 条；本次 v2 额外 1,169 条，随包总数 4,262 条。查词选择随包快照与有效在线缓存中较新的整份数据；较新快照删除的词条不能从旧 seed 补回。页面的后台不可用回退也要加载 seed 并遵守行业多选。
- 来源解析仅处理已批准的 JSON/JSONL、具名静态 TS/JS 数组及直接 push 对象、限定 HTML 正文和 Markdown 表格；下载的代码从不执行。敏感领域和跨分类子集使用来源 `where` 白名单，不能为凑数量降低检查。
- 改动更新功能还须运行 `npm test`、`npm run dictionary:verify` 和 `npm run dictionary:build`。`scripts/verify.cjs` 现有 15 项检查，包含完整许可声明、seed 与当前发布完全一致、页面回退权限以及在线发布历史不进入扩展包的验证。
- 配置、发布和自动合并边界见 [docs/dictionary-updates.md](docs/dictionary-updates.md)。
