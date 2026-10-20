import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPackagedSeed, preferSnapshot } from '../lib/dictionary/packaged-seed.ts';
import { createSourceEntry, digest } from '../scripts/dictionary/core.ts';
import type { Snapshot } from '../lib/dictionary/remote-schema.ts';

const entry = createSourceEntry({ term: '风险溢价', definition: '承担额外风险时，投资者希望得到的、超过无风险收益的补偿。', aka: [], revision: 'a'.repeat(40),
  source: { id: 'seed-fixture', repository: 'example/glossary', path: 'terms.json', adapter: 'json', domain: 'finance', limit: 25,
    license: { spdx: 'MIT', textPath: 'LICENSE', sha256: digest('fixture'), attribution: 'Example authors', scopeEvidence: 'Original glossary content licensed under MIT.' } },
}, '2026-10-20T00:00:00.000Z');

test('packaged snapshot loads relative to the extension dictionary and validates every entry', async () => {
  const snapshot: Snapshot = { version: 2, entries: [entry] };
  const urls: string[] = [];
  const fetcher = (async (url: string) => { urls.push(url); return Response.json(snapshot); }) as typeof fetch;
  assert.deepEqual(await loadPackagedSeed('chrome-extension://test/dict.json', fetcher), snapshot);
  assert.deepEqual(urls, ['chrome-extension://test/dictionary-seed.json']);
  assert.equal(await loadPackagedSeed('chrome-extension://test/dict.json', (async () => Response.json({ ...snapshot, entries: [{ ...entry, plain: '篡改的内容' }] })) as typeof fetch), null);
  assert.equal(await loadPackagedSeed('chrome-extension://test/dict.json', (async () => new Response('', { status: 404 })) as typeof fetch), null);
});

test('newer online snapshot fully replaces the seed so removed terms are not resurrected', () => {
  const seed: Snapshot = { version: 2, entries: [entry] };
  assert.equal(preferSnapshot(seed, null), seed);
  assert.equal(preferSnapshot(seed, { version: 1, entries: [] }), seed);
  const newer: Snapshot = { version: 3, entries: [] };
  assert.equal(preferSnapshot(seed, newer), newer);
  assert.equal(preferSnapshot(null, newer), newer);
  assert.equal(preferSnapshot(null, null), null);
});
