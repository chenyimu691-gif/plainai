import type { DictEntry } from './types.ts';

export const DOMAINS = ['technical', 'business', 'finance', 'legal', 'medical', 'science', 'internet', 'education'] as const;
export const ALLOWED_LICENSES = ['MIT', 'Apache-2.0', 'CC0-1.0', 'CC-BY-4.0'] as const;
export type Domain = typeof DOMAINS[number];
export type AllowedLicense = typeof ALLOWED_LICENSES[number];
export const MAX_PAYLOAD_BYTES = 3 * 1024 * 1024;
export const MAX_ENTRIES = 3000;

export interface ModelQuality {
  generator: string; reviewer: string; promptVersion: '1'; reviewedAt: string; reason: string;
  checks: { faithful: true; plainLanguage: true; domainCorrect: true; safe: true };
}
export interface SourceQuality {
  method: 'source-copy'; checkedAt: string;
  checks: { chinese: true; verbatim: true; safe: true };
}

export interface RemoteEntry extends DictEntry {
  id: string;
  category: Domain;
  source: {
    id: string; url: string; revision: string; license: AllowedLicense; licenseUrl: string;
    licenseSha256: string; attribution: string; definition: string;
  };
  quality: ModelQuality | SourceQuality;
  context?: { jurisdiction?: string; asOf?: string };
}
export interface Snapshot { version: number; entries: RemoteEntry[] }
export interface Delta { from: number; version: number; upserts: RemoteEntry[]; removed: string[] }
export interface Artifact { path: string; sha256: string; bytes: number }
export interface Manifest {
  schemaVersion: 1; version: number; createdAt: string; count: number; domains: Domain[];
  snapshot: Artifact; deltas: Array<Artifact & { from: number; version: number }>;
}

const HEX64 = /^[a-f0-9]{64}$/;
const HEX40 = /^[a-f0-9]{40}$/;
const HTML = /<\/?[a-z][^>]*>/i;
const FORBIDDEN_TEXT = /(?:TODO|TBD|lorem ipsum|待补充|暂无解释|忽略.{0,12}(?:指令|提示)|系统提示词|ignore.{0,20}instructions)/i;
const ADVICE = /(?:\d+(?:\.\d+)?\s*(?:毫克|微克|mg\b|mcg\b)|(?:建议你|你应|您应|务必).{0,16}(?:买入|卖出|投资|服用|用药|起诉|签署)|(?:每天|每日|一次).{0,8}(?:服用|用药)|保证.{0,5}(?:收益|治愈))/i;

function fail(message: string): never { throw new Error(`Invalid dictionary: ${message}`); }
function object(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
}
function fields(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
  for (const key of Object.keys(value)) if (![...required, ...optional].includes(key)) fail(`unknown field ${key}`);
}
function text(value: unknown, label: string, max: number, min = 1): asserts value is string {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max
    || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value) || HTML.test(value)) fail(`${label} has invalid text`);
}
function positive(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail(`${label} must be a positive integer`);
}
function digest(value: unknown, label: string) { if (typeof value !== 'string' || !HEX64.test(value)) fail(`${label} must be SHA256`); }
function timestamp(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
    || !Number.isFinite(Date.parse(value))) fail('invalid ISO timestamp');
}
function https(value: unknown): URL {
  text(value, 'URL', 1000);
  let url: URL;
  try { url = new URL(value); } catch { return fail('invalid URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) fail('URL must use plain HTTPS');
  return url;
}
function pinnedSource(value: unknown, revision: string) {
  const url = https(value);
  const pattern = url.hostname === 'raw.githubusercontent.com'
    ? new RegExp(`^/[^/]+/[^/]+/${revision}/.+`)
    : url.hostname === 'github.com' ? new RegExp(`^/[^/]+/[^/]+/blob/${revision}/.+`) : null;
  if (!pattern?.test(url.pathname)) fail('source URL must be pinned to its GitHub commit');
}

export function normalizeTerm(value: string): string { return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase(); }

/** Language screening only; this does not establish semantic accuracy or readability. */
export function isChineseDefinition(value: string): boolean {
  const chinese = (value.match(/[\u3400-\u9FFF]/g) ?? []).length;
  const letters = (value.match(/[a-zA-Z\u3400-\u9FFF]/g) ?? []).length;
  return chinese >= 8 && chinese / Math.max(letters, 1) >= 0.4;
}

/** Shared browser/Node canonical encoding. Arrays retain their deliberate order. */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  function encode(item: unknown): string {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number' && Number.isFinite(item)) return JSON.stringify(item);
    if (typeof item !== 'object' || !item || ancestors.has(item)) return fail('not a finite JSON value');
    ancestors.add(item);
    const result = Array.isArray(item) ? `[${item.map(encode).join(',')}]`
      : `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${encode((item as Record<string, unknown>)[key])}`).join(',')}}`;
    ancestors.delete(item);
    return result;
  }
  return encode(value);
}

export async function sha256(value: string): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function validateRemoteEntry(value: unknown): asserts value is RemoteEntry {
  object(value, 'entry');
  fields(value, ['id', 'term', 'category', 'plain', 'source', 'quality'], ['example', 'analogy', 'aka', 'context']);
  digest(value.id, 'entry ID'); text(value.term, 'term', 100); text(value.plain, 'plain', 240, 8);
  if (!DOMAINS.includes(value.category as Domain)) fail('unknown domain');
  if (!/[\u3400-\u9FFF]/.test(value.plain)) fail('explanation must contain Chinese');
  for (const key of ['plain', 'example', 'analogy'] as const) {
    if (value[key] !== undefined) {
      text(value[key], key, key === 'example' ? 280 : 240);
      if (FORBIDDEN_TEXT.test(value[key] as string) || ADVICE.test(value[key] as string)) fail('unsafe or placeholder explanation');
    }
  }
  if (value.aka !== undefined) {
    if (!Array.isArray(value.aka) || value.aka.length > 8) fail('invalid aliases');
    const seen = new Set([normalizeTerm(value.term)]);
    for (const alias of value.aka) {
      text(alias, 'alias', 100); const key = normalizeTerm(alias);
      if (seen.has(key)) fail('duplicate alias'); seen.add(key);
    }
  }
  object(value.source, 'source');
  fields(value.source, ['id', 'url', 'revision', 'license', 'licenseUrl', 'licenseSha256', 'attribution', 'definition']);
  text(value.source.id, 'source ID', 100);
  if (typeof value.source.revision !== 'string' || !HEX40.test(value.source.revision)) fail('source revision must be a commit');
  pinnedSource(value.source.url, value.source.revision);
  https(value.source.licenseUrl); digest(value.source.licenseSha256, 'license hash');
  if (!ALLOWED_LICENSES.includes(value.source.license as AllowedLicense)) fail('license not allowed');
  text(value.source.attribution, 'attribution', 400); text(value.source.definition, 'source definition', 2000);
  object(value.quality, 'quality');
  if (value.quality.method === 'source-copy') {
    fields(value.quality, ['method', 'checkedAt', 'checks']); timestamp(value.quality.checkedAt);
    if (!isChineseDefinition(value.plain) || value.plain !== value.source.definition
      || value.example !== undefined || value.analogy !== undefined) fail('source-copy must preserve a Chinese source verbatim');
    object(value.quality.checks, 'quality checks');
    fields(value.quality.checks, ['chinese', 'verbatim', 'safe']);
  } else {
    fields(value.quality, ['generator', 'reviewer', 'promptVersion', 'reviewedAt', 'reason', 'checks']);
    text(value.quality.generator, 'generator', 150); text(value.quality.reviewer, 'reviewer', 150);
    text(value.quality.reason, 'review reason', 500, 8);
    if (value.quality.generator === value.quality.reviewer) fail('reviewer must be independent');
    if (value.quality.promptVersion !== '1') fail('unknown prompt version'); timestamp(value.quality.reviewedAt);
    object(value.quality.checks, 'quality checks');
    fields(value.quality.checks, ['faithful', 'plainLanguage', 'domainCorrect', 'safe']);
  }
  if (Object.values(value.quality.checks).some(check => check !== true)) fail('quality checks must all pass');
  if (value.context !== undefined) {
    object(value.context, 'context'); fields(value.context, [], ['jurisdiction', 'asOf']);
    if (value.context.jurisdiction !== undefined) text(value.context.jurisdiction, 'jurisdiction', 100);
    if (value.context.asOf !== undefined && (typeof value.context.asOf !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(value.context.asOf) || !Number.isFinite(Date.parse(value.context.asOf)))) fail('invalid context date');
  }
  if (value.category === 'legal' && (!value.context || !value.context.jurisdiction || !value.context.asOf)) fail('legal context is required');
}

export function validateSnapshot(value: unknown): asserts value is Snapshot {
  object(value, 'snapshot'); fields(value, ['version', 'entries']); positive(value.version, 'version');
  if (!Array.isArray(value.entries) || value.entries.length > MAX_ENTRIES) fail('too many entries');
  let previous = '';
  const terms = new Set<string>();
  for (const entry of value.entries) {
    validateRemoteEntry(entry);
    if (entry.id <= previous) fail('entry IDs must be unique and sorted'); previous = entry.id;
    const key = `${entry.category}:${normalizeTerm(entry.term)}`;
    if (terms.has(key)) fail('duplicate domain term'); terms.add(key);
  }
}
function artifact(value: unknown, delta = false): asserts value is Artifact {
  object(value, 'artifact'); fields(value, ['path', 'sha256', 'bytes', ...(delta ? ['from', 'version'] : [])]);
  const pathPattern = delta ? /^deltas\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,150}\.json$/ : /^snapshots\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,150}\.json$/;
  if (typeof value.path !== 'string' || !pathPattern.test(value.path) || value.path.includes('..')) fail('unsafe artifact path');
  digest(value.sha256, 'artifact hash'); positive(value.bytes, 'artifact size');
  if (value.bytes > MAX_PAYLOAD_BYTES) fail('artifact too large');
}
export function validateManifest(value: unknown): asserts value is Manifest {
  object(value, 'manifest'); fields(value, ['schemaVersion', 'version', 'createdAt', 'count', 'domains', 'snapshot', 'deltas']);
  if (value.schemaVersion !== 1) fail('unknown schema version'); positive(value.version, 'version'); timestamp(value.createdAt);
  if (!Number.isSafeInteger(value.count) || (value.count as number) < 0 || (value.count as number) > MAX_ENTRIES) fail('invalid entry count');
  if (!Array.isArray(value.domains) || value.domains.length > DOMAINS.length || new Set(value.domains).size !== value.domains.length
    || value.domains.some(domain => !DOMAINS.includes(domain as Domain))) fail('invalid domains');
  artifact(value.snapshot);
  if (!Array.isArray(value.deltas) || value.deltas.length > 8) fail('invalid delta list');
  const from = new Set<number>();
  for (const delta of value.deltas) {
    artifact(delta, true); object(delta, 'delta'); positive(delta.from, 'delta from'); positive(delta.version, 'delta version');
    if ((delta.from as number) >= (delta.version as number) || (delta.version as number) > (value.version as number) || from.has(delta.from as number)) fail('invalid delta versions');
    from.add(delta.from as number);
  }
}
export function validateDelta(value: unknown): asserts value is Delta {
  object(value, 'delta'); fields(value, ['from', 'version', 'upserts', 'removed']); positive(value.from, 'delta from'); positive(value.version, 'delta version');
  if (value.from >= value.version) fail('invalid delta versions');
  if (!Array.isArray(value.upserts) || value.upserts.length > MAX_ENTRIES || !Array.isArray(value.removed) || value.removed.length > MAX_ENTRIES) fail('invalid delta size');
  const ids = new Set<string>();
  for (const entry of value.upserts) { validateRemoteEntry(entry); if (ids.has(entry.id)) fail('duplicate upsert'); ids.add(entry.id); }
  for (const id of value.removed) { digest(id, 'removed ID'); if (ids.has(id as string)) fail('duplicate/conflicting removal'); ids.add(id as string); }
}

/** Built-in canonical names and aliases always have priority over downloaded data. */
export function mergeDictionaries(builtin: DictEntry[], remote: RemoteEntry[]): DictEntry[] {
  const result = [...builtin];
  const seen = new Set(builtin.flatMap(entry => [entry.term, ...(entry.aka ?? [])]).map(normalizeTerm));
  const candidates = [...remote].sort((a, b) => a.id.localeCompare(b.id));
  const canonicalNames = new Set(candidates.map(entry => normalizeTerm(entry.term)));
  for (const entry of candidates) {
    const term = normalizeTerm(entry.term);
    if (seen.has(term)) continue;
    seen.add(term);
    const aka = (entry.aka ?? []).filter(alias => {
      const key = normalizeTerm(alias);
      if (seen.has(key) || canonicalNames.has(key)) return false;
      seen.add(key); return true;
    });
    result.push({ ...entry, ...(entry.aka ? { aka } : {}) });
  }
  return result;
}
