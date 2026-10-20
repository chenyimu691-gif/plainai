import test from 'node:test';
import assert from 'node:assert/strict';
import { planUpdate, parseQuarantine } from '../scripts/dictionary/update.ts';
import { createEntry, digest } from '../scripts/dictionary/core.ts';
import type { Candidate, Source } from '../scripts/dictionary/core.ts';

const source: Source = { id: 'fixture', repository: 'example/glossary', path: 'terms.json', adapter: 'json', domain: 'technical', limit: 1,
  license: { spdx: 'MIT', textPath: 'LICENSE', sha256: digest('test license'), attribution: 'Fixture author', scopeEvidence: 'Test-only synthetic glossary content licensed under MIT.' } };
const candidate = (term: string): Candidate => ({ source, revision: 'a'.repeat(40), term, definition: 'A sequence of instructions used to accomplish a particular task.', aka: [] });
const review = { faithful: true, plainLanguage: true, domainCorrect: true, safe: true, reason: '原文与译文都强调按步骤完成任务。' };
const rewrite = { plain: '按一定顺序执行的一组步骤，用来完成特定任务。' };
const run = { generator: 'fixture-generate', reviewer: 'fixture-review', now: '2026-10-19T02:00:00.000Z' };

test('unchanged source entries reuse reviewed records without another model call', async () => {
  const c = candidate('Alpha'); const previous = createEntry(c, rewrite, review, run);
  const result = await planUpdate({ candidates: [{ ...c, revision: 'b'.repeat(40) }], builtin: [], previous: [previous], run,
    simplify: async () => { throw new Error('must not call a model'); } });
  assert.deepEqual(result.entries, [previous]);
});

test('generation budget does not delete existing entries and removed sources yield tombstones', async () => {
  const a = candidate('Alpha'); const z = candidate('Zulu');
  const existing = createEntry(z, rewrite, review, run);
  const result = await planUpdate({ candidates: [a, z], builtin: [], previous: [existing], run,
    simplify: async () => ({ rewrite, review }) });
  assert.equal(result.entries.length, 2);
  const removed = await planUpdate({ candidates: [], builtin: [], previous: [existing], run, simplify: async () => ({ rewrite, review }) });
  assert.equal(removed.entries.length, 0);
});

test('quality rejection quarantines entry, but a provider failure aborts the entire run', async () => {
  const options = { candidates: [candidate('Alpha')], builtin: [], previous: [], run };
  const rejected = await planUpdate({ ...options, simplify: async () => ({ rewrite, review: { ...review, faithful: false } }) });
  assert.equal(rejected.entries.length, 0); assert.equal(rejected.quarantine.length, 1);
  await assert.rejects(planUpdate({ ...options, simplify: async () => { throw new Error('provider failed'); } }), /provider failed/);
});

test('built-in and cross-source aliases are deduplicated before any generation calls', async () => {
  let calls = 0;
  const result = await planUpdate({ candidates: [candidate('Alpha')], builtin: [{ term: 'Local', aka: ['ＡＬＰＨＡ'] }], previous: [], run,
    simplify: async () => { calls++; return { rewrite, review }; } });
  assert.equal(calls, 0); assert.equal(result.entries.length, 0);
});

test('previously deferred candidates get a turn before repeatedly rejected earlier terms', async () => {
  const calls: string[] = [];
  const options = { candidates: [candidate('Alpha'), candidate('Zulu')], builtin: [], previous: [], run,
    simplify: async (c: Candidate) => {
      calls.push(c.term);
      return { rewrite, review: { ...review, faithful: c.term !== 'Alpha' } };
    } };
  const first = await planUpdate(options);
  assert.deepEqual(calls, ['Alpha']);
  const second = await planUpdate({ ...options, run: { ...run, now: '2026-10-26T02:00:00.000Z' }, previousQuarantine: first.quarantine });
  assert.deepEqual(calls, ['Alpha', 'Zulu']);
  assert.equal(second.entries[0].term, 'Zulu');
});

test('deferral age persists so multiple rejected groups cannot starve the final candidate', async () => {
  const calls: string[] = [];
  let quarantine = parseQuarantine({ items: [] });
  for (let week = 0; week < 4; week++) {
    const result = await planUpdate({ candidates: ['Alpha', 'Bravo', 'Charlie', 'Zulu'].map(candidate),
      builtin: [], previous: [], previousQuarantine: quarantine,
      run: { ...run, now: new Date(Date.parse(run.now) + week * 7 * 86_400_000).toISOString() },
      simplify: async c => { calls.push(c.term); return { rewrite, review: { ...review, faithful: c.term === 'Zulu' } }; } });
    quarantine = result.quarantine;
    if (week === 3) assert.equal(result.entries[0].term, 'Zulu');
  }
  assert.deepEqual(calls, ['Alpha', 'Bravo', 'Charlie', 'Zulu']);
  assert.throws(() => parseQuarantine({ items: [{ sourceId: 'fixture', term: 'Alpha', reason: 'generation-budget-deferred', deferredSince: 'invalid' }] }), /Invalid quarantine/);
});
