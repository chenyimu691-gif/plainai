# AGENTS.md — 给 AI 助手的项目说明

> 本文件供 AI 编码助手（Claude Code / Cursor / Codex / Reasonix / Copilot 等）快速理解本项目。
> 人类读者请看 [README.md](README.md)。

## 项目是什么

**降维翻译器 PlainAI** —— 一个 Chrome 浏览器扩展（Manifest V3）。用户在网页上阅读时，扩展自动标注行业术语（具身智能 / 机器人 / AI 领域），鼠标悬停显示大白话解释；词库未收录的词调用大模型实时解释。

一句话：**把高密度行业黑话翻译成人话**。

## 技术栈

- 框架：[WXT](https://wxt.dev/)（浏览器扩展构建工具，Vite 驱动）
- 语言：TypeScript；React 仅用于设置页
- 内容脚本：原生 DOM 操作（**刻意不用框架**，保证体积与性能）
- 词库：JSON 按需加载（**不打包进 content script**）

## 目录结构

```
entrypoints/
  content.tsx        内容脚本：页面扫描 → 术语标注 → tooltip → AI 兜底
  background.ts      后台：设置页消息（词库统计）
  popup/             设置页（React）：AI 服务器地址、开关
lib/
  dictionary/
    lookup.ts        词库合并入口（fullDictionary，去重、自建优先）
    terms.ts         自建词条（可直接编辑）★
    terms-tech-extra.ts    自建技术词条 ★
    terms-jargon-extra.ts  自建职场黑话词条 ★
    terms-embodiedterms.ts 生成文件，勿手改（CC BY-NC 数据）
    types.ts         DictEntry 类型定义
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

### 4. 内容脚本的三层识别机制

`content.tsx` 的 `buildIndex()` 构建一个组合正则：

1. **词库精确匹配**：`termMap` 里所有 term + aka 别名
2. **疑似术语识别**：英文大写缩写（`[A-Z]{2,8}`、`RT-2`、`GR00T`）——即使词库没有也高亮
3. **常见词过滤**：`COMMON_WORDS` 集合（100+ 个，如 `CEO`/`USB`/`CPU`）不标注，避免噪音

匹配时用 `(?<!\w)` / `(?!\w)` 做边界：**只防英文粘连，允许中文接续**（"VLA架构" 要能匹配 "VLA"）。

### 5. Tooltip 交互

- 悬停显示，`mouseleave` 后 **300ms 延迟隐藏**（给用户移到 tooltip 上点击链接的时间）
- tooltip 自身 `mouseenter` 取消隐藏
- tooltip 跟随鼠标（X + Y 都要跟），并处理视口边缘溢出

改交互时注意保留这几点，否则社群链接点不到。

### 6. AI 兜底

- 配置从 `browser.storage.local` 读（`lib/utils/ai.ts`）
- 接口为 OpenAI 兼容格式：`POST {endpoint}`，body 含 `{model, messages, temperature, max_tokens}`
- 未配置或请求失败时**静默降级**（显示"未收录"），不能阻塞页面

## 常见任务

### 加词条

编辑 `lib/dictionary/terms.ts`（或 tech-extra / jargon-extra）：

```ts
{
  term: '术语名',
  category: 'embodied-ai',   // embodied-ai | robotics | aiml | general
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
