import {
  canonicalJson, sha256, validateSnapshot, validateManifest, validateDelta, MAX_PAYLOAD_BYTES,
  type Snapshot, type Manifest, type Artifact,
} from './remote-schema.ts';

export const REMOTE_BASE_URL = 'https://chenyimu691-gif.github.io/plainai/dictionary/';
export const REMOTE_CACHE_KEY = 'plainai_remote_dictionary_v1';
export const REMOTE_STATUS_KEY = 'plainai_remote_dictionary_status';
export const REMOTE_ALARM = 'plainai-dictionary-check';
export interface RemoteCache { schemaVersion: 1; snapshot: Snapshot; sha256: string; syncedAt: string }
export interface SyncStatus { checkedAt: string; lastSuccessAt?: string; error?: string; version?: number; count?: number }
interface Dependencies {
  read: (key: string) => Promise<unknown>;
  write: (key: string, value: unknown) => Promise<void>;
  fetch: typeof globalThis.fetch;
  now?: () => Date;
}
const MANIFEST_BYTES = 64 * 1024;
const TIMEOUT_MS = 15_000;

/** Only this trusted data origin may be fetched. No user text or browsing URL is sent. */
export function createRemoteSync(dependencies: Dependencies) {
  const now = dependencies.now ?? (() => new Date());
  let pending: Promise<SyncStatus> | null = null;

  async function readCache(): Promise<RemoteCache | null> {
    try {
      const value = await dependencies.read(REMOTE_CACHE_KEY) as RemoteCache | undefined;
      if (!value || value.schemaVersion !== 1 || typeof value.syncedAt !== 'string'
        || !Number.isFinite(Date.parse(value.syncedAt)) || typeof value.sha256 !== 'string') return null;
      validateSnapshot(value.snapshot);
      const encoded = canonicalJson(value.snapshot);
      if (new TextEncoder().encode(encoded).byteLength > MAX_PAYLOAD_BYTES || await sha256(encoded) !== value.sha256) return null;
      return value;
    } catch { return null; }
  }

  async function download(path: string, limit: number): Promise<string> {
    // Manifest artifact paths are separately schema-checked; this also protects direct calls.
    if (!(path === 'manifest.json' || /^(?:snapshots|deltas)\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,150}\.json$/.test(path)) || path.includes('..')) throw new Error('Unsafe dictionary path');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await dependencies.fetch(`${REMOTE_BASE_URL}${path}`, {
        redirect: 'error', credentials: 'omit', cache: 'no-cache', signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok || response.redirected) throw new Error(`Dictionary HTTP ${response.status}`);
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw new Error('Dictionary response too large');
      if (!response.body) throw new Error('Dictionary response has no body');
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > limit) { controller.abort(); throw new Error('Dictionary response too large'); }
        chunks.push(next.value);
      }
      const data = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data);
    } finally {
      clearTimeout(timer);
      if (reader) { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    }
  }

  async function artifact(reference: Artifact): Promise<unknown> {
    const text = await download(reference.path, reference.bytes);
    if (new TextEncoder().encode(text).byteLength !== reference.bytes || await sha256(text) !== reference.sha256)
      throw new Error('Dictionary payload hash/size mismatch');
    return JSON.parse(text);
  }

  function matchesManifest(snapshot: Snapshot, manifest: Manifest) {
    if (snapshot.version !== manifest.version || snapshot.entries.length !== manifest.count
      || snapshot.entries.some(entry => !manifest.domains.includes(entry.category))) throw new Error('Dictionary manifest mismatch');
  }

  async function update(): Promise<SyncStatus> {
    const checkedAt = now().toISOString();
    const cache = await readCache();
    const previous = await dependencies.read(REMOTE_STATUS_KEY).catch(() => undefined) as SyncStatus | undefined;
    let status: SyncStatus;
    try {
      const manifest: unknown = JSON.parse(await download('manifest.json', MANIFEST_BYTES));
      validateManifest(manifest);
      if (cache && manifest.version < cache.snapshot.version) throw new Error('Dictionary version rollback rejected');
      if (cache && manifest.version === cache.snapshot.version) {
        if (manifest.snapshot.sha256 !== cache.sha256) throw new Error('Dictionary same-version hash mutation rejected');
        matchesManifest(cache.snapshot, manifest);
        status = { checkedAt, lastSuccessAt: checkedAt, version: cache.snapshot.version, count: cache.snapshot.entries.length };
      } else {
        let snapshot: Snapshot | undefined;
        const deltaReference = cache && manifest.deltas.find(delta => delta.from === cache.snapshot.version && delta.version === manifest.version);
        if (cache && deltaReference) {
          try {
            const delta = await artifact(deltaReference); validateDelta(delta);
            if (delta.from !== cache.snapshot.version || delta.version !== manifest.version) throw new Error('Delta version mismatch');
            const entries = new Map(cache.snapshot.entries.map(entry => [entry.id, entry]));
            for (const id of delta.removed) entries.delete(id);
            for (const entry of delta.upserts) entries.set(entry.id, entry);
            const candidate = { version: delta.version, entries: [...entries.values()].sort((a, b) => a.id.localeCompare(b.id)) };
            validateSnapshot(candidate); matchesManifest(candidate, manifest);
            const encoded = canonicalJson(candidate);
            if (new TextEncoder().encode(encoded).byteLength !== manifest.snapshot.bytes || await sha256(encoded) !== manifest.snapshot.sha256)
              throw new Error('Reconstructed delta hash/size mismatch');
            snapshot = candidate;
          } catch { /* Missing/outdated/damaged deltas recover through the approved full snapshot. */ }
        }
        if (!snapshot) {
          const candidate = await artifact(manifest.snapshot); validateSnapshot(candidate); matchesManifest(candidate, manifest);
          if (await sha256(canonicalJson(candidate)) !== manifest.snapshot.sha256) throw new Error('Snapshot is not canonical');
          snapshot = candidate;
        }
        const next: RemoteCache = { schemaVersion: 1, snapshot, sha256: manifest.snapshot.sha256, syncedAt: checkedAt };
        // A single storage key commits only the complete validated state; quota/network errors leave the old key intact.
        await dependencies.write(REMOTE_CACHE_KEY, next);
        status = { checkedAt, lastSuccessAt: checkedAt, version: snapshot.version, count: snapshot.entries.length };
      }
    } catch (error) {
      status = {
        checkedAt,
        ...(typeof previous?.lastSuccessAt === 'string' ? { lastSuccessAt: previous.lastSuccessAt } : {}),
        ...(cache ? { version: cache.snapshot.version, count: cache.snapshot.entries.length } : {}),
        error: (error instanceof Error ? error.message : 'Dictionary sync failed').slice(0, 250),
      };
    }
    await dependencies.write(REMOTE_STATUS_KEY, status).catch(() => undefined);
    return status;
  }

  function sync(): Promise<SyncStatus> {
    if (!pending) pending = update().finally(() => { pending = null; });
    return pending;
  }
  return { sync, readCache };
}
