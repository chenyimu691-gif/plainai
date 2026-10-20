import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalJson, validateManifest, validateSnapshot, validateDelta, MAX_PAYLOAD_BYTES } from '../../lib/dictionary/remote-schema.ts';
import type { Manifest, Snapshot, RemoteEntry, Delta, Artifact } from '../../lib/dictionary/remote-schema.ts';
import { digest, entryId, sourceSafety } from './core.ts';
import type { Source } from './core.ts';

const sorted = (entries: RemoteEntry[]) => [...entries].sort((a, b) => a.id.localeCompare(b.id, 'en'));
function apply(base: Snapshot, delta: Delta): Snapshot {
  if (base.version !== delta.from) throw new Error('Delta base version mismatch');
  const entries = new Map(base.entries.map(e => [e.id, e]));
  delta.removed.forEach(id => entries.delete(id)); delta.upserts.forEach(e => entries.set(e.id, e));
  return { version: delta.version, entries: sorted([...entries.values()]) };
}
function evidence(entries: RemoteEntry[], sources?: Source[]) {
  const surfaces = new Set<string>();
  for (const entry of entries) {
    for (const name of [entry.term, ...(entry.aka ?? [])]) {
      const normalized = name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
      if (surfaces.has(normalized)) throw new Error('Duplicate published term or alias');
      surfaces.add(normalized);
    }
    if (entry.id !== entryId(entry.category, entry.term)) throw new Error('Entry ID does not match domain and term');
    if (!sources) continue;
    const source = sources.find(s => s.id === entry.source.id);
    if (!source || entry.category !== source.domain
      || entry.source.url !== `https://github.com/${source.repository}/blob/${entry.source.revision}/${source.path}`) throw new Error(`Unapproved source evidence: ${entry.term}`);
    const licenses = [source.license, ...(source.licenseHistory ?? []).filter(license => license.revisions.includes(entry.source.revision))];
    if (!licenses.some(license => entry.source.license === license.spdx && entry.source.licenseSha256 === license.sha256
      && entry.source.attribution === license.attribution
      && entry.source.licenseUrl === `https://github.com/${source.repository}/blob/${entry.source.revision}/${license.path ?? 'LICENSE'}`)) throw new Error(`Unapproved source evidence: ${entry.term}`);
    if (canonicalJson(entry.context ?? null) !== canonicalJson(source.context ?? null)
      || sourceSafety({ source, revision: entry.source.revision, term: entry.term, definition: entry.source.definition, aka: entry.aka ?? [] })) throw new Error(`Unsafe source context or definition: ${entry.term}`);
  }
}
async function readArtifact(dir: string, ref: Artifact): Promise<unknown> {
  const content = await readFile(join(dir, ref.path), 'utf8');
  if (Buffer.byteLength(content) !== ref.bytes || digest(content) !== ref.sha256) throw new Error(`Artifact hash/integrity mismatch: ${ref.path}`);
  const parsed: unknown = JSON.parse(content);
  if (canonicalJson(parsed) !== content) throw new Error('Artifact must use canonical JSON');
  return parsed;
}

export async function verifyRelease(root: string, sources?: Source[]) {
  const dir = join(root, 'public/dictionary');
  const manifest: unknown = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  validateManifest(manifest);
  const snapshot = await readArtifact(dir, manifest.snapshot);
  validateSnapshot(snapshot); evidence(snapshot.entries, sources);
  if (snapshot.version !== manifest.version || snapshot.entries.length !== manifest.count) throw new Error('Snapshot manifest mismatch');
  const actualDomains = [...new Set(snapshot.entries.map(e => e.category))].sort();
  if (canonicalJson(actualDomains) !== canonicalJson([...manifest.domains].sort())) throw new Error('Manifest domain coverage mismatch');
  const entries: unknown = JSON.parse(await readFile(join(root, 'data/dictionary/entries.json'), 'utf8'));
  if (canonicalJson(entries) !== canonicalJson(snapshot.entries)) throw new Error('Approved entries do not match snapshot');
  for (const ref of manifest.deltas) {
    const delta = await readArtifact(dir, ref); validateDelta(delta); evidence(delta.upserts, sources);
    if (delta.from !== ref.from || delta.version !== ref.version || delta.version !== manifest.version) throw new Error('Delta manifest mismatch');
    const file = (await readdir(join(dir, 'snapshots'))).find(f => f.startsWith(`${delta.from}-`));
    if (!file) throw new Error('Missing delta base snapshot');
    const raw = await readFile(join(dir, 'snapshots', file), 'utf8');
    if (file !== `${delta.from}-${digest(raw)}.json`) throw new Error('Base snapshot hash mismatch');
    const base: unknown = JSON.parse(raw); validateSnapshot(base); evidence(base.entries, sources);
    if (digest(canonicalJson(apply(base, delta))) !== manifest.snapshot.sha256) throw new Error('Delta reconstruction hash mismatch');
  }
  return { manifest, snapshot };
}

async function putArtifact(dir: string, folder: string, prefix: string, value: unknown): Promise<Artifact> {
  const content = canonicalJson(value);
  if (Buffer.byteLength(content) > MAX_PAYLOAD_BYTES) throw new Error('Release exceeds browser cache budget');
  const hash = digest(content); const path = `${folder}/${prefix}-${hash}.json`;
  await mkdir(join(dir, folder), { recursive: true });
  try {
    const existing = await readFile(join(dir, path), 'utf8');
    if (existing !== content) throw new Error('Immutable artifact collision');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await writeFile(join(dir, path), content); }
  return { path, sha256: hash, bytes: Buffer.byteLength(content) };
}

export async function writeRelease(root: string, entries: RemoteEntry[], now: string) {
  const dir = join(root, 'public/dictionary');
  let previous: Awaited<ReturnType<typeof verifyRelease>> | undefined;
  let exists = true;
  try { await readFile(join(dir, 'manifest.json')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; exists = false; }
  if (exists) previous = await verifyRelease(root);
  entries = sorted(entries);
  if (previous && canonicalJson(previous.snapshot.entries) === canonicalJson(entries)) return { changed: false, manifest: previous.manifest };
  const snapshot: Snapshot = { version: (previous?.manifest.version ?? 0) + 1, entries };
  validateSnapshot(snapshot); evidence(entries);
  const history: Snapshot[] = [];
  if (previous) {
    const files = await readdir(join(dir, 'snapshots'));
    for (const file of files) {
      const raw = await readFile(join(dir, 'snapshots', file), 'utf8');
      const base: unknown = JSON.parse(raw); validateSnapshot(base);
      if (file !== `${base.version}-${digest(raw)}.json`) throw new Error('Historical snapshot hash mismatch');
      history.push(base);
    }
  }
  const bases = history.sort((a, b) => b.version - a.version).slice(0, 8);
  const snapshotRef = await putArtifact(dir, 'snapshots', `${snapshot.version}`, snapshot);
  const deltas: Manifest['deltas'] = [];
  const current = new Map(entries.map(e => [e.id, e]));
  for (const base of bases) {
    const old = new Map(base.entries.map(e => [e.id, e]));
    const delta: Delta = { from: base.version, version: snapshot.version,
      upserts: entries.filter(e => canonicalJson(old.get(e.id) ?? null) !== canonicalJson(e)),
      removed: base.entries.filter(e => !current.has(e.id)).map(e => e.id).sort() };
    validateDelta(delta);
    deltas.push({ from: base.version, version: snapshot.version, ...await putArtifact(dir, 'deltas', `${base.version}-${snapshot.version}`, delta) });
  }
  const manifest: Manifest = { schemaVersion: 1, version: snapshot.version, createdAt: now, count: entries.length,
    domains: [...new Set(entries.map(e => e.category))].sort(), snapshot: snapshotRef, deltas };
  validateManifest(manifest);
  await mkdir(join(root, 'data/dictionary'), { recursive: true });
  await writeFile(join(root, 'data/dictionary/entries.json'), `${JSON.stringify(entries, null, 2)}\n`);
  // Manifest is written last. The workflow deploys the entire validated directory atomically.
  await writeFile(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const keepSnapshots = new Set([snapshotRef.path.split('/')[1], ...bases.map(b => `${b.version}-${digest(canonicalJson(b))}.json`)]);
  const keepDeltas = new Set(deltas.map(d => d.path.split('/')[1]));
  for (const [folder, keep] of [['snapshots', keepSnapshots], ['deltas', keepDeltas]] as const) {
    await mkdir(join(dir, folder), { recursive: true });
    for (const name of await readdir(join(dir, folder))) if (!keep.has(name)) await unlink(join(dir, folder, name));
  }
  await verifyRelease(root);
  return { changed: true, manifest };
}
