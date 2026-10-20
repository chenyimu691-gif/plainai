/** Pure collection/admission rules. Downloaded source files are never executed. */
import { createHash } from 'node:crypto';
import ts from 'typescript';
import {
  ALLOWED_LICENSES, DOMAINS, normalizeTerm, validateRemoteEntry,
} from '../../lib/dictionary/remote-schema.ts';
import type { AllowedLicense, Domain, RemoteEntry, ModelQuality, SourceQuality } from '../../lib/dictionary/remote-schema.ts';
import type { DictEntry } from '../../lib/dictionary/types.ts';

export interface SourceLicense {
  spdx: AllowedLicense;
  path?: string;
  textPath: string;
  sha256: string;
  attribution: string;
  scopeEvidence: string;
}
export interface HistoricalLicense extends SourceLicense {
  /** Prior content commits explicitly approved with this exact notice. */
  revisions: string[];
}

export interface Source {
  id: string;
  repository: string;
  path: string;
  adapter: 'json' | 'typescript-literal' | 'html-articles';
  domain: Domain;
  limit: number;
  fields?: { term: string; definition: string; aka?: string };
  mapping?: { term: string; definition: string; aka?: string };
  license: SourceLicense;
  licenseHistory?: HistoricalLicense[];
  enabled?: boolean;
  context?: { jurisdiction?: string; asOf?: string };
  authority?: string;
}
export interface Candidate {
  source: Source; revision: string; term: string; definition: string; aka: string[];
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const entryId = (domain: string, term: string) => digest(`${domain}:${normalizeTerm(term)}`);

function record(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const safePath = (s: unknown): s is string => typeof s === 'string' && /^[\w./-]+$/.test(s) && !s.startsWith('/') && !s.split('/').includes('..');
function validLicense(value: unknown): value is SourceLicense {
  return record(value) && ALLOWED_LICENSES.includes(value.spdx)
    && safePath(value.textPath) && (value.path === undefined || safePath(value.path))
    && typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256)
    && typeof value.attribution === 'string' && Boolean(value.attribution.trim())
    && typeof value.scopeEvidence === 'string' && value.scopeEvidence.trim().length >= 20;
}
function validHistoricalLicense(value: unknown): value is HistoricalLicense {
  return record(value) && Array.isArray(value.revisions) && value.revisions.length >= 1 && value.revisions.length <= 3000
    && value.revisions.every((revision: unknown) => typeof revision === 'string' && /^[a-f0-9]{40}$/.test(revision))
    && new Set(value.revisions).size === value.revisions.length && validLicense(value);
}
export function validateCatalog(value: unknown): asserts value is Source[] {
  if (!Array.isArray(value) || value.length > 50) throw new Error('Invalid source catalog');
  const ids = new Set<string>();
  for (const s of value) {
    if (!record(s) || !/^[a-z][a-z0-9-]{1,60}$/.test(s.id) || ids.has(s.id)
      || !/^[\w.-]+\/[\w.-]+$/.test(s.repository) || !safePath(s.path)
      || !['json', 'typescript-literal', 'html-articles'].includes(s.adapter)
      || !DOMAINS.includes(s.domain) || !Number.isInteger(s.limit) || s.limit < 1 || s.limit > 100
      || !validLicense(s.license)) {
      throw new Error(`Invalid catalog entry or unapproved content license: ${s?.id ?? 'unknown'}`);
    }
    if (s.licenseHistory !== undefined && (!Array.isArray(s.licenseHistory) || s.licenseHistory.length > 100
      || s.licenseHistory.some((historical: unknown) => !validHistoricalLicense(historical)))) {
      throw new Error(`Invalid approved license history or revisions: ${s.id}`);
    }
    const fields = s.fields ?? s.mapping;
    if (fields && (!record(fields) || !['term', 'definition'].every(k => typeof fields[k] === 'string' && /^[\w]+$/.test(fields[k])))) throw new Error('Invalid source fields');
    if (s.domain === 'medical' && (typeof s.authority !== 'string' || s.authority.length < 20)) throw new Error('Medical source needs documented authority');
    if (s.domain === 'legal' && (!s.context?.jurisdiction || !/^\d{4}-\d{2}-\d{2}$/.test(s.context?.asOf ?? ''))) throw new Error('Legal source needs jurisdiction/date');
    ids.add(s.id);
  }
}

export function checkLicense(source: Source, text: string): void {
  if (!ALLOWED_LICENSES.includes(source.license.spdx) || digest(text) !== source.license.sha256) {
    throw new Error(`Content license changed or not allowed: ${source.id}`);
  }
}

function stringLiteral(node: ts.Node): string | undefined {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined;
}

function literalObjects(text: string): Record<string, unknown>[] {
  const file = ts.createSourceFile('untrusted-source.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const objects: Record<string, unknown>[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const item: Record<string, unknown> = {};
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = ts.isIdentifier(prop.name) ? prop.name.text : stringLiteral(prop.name);
        if (!key) continue;
        const val = stringLiteral(prop.initializer);
        if (val !== undefined) item[key] = val;
        else if (ts.isArrayLiteralExpression(prop.initializer)) item[key] = prop.initializer.elements.map(stringLiteral).filter(v => v !== undefined);
      }
      objects.push(item);
    }
  };
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement) || !statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === 'definitions' && declaration.initializer && ts.isArrayLiteralExpression(declaration.initializer)) {
        for (const element of declaration.initializer.elements) visit(element);
      }
    }
  }
  return objects;
}

const textOnly = (html: string) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

export function parseSource(source: Source, content: string): Array<Omit<Candidate, 'source' | 'revision'>> {
  if (Buffer.byteLength(content) > 3_000_000) throw new Error('Source too large');
  const fields = source.fields ?? source.mapping ?? { term: 'term', definition: 'definition', aka: 'aliases' };
  let rows: unknown[];
  if (source.adapter === 'json') {
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) throw new Error('Source must contain an array');
    rows = parsed;
  } else if (source.adapter === 'typescript-literal') rows = literalObjects(content);
  else {
    rows = [...content.matchAll(/<article\b[^>]*\bid=["'][a-zA-Z0-9_-]+["'][^>]*>([\s\S]*?)<\/article>/gi)].map(m => {
      const term = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(m[1]);
      const paragraph = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(m[1]);
      return { [fields.term]: term ? textOnly(term[1].replace(/<a\b[^>]*class=["']anchor["'][^>]*>[\s\S]*?<\/a>/gi, '')).replace(/\s*¶\s*$/, '') : '', [fields.definition]: paragraph ? textOnly(paragraph[1]) : '' };
    });
  }
  const output = rows.filter(record).filter(row => typeof row[fields.term] === 'string' && typeof row[fields.definition] === 'string').map(row => ({
    term: (row[fields.term] as string).normalize('NFKC').trim(),
    definition: (row[fields.definition] as string).trim(),
    aka: fields.aka && Array.isArray(row[fields.aka]) ? row[fields.aka].filter((a: unknown): a is string => typeof a === 'string').map((a: string) => a.trim()) : [],
  })).filter(row => row.term && row.definition);
  if (!output.length) throw new Error(`Parser produced no entries: ${source.id}`);
  return output;
}

export function sourceSafety(candidate: Candidate): string | null {
  const s = `${candidate.term} ${candidate.definition}`;
  if (candidate.term.length < 2 || candidate.term.length > 100 || candidate.definition.length < 20 || candidate.definition.length > 2000) return 'field-length';
  if (/[<>\u0000-\u0008]/.test(s) || /ignore (?:all |previous )?instructions|system prompt|忽略.*指令|提示词|作为.*模型/i.test(s)) return 'instructions-or-markup';
  if (/\b\d+(?:\.\d+)?\s*(?:mg|ml)\b|\d+\s*(?:毫克|毫升)|保证收益|稳赚|guaranteed (?:return|profit)|twice daily|服用.*药/i.test(s)) return 'actionable-high-risk';
  if (candidate.source.domain === 'medical' && !candidate.source.authority) return 'unapproved-medical-authority';
  if (candidate.source.domain === 'legal' && (!candidate.source.context?.jurisdiction || !candidate.source.context?.asOf)) return 'missing-legal-context';
  return null;
}

export function chooseCandidates(candidates: Candidate[], builtins: Array<Pick<DictEntry, 'term' | 'aka'>>, limit: number) {
  const used = new Set(builtins.flatMap(e => [e.term, ...(e.aka ?? [])]).map(normalizeTerm));
  const accepted: Candidate[] = [];
  const rejected: Array<{ term: string; sourceId: string; reason: string }> = [];
  for (const candidate of [...candidates].sort((a, b) => `${a.source.id}:${normalizeTerm(a.term)}`.localeCompare(`${b.source.id}:${normalizeTerm(b.term)}`, 'en'))) {
    const keys = [candidate.term, ...candidate.aka].map(normalizeTerm);
    const reason = sourceSafety(candidate) ?? (keys.some(key => used.has(key)) ? 'duplicate-term-or-alias' : accepted.length >= limit ? 'run-budget' : null);
    if (reason) rejected.push({ term: candidate.term, sourceId: candidate.source.id, reason });
    else { accepted.push(candidate); keys.forEach(key => used.add(key)); }
  }
  return { accepted, rejected };
}

export interface Review { faithful: boolean; plainLanguage: boolean; domainCorrect: boolean; safe: boolean; reason: string }
export function checkReview(value: unknown): asserts value is Review {
  if (!record(value) || !['faithful', 'plainLanguage', 'domainCorrect', 'safe'].every(k => value[k] === true)
    || typeof value.reason !== 'string' || value.reason.trim().length < 8 || value.reason.length > 500) throw new Error('Independent semantic review rejected the entry');
}

export function createEntry(candidate: Candidate, rewrite: unknown, review: unknown,
  run: { generator: string; reviewer: string; now: string }): RemoteEntry & { quality: ModelQuality } {
  checkReview(review);
  if (!record(rewrite) || Object.keys(rewrite).some(key => !['plain', 'analogy', 'example'].includes(key))) throw new Error('Invalid translation fields');
  if (sourceSafety(candidate)) throw new Error('Unsafe source candidate');
  const { source, revision, term, definition, aka } = candidate;
  const entry = {
    id: entryId(source.domain, term), term, category: source.domain,
    plain: rewrite.plain, ...(rewrite.analogy ? { analogy: rewrite.analogy } : {}), ...(rewrite.example ? { example: rewrite.example } : {}),
    ...(aka.length ? { aka } : {}),
    source: { id: source.id, url: `https://github.com/${source.repository}/blob/${revision}/${source.path}`,
      revision, license: source.license.spdx, licenseUrl: `https://github.com/${source.repository}/blob/${revision}/${source.license.path ?? 'LICENSE'}`,
      licenseSha256: source.license.sha256, attribution: source.license.attribution, definition },
    quality: { generator: run.generator, reviewer: run.reviewer, promptVersion: '1', reviewedAt: run.now, reason: review.reason,
      checks: { faithful: true, plainLanguage: true, domainCorrect: true, safe: true } },
    ...(source.context ? { context: source.context } : {}),
  };
  validateRemoteEntry(entry);
  return entry as RemoteEntry & { quality: ModelQuality };
}

/** Copy only already-Chinese definitions. No translation, model call or semantic approval is implied. */
export function createSourceEntry(candidate: Candidate, now: string): RemoteEntry & { quality: SourceQuality } {
  const reason = sourceSafety(candidate);
  if (reason) throw new Error(`Unsafe source candidate: ${reason}`);
  const { source, revision, term, definition, aka } = candidate;
  const entry = {
    id: entryId(source.domain, term), term, category: source.domain, plain: definition,
    ...(aka.length ? { aka } : {}),
    source: { id: source.id, url: `https://github.com/${source.repository}/blob/${revision}/${source.path}`,
      revision, license: source.license.spdx, licenseUrl: `https://github.com/${source.repository}/blob/${revision}/${source.license.path ?? 'LICENSE'}`,
      licenseSha256: source.license.sha256, attribution: source.license.attribution, definition },
    quality: { method: 'source-copy', checkedAt: now, checks: { chinese: true, verbatim: true, safe: true } },
    ...(source.context ? { context: source.context } : {}),
  };
  validateRemoteEntry(entry);
  return entry as RemoteEntry & { quality: SourceQuality };
}
