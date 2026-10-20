import { validateSnapshot, MAX_PAYLOAD_BYTES } from './remote-schema.ts';
import type { Snapshot } from './remote-schema.ts';

/** The build verifies this bundled baseline against its source catalog before packaging it. */
export async function loadPackagedSeed(baseUrl: string, fetcher: typeof fetch = fetch): Promise<Snapshot | null> {
  try {
    const response = await fetcher(new URL('dictionary-seed.json', baseUrl).href);
    if (!response.ok) return null;
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_PAYLOAD_BYTES) return null;
    const snapshot: unknown = JSON.parse(text);
    validateSnapshot(snapshot);
    return snapshot;
  } catch { return null; }
}

/** Replace the whole baseline on newer versions, including deliberate online removals. */
export function preferSnapshot(seed: Snapshot | null, cached: Snapshot | null): Snapshot | null {
  if (!seed) return cached;
  return cached && cached.version > seed.version ? cached : seed;
}
