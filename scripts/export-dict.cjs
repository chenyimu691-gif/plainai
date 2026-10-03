/**
 * 把 TS 词库导出为 public/dict.json（供内容脚本按需加载）。
 *
 * 用法（见 package.json 的 dict 脚本）：
 *   esbuild lib/dictionary/lookup.ts --bundle --format=cjs --outfile=.tmp-dict.cjs
 *   node scripts/export-dict.cjs
 */
const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, '..', '.tmp-dict.cjs');
if (!fs.existsSync(bundlePath)) {
  console.error('找不到 .tmp-dict.cjs，请先运行 esbuild 打包词库');
  process.exit(1);
}

const { fullDictionary } = require(bundlePath);
const outPath = path.join(__dirname, '..', 'public', 'dict.json');

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(fullDictionary), 'utf-8');

const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(0);
const byCategory = {};
for (const e of fullDictionary) {
  const k = e.category || 'general';
  byCategory[k] = (byCategory[k] || 0) + 1;
}

console.log(`词库已导出: ${fullDictionary.length} 条 -> public/dict.json (${sizeKB} KB)`);
console.log('分类分布:', JSON.stringify(byCategory));
