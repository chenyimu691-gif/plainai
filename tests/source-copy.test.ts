import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceEntry, digest } from '../scripts/dictionary/core.ts';
import type { Candidate, Source } from '../scripts/dictionary/core.ts';
import { planSourceUpdate } from '../scripts/dictionary/update.ts';
import { validateRemoteEntry } from '../lib/dictionary/remote-schema.ts';

const source: Source = { id: 'chinese-source', repository: 'example/glossary', path: 'terms.json', adapter: 'json', domain: 'technical', limit: 25,
  license: { spdx: 'MIT', textPath: 'LICENSE', sha256: digest('fixture notice'), attribution: 'Fixture authors', scopeEvidence: 'Fixture definitions are explicitly licensed with MIT.' } };
const now = '2026-10-20T02:00:00.000Z';
const candidate = (term = '缓存'): Candidate => ({ source, revision: 'a'.repeat(40), term, aka: ['Cache'],
  definition: '把经常用到的数据暂存在容易获取的地方，以便下次更快读取。' });

test('no-model admission keeps approved Chinese definitions verbatim and never claims semantic or human review', () => {
  const value = createSourceEntry(candidate(), now);
  assert.equal(value.plain, value.source.definition);
  assert.deepEqual(value.quality, { method: 'source-copy', checkedAt: now, checks: { chinese: true, verbatim: true, safe: true } });
  assert.doesNotThrow(() => validateRemoteEntry(value));
  assert.throws(() => validateRemoteEntry({ ...value, plain: `${value.plain}改变原义。` }), /verbatim|source/i);
  assert.throws(() => validateRemoteEntry({ ...value, analogy: '未经来源支持的类比' }), /verbatim|source/i);
});

test('no-model updates quarantine English, mixed English with a token Chinese word, advice and unlicensed entries', () => {
  const invalid = [
    { ...candidate(), definition: 'A temporary location used to retain frequently accessed application data.' },
    { ...candidate(), definition: 'Cache means a temporary location used to retain frequently accessed application data. 缓存' },
    { ...candidate(), definition: '建议你每日服用二十毫克药物，这样就能保证治愈疾病。' },
    { ...candidate(), source: { ...source, license: { ...source.license, spdx: 'UNKNOWN' } } },
  ];
  for (const value of invalid) assert.throws(() => createSourceEntry(value as Candidate, now));
  const result = planSourceUpdate({ candidates: invalid.slice(0, 3) as Candidate[], builtin: [], previous: [], now });
  assert.equal(result.entries.length, 0);
  assert.ok(result.quarantine.length > 0);
});

test('source-copy sync dedupes against builtin aliases and reuses unchanged records without version churn', () => {
  const previous = createSourceEntry(candidate(), now);
  const result = planSourceUpdate({ candidates: [{ ...candidate(), revision: 'b'.repeat(40) }], builtin: [], previous: [previous], now: '2026-10-27T02:00:00.000Z' });
  assert.deepEqual(result.entries, [previous]);
  assert.equal(planSourceUpdate({ candidates: [candidate()], builtin: [{ term: '本地缓存', aka: ['Cache'] }], previous: [], now }).entries.length, 0);
  assert.equal(planSourceUpdate({ candidates: [], builtin: [], previous: [previous], now }).entries.length, 0);
});
