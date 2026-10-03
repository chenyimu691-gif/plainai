/**
 * 验证脚本：检查词库与构建产物是否正常。
 *
 * 用法：
 *   npm run build && node scripts/verify.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0;
let fail = 0;

function check(name, ok, detail) {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
  ok ? pass++ : fail++;
}

// ---------- 1. 词库文件 ----------
console.log('词库文件');
const dictPath = path.join(ROOT, 'public', 'dict.json');
if (!fs.existsSync(dictPath)) {
  console.error('找不到 public/dict.json，请先运行 npm run dict');
  process.exit(1);
}
const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
check('dict.json 可解析', true, `${dict.length} 条`);
check('字段完整性', dict.every((e) => e.term && e.plain && e.category));

// ---------- 2. 词库来源占比 ----------
console.log('\n词库来源');
const ownFiles = ['terms.ts', 'terms-tech-extra.ts', 'terms-jargon-extra.ts'];
const ownTerms = new Set();
for (const f of ownFiles) {
  const p = path.join(ROOT, 'lib', 'dictionary', f);
  if (!fs.existsSync(p)) continue;
  for (const m of fs.readFileSync(p, 'utf8').matchAll(/term:\s*'([^']+)'/g)) {
    ownTerms.add(m[1]);
  }
}
const ownCount = dict.filter((e) => ownTerms.has(e.term)).length;
const extCount = dict.length - ownCount;
check('自建词条', ownCount > 0, `${ownCount} 条（MIT）`);
check('embodiedterms 词条', extCount > 0, `${extCount} 条（CC BY-NC 4.0）`);

const byCategory = {};
for (const e of dict) byCategory[e.category] = (byCategory[e.category] || 0) + 1;
console.log('  分类分布:', JSON.stringify(byCategory));

// ---------- 3. 索引构建与匹配 ----------
console.log('\n索引与匹配');
let termMap = new Map();
let combinedRegex = null;
const acronymPattern =
  '(?<!\\w)([A-Z]{2,8}(?:-[A-Z0-9]+)*|[A-Z]{2,8}[0-9]+(?:-[A-Z0-9]+)*)(?!\\w)';

const t0 = Date.now();
for (const entry of dict) {
  if (!termMap.has(entry.term)) termMap.set(entry.term, entry);
  if (entry.aka) for (const a of entry.aka) if (!termMap.has(a)) termMap.set(a, entry);
}
const termPattern = [...termMap.keys()]
  .sort((a, b) => b.length - a.length)
  .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');
combinedRegex = new RegExp(`(?<!\\w)(${termPattern})|${acronymPattern}`, 'g');
const elapsed = Date.now() - t0;

check('索引构建', elapsed < 500, `${elapsed} ms，${termMap.size} 个索引项`);

const samples = ['VLA', 'Sim2Real', '具身智能', '强化学习'];
const allHit = samples.every((t) => {
  combinedRegex.lastIndex = 0;
  return combinedRegex.test(t);
});
check('样本术语可匹配', allHit, samples.join(' / '));

// 常见词不应命中即被过滤（这里只验证正则会匹配，过滤在 COMMON_WORDS 中完成）
combinedRegex.lastIndex = 0;
check('非术语不误判', !combinedRegex.test('actix'), 'actix');

// ---------- 4. 构建产物 ----------
console.log('\n构建产物');
const outDir = path.join(ROOT, '.output', 'chrome-mv3');
if (fs.existsSync(outDir)) {
  const contentJs = path.join(outDir, 'content-scripts', 'content.js');
  const bgJs = path.join(outDir, 'background.js');
  const outDict = path.join(outDir, 'dict.json');

  if (fs.existsSync(contentJs)) {
    const kb = fs.statSync(contentJs).size / 1024;
    check('content.js 体积可控', kb < 100, `${kb.toFixed(2)} KB`);
  } else {
    check('content.js 存在', false);
  }
  check('background.js 存在', fs.existsSync(bgJs));
  check('dict.json 已复制到产物', fs.existsSync(outDict));

  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
  const war = manifest.web_accessible_resources || [];
  check(
    'web_accessible_resources 已配置',
    war.some((r) => (r.resources || []).includes('dict.json'))
  );
} else {
  console.log('  （未构建，跳过。运行 npm run build 后重试）');
}

// ---------- 汇总 ----------
console.log(`\n通过 ${pass} / ${pass + fail}${fail ? `  ✗ ${fail} 项失败` : '  ✓ 全部通过'}`);
process.exit(fail ? 1 : 0);
