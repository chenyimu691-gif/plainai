import type { DictEntry } from '../../lib/dictionary/types.ts';
import type { RemoteEntry } from '../../lib/dictionary/remote-schema.ts';
import { canonicalJson, normalizeTerm } from '../../lib/dictionary/remote-schema.ts';
import { chooseCandidates, createEntry, createSourceEntry, entryId } from './core.ts';
import type { Candidate } from './core.ts';

export interface QuarantineRecord { term: string; sourceId: string; reason: string; deferredSince?: string }
export function parseQuarantine(value: unknown): QuarantineRecord[] {
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)) throw new Error('Invalid quarantine report');
  for (const item of value.items) {
    if (!item || typeof item !== 'object' || !['term', 'sourceId', 'reason'].every(key => typeof item[key] === 'string')
      || (item.deferredSince !== undefined && (typeof item.deferredSince !== 'string' || !Number.isFinite(Date.parse(item.deferredSince))))) {
      throw new Error('Invalid quarantine report');
    }
  }
  return value.items;
}
const queueKey = (sourceId: string, term: string) => `${sourceId}:${normalizeTerm(term)}`;

/** Deterministic default path: no API credentials, model calls, rewriting or per-entry human approval. */
export function planSourceUpdate(options: {
  candidates: Candidate[]; builtin: Array<Pick<DictEntry, 'term' | 'aka'>>; previous: RemoteEntry[]; now: string;
}) {
  const valid: Candidate[] = [];
  const quarantine: QuarantineRecord[] = [];
  for (const candidate of options.candidates) {
    try { createSourceEntry(candidate, options.now); valid.push(candidate); }
    catch (error) { quarantine.push({ term: candidate.term, sourceId: candidate.source.id,
      reason: (error instanceof Error ? error.message : 'source-copy-rejected').slice(0, 250) }); }
  }
  const chosen = chooseCandidates(valid, options.builtin, 3000);
  quarantine.push(...chosen.rejected);
  const previous = new Map(options.previous.map(entry => [entry.id, entry]));
  const content = (entry: RemoteEntry) => {
    const { quality: _quality, ...fields } = entry;
    return canonicalJson({ ...fields, source: { ...entry.source, revision: '',
      url: entry.source.url.replace(entry.source.revision, ''), licenseUrl: entry.source.licenseUrl.replace(entry.source.revision, '') } });
  };
  const entries = chosen.accepted.map(candidate => {
    const entry = createSourceEntry(candidate, options.now);
    const old = previous.get(entry.id);
    if (old && 'method' in old.quality && old.quality.method === 'source-copy' && content(old) === content(entry)) return old;
    return entry;
  });
  return { entries: entries.sort((a, b) => a.id.localeCompare(b.id, 'en')), quarantine, calls: 0 };
}

/** All I/O is outside the planner; provider errors abort before any release is written. */
export async function planUpdate(options: {
  candidates: Candidate[]; builtin: Array<Pick<DictEntry, 'term' | 'aka'>>; previous: RemoteEntry[];
  previousQuarantine?: QuarantineRecord[];
  run: { generator: string; reviewer: string; now: string };
  simplify: (candidate: Candidate) => Promise<{ rewrite: unknown; review: unknown }>;
}) {
  const chosen = chooseCandidates(options.candidates, options.builtin, 3000);
  const quarantine: QuarantineRecord[] = [...chosen.rejected];
  const deferred = new Map((options.previousQuarantine ?? []).filter(item => item.reason === 'generation-budget-deferred')
    .map(item => [queueKey(item.sourceId, item.term), item.deferredSince ?? options.run.now]));
  const age = (candidate: Candidate) => deferred.get(queueKey(candidate.source.id, candidate.term)) ?? options.run.now;
  // Oldest deferred terms go first; retain the original age across runs to avoid two groups starving a third.
  const pending = [...chosen.accepted].sort((a, b) => Date.parse(age(a)) - Date.parse(age(b)));
  const old = new Map(options.previous.map(e => [e.id, e]));
  const entries: RemoteEntry[] = [];
  const spent = new Map<string, number>(); let calls = 0;
  for (const candidate of pending) {
    const previous = old.get(entryId(candidate.source.domain, candidate.term));
    const same = previous && previous.source.id === candidate.source.id && previous.source.definition === candidate.definition
      && previous.source.licenseSha256 === candidate.source.license.sha256
      && previous.source.attribution === candidate.source.license.attribution
      && canonicalJson(previous.aka ?? []) === canonicalJson(candidate.aka)
      && canonicalJson(previous.context ?? null) === canonicalJson(candidate.source.context ?? null);
    if (same && previous) { entries.push(previous); continue; }
    if (calls >= 100 || (spent.get(candidate.source.id) ?? 0) >= candidate.source.limit) {
      quarantine.push({ term: candidate.term, sourceId: candidate.source.id, reason: 'generation-budget-deferred', deferredSince: age(candidate) });
      if (previous) entries.push(previous);
      continue;
    }
    spent.set(candidate.source.id, (spent.get(candidate.source.id) ?? 0) + 1); calls++;
    // Do not catch transport/API/JSON failures as semantic rejection or publish partial output.
    const { rewrite, review } = await options.simplify(candidate);
    try { entries.push(createEntry(candidate, rewrite, review, options.run)); }
    catch (error) { quarantine.push({ term: candidate.term, sourceId: candidate.source.id,
      reason: (error instanceof Error ? error.message : 'quality-rejected').slice(0, 250) }); }
  }
  return { entries: entries.sort((a, b) => a.id.localeCompare(b.id, 'en')), quarantine, calls };
}
