# GitHub Copilot 指令

本项目是 **降维翻译器 PlainAI** —— 一个 Chrome 扩展（WXT + TypeScript），
在网页上自动标注具身智能/机器人领域的行业术语并显示大白话解释。

**完整项目说明请看根目录的 [`AGENTS.md`](../AGENTS.md)**，其中包含：

- 目录结构与各文件职责
- 词库构建链路（`build_dict.py` → `npm run dict` → `npm run build`）
- 三层识别机制（词库匹配 / 疑似术语 / AI 兜底）
- tooltip 交互约定（300ms 延迟隐藏、跟随鼠标）

## 生成代码时请遵守

1. **许可边界**：`lib/dictionary/terms-embodiedterms.ts` 与 `public/dict.json`
   的数据来自 embodiedterms.com，许可为 **CC BY-NC 4.0（禁止商用、必须署名）**，
   不要移除其中的来源注释。
2. **词库不要 import 进内容脚本**：词库走 `public/dict.json` 运行时 fetch 加载，
   否则 bundle 会从 12 KB 涨到 780 KB。
3. **`getURL()` 参数带前导斜杠**：写作 `getURL('/dict.json')`。
4. **内容脚本用原生 DOM**，不要引入 React（仅设置页用 React）。
5. **改动后运行**：`npm run compile`（类型检查）和 `node scripts/verify.cjs`（11 项验证）。
