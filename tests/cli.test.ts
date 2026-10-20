import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { digest } from '../scripts/dictionary/core.ts';
import { writeRelease, verifyRelease } from '../scripts/dictionary/releases.ts';

test('default CLI completes collection, quarantine and stable publication with no model configuration or external requests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plainai-cli-'));
  try {
    await cp('scripts/dictionary', join(root, 'scripts/dictionary'), { recursive: true });
    await cp('lib/dictionary', join(root, 'lib/dictionary'), { recursive: true });
    await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    await mkdir(join(root, 'data/dictionary'), { recursive: true });
    const notice = 'MIT fixture license. Copyright Fixture Authors.\n';
    const source = { id: 'fixture', repository: 'example/glossary', path: 'terms.json', adapter: 'json', domain: 'technical', limit: 25,
      license: { spdx: 'MIT', textPath: 'LICENSE', sha256: digest(notice), attribution: 'Fixture Authors', scopeEvidence: 'Test-only synthetic glossary definitions explicitly licensed under MIT.' } };
    await writeFile(join(root, 'LICENSE'), notice);
    await writeFile(join(root, 'data/dictionary/sources.json'), JSON.stringify({ version: 1, sources: [source] }));
    await writeRelease(root, [], '2026-10-19T00:00:00.000Z');
    await writeFile(join(root, 'public/dict.json'), '[]');
    const rows = [
      { term: '缓存', definition: '把经常用到的数据暂存在容易获取的位置，以便下次更快读取。' },
      { term: 'Queue', definition: 'A sequence of items processed in the order in which they arrive.' },
    ];
    await writeFile(join(root, 'mock.mjs'), `
      globalThis.fetch = async input => {
        const url = new URL(input);
        if (url.origin === 'https://api.github.com' && url.pathname === '/search/repositories') return Response.json({ items: [] });
        if (url.href === 'https://api.github.com/repos/example/glossary/commits?per_page=1') return Response.json([{ sha: '${'a'.repeat(40)}' }]);
        if (url.href === 'https://raw.githubusercontent.com/example/glossary/${'a'.repeat(40)}/LICENSE') return new Response(${JSON.stringify(notice)});
        if (url.href === 'https://raw.githubusercontent.com/example/glossary/${'a'.repeat(40)}/terms.json') return Response.json(${JSON.stringify(rows)});
        throw Error('Unexpected request; test never uses real network');
      };
    `);
    const run = () => promisify(execFile)(process.execPath, ['--experimental-strip-types', '--import', join(root, 'mock.mjs'), join(root, 'scripts/dictionary/cli.ts'), 'update'],
      { cwd: root, env: { PATH: process.env.PATH }, timeout: 10_000 });
    const invocation = await run();
    assert.ok(invocation.stdout.trim(), `CLI returned no result: ${JSON.stringify(invocation)}`);
    const first = JSON.parse(invocation.stdout);
    assert.deepEqual(first, { mode: 'source-copy', changed: true, version: 2, entries: 1, quarantined: 1, modelPairs: 0 });
    const result = await verifyRelease(root, [source as any]);
    assert.equal(result.snapshot.entries[0].plain, rows[0].definition);
    assert.equal((result.snapshot.entries[0].quality as any).method, 'source-copy');
    const quarantine = JSON.parse(await readFile(join(root, 'data/dictionary/quarantine.json'), 'utf8'));
    assert.equal(quarantine.items[0].term, 'Queue');
    const again = JSON.parse((await run()).stdout);
    assert.equal(again.changed, false);
    assert.equal(again.version, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});
