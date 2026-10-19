import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256 } from '../lib/dictionary/remote-schema.ts';
import { createRemoteSync, REMOTE_CACHE_KEY, REMOTE_STATUS_KEY, REMOTE_BASE_URL } from '../lib/dictionary/remote-sync.ts';

const item = (id = 'a'.repeat(64)) => ({
  id, term: 'Cache', category: 'technical', plain: '把经常用到的数据放在近处，下次读取更快。',
  source: { id: 'example', url: `https://raw.githubusercontent.com/a/b/${'b'.repeat(40)}/data`, revision: 'b'.repeat(40),
    license: 'MIT', licenseUrl: `https://github.com/a/b/blob/${'b'.repeat(40)}/LICENSE`, licenseSha256: 'c'.repeat(64),
    attribution: 'Example authors', definition: 'Frequently used data.' },
  quality: { generator: 'a', reviewer: 'b', promptVersion: '1', reviewedAt: '2026-10-19T00:00:00.000Z', reason: '解释准确且通俗，没有增加原文没有的结论。',
    checks: { faithful: true, plainLanguage: true, domainCorrect: true, safe: true } },
});
async function harness(initial: Record<string, unknown> = {}) {
  const storage = structuredClone(initial);
  const routes = new Map<string, string | (() => Response)>();
  const calls: string[] = [];
  const writes: string[] = [];
  const core = createRemoteSync({
    read: async (key) => storage[key], write: async (key, value) => { storage[key] = structuredClone(value); writes.push(key); },
    fetch: async (input) => { const url = String(input); calls.push(url); const result = routes.get(url);
      if (!result) throw new Error('offline'); return typeof result === 'function' ? result() : new Response(result); },
    now: () => new Date('2026-10-19T00:00:00.000Z'),
  });
  async function serve(version: number, entries = [item()], deltas: unknown[] = []) {
    const snapshot = { version, entries };
    const text = canonicalJson(snapshot);
    const digest = await sha256(text);
    const manifest = { schemaVersion: 1, version, createdAt: '2026-10-19T00:00:00.000Z', count: entries.length, domains: ['technical'],
      snapshot: { path: `snapshots/snapshot-${digest}.json`, sha256: digest, bytes: new TextEncoder().encode(text).length }, deltas };
    routes.set(`${REMOTE_BASE_URL}manifest.json`, canonicalJson(manifest));
    routes.set(`${REMOTE_BASE_URL}${manifest.snapshot.path}`, text);
    return { snapshot, manifest, text };
  }
  return { core, storage, routes, calls, writes, serve };
}

test('first sync atomically saves validated snapshot and subsequent offline sync preserves it', async () => {
  const h = await harness();
  await h.serve(1);
  await h.core.sync();
  assert.equal((h.storage[REMOTE_CACHE_KEY] as any).snapshot.version, 1);
  assert.deepEqual(h.writes.filter(key => key === REMOTE_CACHE_KEY), [REMOTE_CACHE_KEY]);
  h.routes.clear();
  await h.core.sync();
  assert.equal((h.storage[REMOTE_CACHE_KEY] as any).snapshot.version, 1);
  assert.match((h.storage[REMOTE_STATUS_KEY] as any).error, /offline/);
});

test('rollback and same-version mutation are rejected without replacing cache', async () => {
  const h = await harness(); await h.serve(2); await h.core.sync();
  await h.serve(1); await h.core.sync();
  assert.match((h.storage[REMOTE_STATUS_KEY] as any).error, /rollback/i);
  await h.serve(2, [item('d'.repeat(64))]); await h.core.sync();
  assert.match((h.storage[REMOTE_STATUS_KEY] as any).error, /same.version/i);
  assert.equal((h.storage[REMOTE_CACHE_KEY] as any).snapshot.entries[0].id, 'a'.repeat(64));
});

test('delta upserts and tombstones reconstruct exactly the approved target snapshot', async () => {
  const h = await harness(); await h.serve(1); await h.core.sync();
  const delta = { from: 1, version: 2, upserts: [item('d'.repeat(64))], removed: ['a'.repeat(64)] };
  const text = canonicalJson(delta);
  const artifact = { from: 1, version: 2, path: 'deltas/delta.json', sha256: await sha256(text), bytes: new TextEncoder().encode(text).length };
  h.routes.set(`${REMOTE_BASE_URL}deltas/delta.json`, text);
  const target = await h.serve(2, [item('d'.repeat(64))], [artifact]);
  await h.core.sync();
  assert.equal((h.storage[REMOTE_CACHE_KEY] as any).sha256, target.manifest.snapshot.sha256);
  assert.equal((h.storage[REMOTE_CACHE_KEY] as any).snapshot.entries[0].id, 'd'.repeat(64));
  assert.equal(h.calls.filter(url => url.endsWith(target.manifest.snapshot.path)).length, 0);
});

test('invalid delta falls back to full snapshot but invalid full hash keeps prior version', async () => {
  const h = await harness(); await h.serve(1); await h.core.sync();
  const target = await h.serve(2, [item('d'.repeat(64))], [{ from: 1, version: 2, path: 'deltas/missing.json', sha256: 'a'.repeat(64), bytes: 20 }]);
  await h.core.sync(); assert.equal((h.storage[REMOTE_CACHE_KEY] as any).snapshot.version, 2);
  const bad = await h.serve(3); h.routes.set(`${REMOTE_BASE_URL}${bad.manifest.snapshot.path}`, '{}');
  await h.core.sync(); assert.equal((h.storage[REMOTE_CACHE_KEY] as any).snapshot.version, 2);
  assert.ok((h.storage[REMOTE_STATUS_KEY] as any).error);
  assert.ok(target);
});

test('simultaneous sync calls share the same network operation', async () => {
  const h = await harness(); await h.serve(1);
  await Promise.all([h.core.sync(), h.core.sync(), h.core.sync()]);
  assert.equal(h.calls.filter(url => url.endsWith('/manifest.json')).length, 1);
});

test('corrupt local cache is excluded and oversized responses never commit', async () => {
  const h = await harness({ [REMOTE_CACHE_KEY]: { snapshot: { version: 1, entries: [item()] }, sha256: 'f'.repeat(64) } });
  assert.equal(await h.core.readCache(), null);
  h.routes.set(`${REMOTE_BASE_URL}manifest.json`, () => new Response(' '.repeat(256 * 1024)));
  await h.core.sync();
  assert.ok((h.storage[REMOTE_STATUS_KEY] as any).error);
  assert.equal((h.storage[REMOTE_CACHE_KEY] as any).sha256, 'f'.repeat(64));
});

test('streaming responses are bounded even without a content-length header', async () => {
  const h = await harness();
  await h.serve(1);
  h.routes.set(`${REMOTE_BASE_URL}manifest.json`, () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(70 * 1024)); controller.close(); },
  })));
  await h.core.sync();
  assert.match((h.storage[REMOTE_STATUS_KEY] as any).error, /too large/);
  assert.equal(h.storage[REMOTE_CACHE_KEY], undefined);
});

test('storage quota failure leaves the prior complete snapshot untouched', async () => {
  const h = await harness(); await h.serve(1); await h.core.sync();
  const previous = structuredClone(h.storage[REMOTE_CACHE_KEY]);
  await h.serve(2, [item('d'.repeat(64))]);
  const core = createRemoteSync({
    read: async key => h.storage[key],
    write: async (key, value) => { if (key === REMOTE_CACHE_KEY) throw new Error('quota'); h.storage[key] = value; },
    fetch: async input => new Response(h.routes.get(String(input)) as string),
  });
  await core.sync();
  assert.deepEqual(h.storage[REMOTE_CACHE_KEY], previous);
  assert.match((h.storage[REMOTE_STATUS_KEY] as any).error, /quota/);
});

test('a hash-valid delta with wrong reconstructed content recovers through full snapshot', async () => {
  const h = await harness(); await h.serve(1); await h.core.sync();
  const badDelta = canonicalJson({ from: 1, version: 2, upserts: [], removed: [] });
  const reference = { from: 1, version: 2, path: 'deltas/bad.json', sha256: await sha256(badDelta), bytes: new TextEncoder().encode(badDelta).length };
  const target = await h.serve(2, [item('d'.repeat(64))], [reference]);
  h.routes.set(`${REMOTE_BASE_URL}deltas/bad.json`, badDelta);
  await h.core.sync();
  assert.equal((h.storage[REMOTE_CACHE_KEY] as any).snapshot.entries[0].id, 'd'.repeat(64));
  assert.ok(h.calls.includes(`${REMOTE_BASE_URL}${target.manifest.snapshot.path}`));
});

test('delta reconstruction must also match the declared target snapshot byte count', async () => {
  const h = await harness(); await h.serve(1); await h.core.sync();
  const delta = canonicalJson({ from: 1, version: 2, upserts: [item('d'.repeat(64))], removed: ['a'.repeat(64)] });
  const reference = { from: 1, version: 2, path: 'deltas/bytes.json', sha256: await sha256(delta), bytes: new TextEncoder().encode(delta).length };
  const target = await h.serve(2, [item('d'.repeat(64))], [reference]);
  target.manifest.snapshot.bytes++;
  h.routes.set(`${REMOTE_BASE_URL}manifest.json`, canonicalJson(target.manifest));
  h.routes.set(`${REMOTE_BASE_URL}deltas/bytes.json`, delta);
  await h.core.sync();
  assert.equal((h.storage[REMOTE_CACHE_KEY] as any).snapshot.version, 1);
  assert.ok((h.storage[REMOTE_STATUS_KEY] as any).error);
});
