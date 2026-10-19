import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { digest } from '../scripts/dictionary/core.ts';
import type { Source } from '../scripts/dictionary/core.ts';
import { buildNotices } from '../scripts/dictionary/notices.ts';

test('published notices retain current and historical complete texts without normalizing bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plainai-notices-'));
  try {
    const current = 'MIT current notice\nCopyright Current Authors\n\nPermission is hereby granted.\n';
    const historical = '\ufeffMIT historical notice\r\nCopyright Previous Authors\r\n\r\nPermission is hereby granted.\r\n\t';
    await mkdir(join(root, 'licenses'));
    await writeFile(join(root, 'licenses/current.txt'), current);
    await writeFile(join(root, 'licenses/historical.txt'), historical);
    const source: Source = {
      id: 'fixture-source', repository: 'example/glossary', path: 'terms.json', adapter: 'json',
      domain: 'technical', limit: 10,
      license: { spdx: 'MIT', textPath: 'licenses/current.txt', sha256: digest(current),
        attribution: 'Current Authors', scopeEvidence: 'README explicitly licenses the original glossary as MIT.' },
      licenseHistory: [{ spdx: 'MIT', textPath: 'licenses/historical.txt', sha256: digest(historical),
        attribution: 'Previous Authors', scopeEvidence: 'The approved historical glossary revision is licensed as MIT.', revisions: ['a'.repeat(40)] }],
    };

    const built = await buildNotices(root, [source]);
    assert.deepEqual(built.licenses, [
      { name: 'fixture-source.txt', text: current },
      { name: `fixture-source-${digest(historical)}.txt`, text: historical },
    ]);
    assert.ok(built.notices.includes(`Current Authors\nChanges: Chinese translation and plain-language adaptation by PlainAI.\n${current}`));
    assert.ok(built.notices.includes(`Previous Authors\nChanges: Chinese translation and plain-language adaptation by PlainAI.\n${historical}`));
    assert.ok(built.notices.includes('a'.repeat(40)), 'historical notice identifies its approved revision');
    assert.ok(Buffer.from(built.notices).includes(Buffer.from(historical)), 'the original historical notice bytes are included unchanged');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('same historical notice hash shares one Pages file while preserving each reviewed attribution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plainai-notices-'));
  try {
    const text = 'MIT unchanged complete notice\nCopyright Example Contributors\n';
    await writeFile(join(root, 'notice.txt'), text);
    const license = { spdx: 'MIT' as const, textPath: 'notice.txt', sha256: digest(text),
      attribution: 'Current Authors', scopeEvidence: 'README explicitly licenses all original glossary definitions.' };
    const source: Source = {
      id: 'disabled-source', repository: 'example/glossary', path: 'terms.json', adapter: 'json',
      domain: 'technical', limit: 10, enabled: false, license,
      licenseHistory: [
        { ...license, attribution: 'First Historical Authors', revisions: ['a'.repeat(40)] },
        { ...license, attribution: 'Second Historical Authors', revisions: ['b'.repeat(40)] },
      ],
    };
    const built = await buildNotices(root, [source]);
    assert.deepEqual(built.licenses, [
      { name: 'disabled-source.txt', text },
      { name: `disabled-source-${digest(text)}.txt`, text },
    ]);
    assert.ok(built.notices.includes('First Historical Authors'));
    assert.ok(built.notices.includes('Second Historical Authors'));
    assert.ok(built.notices.includes('b'.repeat(40)));
  } finally { await rm(root, { recursive: true, force: true }); }
});
