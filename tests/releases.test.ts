import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRelease, verifyRelease } from '../scripts/dictionary/releases.ts';
import { canonicalJson } from '../lib/dictionary/remote-schema.ts';
import { createEntry, digest } from '../scripts/dictionary/core.ts';
import type { Source } from '../scripts/dictionary/core.ts';

const source: Source = { id: 'fixture', repository: 'example/glossary', path: 'terms.json', adapter: 'json', domain: 'technical', limit: 25,
  license: { spdx: 'MIT', textPath: 'LICENSE', sha256: digest('test license'), attribution: 'Fixture author', scopeEvidence: 'Test-only synthetic content licensed under MIT.' } };
function entry(term: string, approved = source, revision = 'a'.repeat(40)) {
  return createEntry({ source: approved, revision, term, aka: [], definition: 'A sequence of instructions used to accomplish a particular task.' },
    { plain: '按一定顺序执行的一组步骤，用来完成特定任务。' }, { faithful: true, plainLanguage: true, domainCorrect: true, safe: true, reason: '原文和解释都强调按步骤完成任务。' },
    { generator: 'fixture-generator', reviewer: 'fixture-reviewer', now: '2026-10-19T02:00:00.000Z' });
}

test('release is content stable and an update produces verifiable upserts/removals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plainai-release-'));
  try {
    const first = await writeRelease(root, [entry('First term')], '2026-10-19T02:00:00.000Z');
    assert.equal(first.changed, true); assert.equal(first.manifest.version, 1);
    const again = await writeRelease(root, [entry('First term')], '2026-10-26T02:00:00.000Z');
    assert.equal(again.changed, false); assert.equal(again.manifest.version, 1);
    const next = await writeRelease(root, [entry('Second term')], '2026-10-26T02:00:00.000Z');
    assert.equal(next.manifest.version, 2);
    const delta = JSON.parse(await readFile(join(root, 'public/dictionary', next.manifest.deltas[0].path), 'utf8'));
    assert.deepEqual(delta.removed, [entry('First term').id]);
    assert.equal(delta.upserts[0].term, 'Second term');
    assert.equal((await verifyRelease(root)).snapshot.entries[0].term, 'Second term');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('tampered payload and mismatched approved data fail release verification', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plainai-release-'));
  try {
    const first = await writeRelease(root, [entry('First term')], '2026-10-19T02:00:00.000Z');
    const path = join(root, 'public/dictionary', first.manifest.snapshot.path);
    const original = await readFile(path, 'utf8');
    await writeFile(path, original.replace('按一定顺序', '被篡改内容'));
    await assert.rejects(verifyRelease(root), /hash|integrity/i);
    await writeFile(path, original);
    await writeFile(join(root, 'data/dictionary/entries.json'), canonicalJson([]));
    await assert.rejects(verifyRelease(root), /approved|entries/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('eight-generation delta retention reconstructs each retained base to target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plainai-release-'));
  try {
    for (let i = 1; i <= 11; i++) await writeRelease(root, [entry(`Term number ${i}`)], '2026-10-19T02:00:00.000Z');
    const { manifest } = await verifyRelease(root);
    assert.equal(manifest.version, 11); assert.equal(manifest.deltas.length, 8);
    assert.equal(Math.min(...manifest.deltas.map(d => d.from)), 3);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('missing artifact in an existing release cannot reset the version counter', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plainai-release-'));
  try {
    const first = await writeRelease(root, [], '2026-10-19T02:00:00.000Z');
    await rm(join(root, 'public/dictionary', first.manifest.snapshot.path));
    await assert.rejects(writeRelease(root, [], '2026-10-26T02:00:00.000Z'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('reviewed license migration preserves prior entries and delta bases only with explicit historical approval', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plainai-license-migration-'));
  try {
    const old = entry('Old reviewed term');
    await writeRelease(root, [old], '2026-10-19T02:00:00.000Z');
    const migrated = { ...source,
      license: { ...source.license, sha256: digest('new approved full notice'), path: 'LICENSE-MIT', textPath: 'notices/current.txt', attribution: 'Fixture author and new contributors' },
      licenseHistory: [{ ...source.license, revisions: [old.source.revision] }],
    };
    await verifyRelease(root, [migrated]);
    await assert.rejects(verifyRelease(root, [{ ...migrated, licenseHistory: [] }]), /Unapproved source evidence/);
    await assert.rejects(verifyRelease(root, [{ ...migrated, licenseHistory: [{ ...source.license, revisions: ['b'.repeat(40)] }] }]), /Unapproved source evidence/);
    await assert.rejects(verifyRelease(root, [{ ...migrated, licenseHistory: [{ ...source.license, sha256: digest('unregistered'), revisions: [old.source.revision] }] }]), /Unapproved source evidence/);
    await assert.rejects(verifyRelease(root, [{ ...migrated, licenseHistory: [{ ...source.license, attribution: 'Unapproved replacement attribution', revisions: [old.source.revision] }] }]), /Unapproved source evidence/);
    await assert.rejects(verifyRelease(root, [{ ...migrated, licenseHistory: [{ ...source.license, path: 'different/LICENSE', revisions: [old.source.revision] }] }]), /Unapproved source evidence/);
    const fresh = entry('New reviewed term', migrated, 'b'.repeat(40));
    await writeRelease(root, [old, fresh], '2026-10-26T02:00:00.000Z');
    assert.equal((await verifyRelease(root, [migrated])).snapshot.entries.length, 2);
    await writeRelease(root, [fresh], '2026-11-02T02:00:00.000Z');
    assert.equal((await verifyRelease(root, [migrated])).snapshot.entries.length, 1);
    await assert.rejects(verifyRelease(root, [{ ...migrated, licenseHistory: [] }]), /Unapproved source evidence/, 'old delta bases still require historical approval after old entries leave the latest snapshot');
  } finally { await rm(root, { recursive: true, force: true }); }
});
