import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { digest } from '../scripts/dictionary/core.ts';
import type { Source } from '../scripts/dictionary/core.ts';
import { collectSources, discoverSources, fetchText, readCatalog } from '../scripts/dictionary/network.ts';
import { DOMAINS } from '../lib/dictionary/remote-schema.ts';

const notice = 'A reviewed complete MIT license notice fixture.\n';
const revision = 'abcde12345abcde12345abcde12345abcde12345';
const fixture = (): Source => ({
  id: 'fixture', repository: 'approved/glossary', path: 'data/glossary.json',
  adapter: 'json', domain: 'technical', limit: 1,
  fields: { term: 'term', definition: 'definition', aka: 'aliases' },
  license: { spdx: 'MIT', textPath: 'data/dictionary/licenses/fixture.txt', sha256: digest(notice),
    attribution: 'The original glossary author; modified by PlainAI.',
    scopeEvidence: 'The upstream README explicitly licenses glossary definitions under MIT.' },
});
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

test('fetchText bounds a streamed body even without Content-Length and rejects unsafe URLs', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('1234')); controller.enqueue(new TextEncoder().encode('5678')); },
    cancel() { cancelled = true; },
  });
  const mock = (async () => new Response(stream)) as typeof fetch;
  await assert.rejects(fetchText('https://raw.githubusercontent.com/a/b/main/data', { fetch: mock, maxBytes: 6 }), /too large/i);
  assert.equal(cancelled, true);
  for (const url of ['http://github.com/a', 'https://user:password@github.com/a', 'https://github.com:444/a']) {
    await assert.rejects(fetchText(url, { fetch: mock }), /HTTPS|credentials|port/i);
  }
});

test('fetchText rejects oversized Content-Length and never follows redirects', async () => {
  let init: RequestInit | undefined;
  const mock = (async (_url, options) => { init = options; return new Response('hi', { headers: { 'Content-Length': '100' } }); }) as typeof fetch;
  await assert.rejects(fetchText('https://api.github.com/test', { fetch: mock, maxBytes: 5 }), /too large/i);
  assert.equal(init?.redirect, 'error');
  assert.ok(init?.signal instanceof AbortSignal);
  await assert.rejects(fetchText('https://api.github.com/test', { fetch: (async () => new Response(null, { status: 302 })) as typeof fetch }), /302/);
});

test('readCatalog validates local pinned license bytes and bounded source limits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plainai-catalog-'));
  try {
    await mkdir(join(root, 'data/dictionary/licenses'), { recursive: true });
    await writeFile(join(root, 'data/dictionary/licenses/fixture.txt'), notice);
    const s = fixture();
    await writeFile(join(root, 'data/dictionary/sources.json'), JSON.stringify({ version: 1, sources: [s] }));
    assert.equal((await readCatalog(root))[0].id, 'fixture');
    await writeFile(join(root, 'data/dictionary/licenses/fixture.txt'), `${notice}changed`);
    await assert.rejects(readCatalog(root), /license changed/i);
    await writeFile(join(root, 'data/dictionary/licenses/fixture.txt'), notice);
    await writeFile(join(root, 'data/dictionary/sources.json'), JSON.stringify([{ ...s, limit: 101 }]));
    await assert.rejects(readCatalog(root), /catalog entry/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('readCatalog refuses notices symlinked outside the checkout', async () => {
  const outer = await mkdtemp(join(tmpdir(), 'plainai-outside-'));
  const root = join(outer, 'checkout');
  try {
    await mkdir(join(root, 'data/dictionary/licenses'), { recursive: true });
    await writeFile(join(outer, 'outside-notice.txt'), notice);
    await symlink(join(outer, 'outside-notice.txt'), join(root, 'data/dictionary/licenses/fixture.txt'));
    await writeFile(join(root, 'data/dictionary/sources.json'), JSON.stringify([fixture()]));
    await assert.rejects(readCatalog(root), /inside the checkout/);
  } finally { await rm(outer, { recursive: true, force: true }); }
});

test('readCatalog verifies every approved historical license notice and immutable revision', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plainai-license-history-'));
  try {
    await mkdir(join(root, 'data/dictionary/licenses'), { recursive: true });
    await writeFile(join(root, 'data/dictionary/licenses/fixture.txt'), notice);
    const old = 'An earlier complete MIT license notice with its original copyright.\n';
    const historical = { ...fixture().license, textPath: 'data/dictionary/licenses/fixture-old.txt', sha256: digest(old), revisions: [revision] };
    const source = { ...fixture(), licenseHistory: [historical] };
    const catalog = join(root, 'data/dictionary/sources.json');
    await writeFile(catalog, JSON.stringify([source]));
    await assert.rejects(readCatalog(root), /ENOENT|notice/i, 'missing historical notice must fail even if not yet referenced');
    await writeFile(join(root, historical.textPath), old);
    assert.equal((await readCatalog(root))[0].id, 'fixture');
    await writeFile(join(root, historical.textPath), `${old}changed`);
    await assert.rejects(readCatalog(root), /license changed/i);
    await writeFile(join(root, historical.textPath), old);
    await writeFile(catalog, JSON.stringify([{ ...source, licenseHistory: [{ ...historical, revisions: ['main'] }] }]));
    await assert.rejects(readCatalog(root), /history|catalog|revision/i);
    await writeFile(catalog, JSON.stringify([{ ...source, licenseHistory: [{ ...historical, textPath: '../outside.txt' }] }]));
    await assert.rejects(readCatalog(root), /history|catalog|path/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('collector pins data and license to one resolved commit and keeps token off raw requests', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const mock = (async (input, init) => {
    const url = String(input); calls.push({ url, init });
    if (url.startsWith('https://api.github.com/')) return response([{ sha: revision }]);
    if (url.endsWith('/LICENSE')) return new Response(notice);
    return response([
      { term: 'API', definition: 'An interface for exchanging data between software applications.' },
      { term: 'Container', definition: 'A packaged environment for an application and its dependencies.' },
    ]);
  }) as typeof fetch;
  const rows = await collectSources([fixture()], { fetch: mock, token: 'private-fixture-token' });
  assert.equal(rows.length, 2, 'source.limit controls generation, not collection or deletion detection');
  assert.ok(rows.every(row => row.revision === revision));
  assert.equal(calls[0].url, 'https://api.github.com/repos/approved/glossary/commits?per_page=1');
  assert.equal(new Headers(calls[0].init?.headers).get('Authorization'), 'Bearer private-fixture-token');
  const raw = calls.filter(call => new URL(call.url).hostname === 'raw.githubusercontent.com');
  assert.equal(raw.length, 2);
  for (const call of raw) {
    assert.ok(call.url.startsWith(`https://raw.githubusercontent.com/approved/glossary/${revision}/`));
    assert.equal(new Headers(call.init?.headers).get('Authorization'), null);
  }
});

test('collector aborts on license changes, parser failures and network errors', async () => {
  const mock = (license: string, data: string) => (async (input) => {
    const url = String(input);
    if (url.includes('api.github.com')) return response([{ sha: revision }]);
    return new Response(url.endsWith('/LICENSE') ? license : data);
  }) as typeof fetch;
  await assert.rejects(collectSources([fixture()], { fetch: mock(`${notice}changed`, '[]') }), /license changed/i);
  await assert.rejects(collectSources([fixture()], { fetch: mock(notice, '[]') }), /no entries/i);
  await assert.rejects(collectSources([fixture()], { fetch: (async () => new Response(null, { status: 503 })) as typeof fetch }), /503/);
  await assert.rejects(collectSources([fixture()], { fetch: (async () => response([{ sha: 'main' }])) as typeof fetch }), /commit/i);
  const migrated = { ...fixture(), license: { ...fixture().license, sha256: digest('a newly approved notice') },
    licenseHistory: [{ ...fixture().license, revisions: [revision] }],
  };
  await assert.rejects(collectSources([migrated], { fetch: mock(notice, '[]') }), /license changed/i,
    'historical approval cannot authorize collection against a mismatched current license');
});

test('discovery queries all eight domains once, bounds results and treats license only as a hint', async () => {
  const calls: string[] = [];
  const mock = (async (input, init) => {
    const url = String(input); calls.push(url);
    assert.equal(new Headers(init?.headers).get('Authorization'), null);
    return response({ items: Array.from({ length: 7 }, (_, i) => ({
      full_name: `candidate/glossary-${i}`, html_url: 'https://evil.example/ignored',
      description: 'An untrusted glossary description.', license: { spdx_id: i ? 'MIT' : 'NOASSERTION' },
    })) });
  }) as typeof fetch;
  const found = await discoverSources({ fetch: mock });
  assert.equal(calls.length, 8);
  assert.equal(found.length, 40);
  assert.deepEqual([...new Set(found.map(row => row.domain))], [...DOMAINS]);
  for (const [i, call] of calls.entries()) {
    const url = new URL(call);
    assert.equal(url.hostname, 'api.github.com');
    assert.equal(url.searchParams.get('per_page'), '5');
    assert.ok(url.searchParams.get('q')?.includes(DOMAINS[i]));
  }
  assert.equal(found[0].licenseHint, 'NOASSERTION');
  assert.ok(found.every(row => row.url.startsWith('https://github.com/candidate/')));
});
