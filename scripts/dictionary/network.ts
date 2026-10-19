/** Network boundary for approved glossary collection and untrusted discovery. */
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { DOMAINS } from '../../lib/dictionary/remote-schema.ts';
import type { Domain } from '../../lib/dictionary/remote-schema.ts';
import { checkLicense, parseSource, validateCatalog } from './core.ts';
import type { Candidate, Source } from './core.ts';

const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 30_000;
const COMMIT = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[\w.-]+\/[\w.-]+$/;
const PATH = /^[\w./-]+$/;
type NetworkSource = Source & { enabled?: boolean; license: Source['license'] & { path?: string } };
type NetworkOptions = { token?: string; fetch?: typeof fetch };
export interface DiscoveryCandidate {
  domain: Domain;
  repository: string;
  url: string;
  /** Search metadata only. This is not an approved content license. */
  licenseHint: string;
  description: string;
}

function httpsUrl(input: string): URL {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) {
    throw new Error('Requests require HTTPS without credentials, fragments or nonstandard ports');
  }
  return url;
}

/** Bounded UTF-8 download. Redirects are errors so credentials cannot follow one. */
export async function fetchText(input: string, options: {
  maxBytes?: number; fetch?: typeof fetch; headers?: HeadersInit;
} = {}): Promise<string> {
  const url = httpsUrl(input);
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BYTES) throw new Error('Invalid response byte limit');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Request timeout')), TIMEOUT_MS);
  try {
    const response = await (options.fetch ?? globalThis.fetch)(url.href, {
      headers: options.headers, redirect: 'error', signal: controller.signal,
    });
    if (!response.ok || response.redirected) {
      await response.body?.cancel();
      throw new Error(`Download failed: HTTP ${response.status}`);
    }
    const advertised = response.headers.get('content-length');
    if (advertised && /^\d+$/.test(advertised) && Number(advertised) > maxBytes) {
      await response.body?.cancel();
      throw new Error('Response too large');
    }
    if (!response.body) return '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0;
    let output = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (controller.signal.aborted) throw new Error('Request timeout');
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) throw new Error('Response too large');
        output += decoder.decode(value, { stream: true });
      }
      return output + decoder.decode();
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    } finally { reader.releaseLock(); }
  } finally { clearTimeout(timer); }
}

function githubHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) {
    if (/\s|[\u0000-\u001f\u007f]/.test(token)) throw new Error('Invalid GitHub token format');
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function safePath(value: string): boolean {
  return PATH.test(value) && !value.startsWith('/') && !value.split('/').some(p => p === '..' || p === '.');
}
function safeRepository(value: string): boolean {
  return REPOSITORY.test(value) && value.split('/').every(p => p !== '.' && p !== '..');
}
function licensePath(source: NetworkSource): string {
  const path = source.license.path ?? 'LICENSE';
  if (typeof path !== 'string' || !safePath(path)) throw new Error(`Unsafe upstream license path: ${source.id}`);
  return path;
}

async function localText(root: string, path: string): Promise<string> {
  const file = await realpath(resolve(root, path));
  const fromRoot = relative(root, file);
  if (fromRoot === '..' || fromRoot.startsWith('../') || isAbsolute(fromRoot)) throw new Error('Catalog and license notices must remain inside the checkout');
  if ((await stat(file)).size > MAX_BYTES) throw new Error('Local source metadata too large');
  const text = await readFile(file, 'utf8');
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('Local source metadata too large');
  return text;
}

/** Fail closed if a local notice is missing, edited or escapes the checkout. */
export async function readCatalog(root: string): Promise<Source[]> {
  const realRoot = await realpath(root);
  const catalog = await localText(realRoot, 'data/dictionary/sources.json');
  const parsed: unknown = JSON.parse(catalog);
  let sources: unknown;
  if (Array.isArray(parsed)) sources = parsed;
  else if (parsed && typeof parsed === 'object' && 'version' in parsed && parsed.version === 1 && 'sources' in parsed) sources = parsed.sources;
  else throw new Error('Invalid source catalog envelope');
  validateCatalog(sources);
  for (const source of sources as NetworkSource[]) {
    if (!safeRepository(source.repository) || !safePath(source.path)
      || (source.enabled !== undefined && typeof source.enabled !== 'boolean')) throw new Error(`Invalid source location: ${source.id}`);
    for (const license of [source.license, ...(source.licenseHistory ?? [])]) {
      licensePath({ ...source, license });
      const notice = await localText(realRoot, license.textPath);
      checkLicense({ ...source, license }, notice);
    }
  }
  return sources;
}

/** Collect complete approved sources; generation limits are applied later. */
export async function collectSources(sources: Source[], options: NetworkOptions = {}): Promise<Candidate[]> {
  validateCatalog(sources);
  const result: Candidate[] = [];
  for (const source of sources as NetworkSource[]) {
    if (source.enabled === false) continue;
    if (!safeRepository(source.repository) || !safePath(source.path)) throw new Error(`Invalid source location: ${source.id}`);
    const path = licensePath(source);
    try {
      const commits: unknown = JSON.parse(await fetchText(`https://api.github.com/repos/${source.repository}/commits?per_page=1`, {
        fetch: options.fetch, headers: githubHeaders(options.token),
      }));
      const revision = Array.isArray(commits) && commits[0] && typeof commits[0] === 'object' ? commits[0].sha : undefined;
      if (typeof revision !== 'string' || !COMMIT.test(revision)) throw new Error('GitHub did not return an immutable commit');
      const prefix = `https://raw.githubusercontent.com/${source.repository}/${revision}/`;
      // The GitHub token is deliberately used only above, never on raw URLs.
      const notice = await fetchText(prefix + path, { fetch: options.fetch });
      checkLicense(source, notice);
      const content = await fetchText(prefix + source.path, { fetch: options.fetch });
      result.push(...parseSource(source, content).map(row => ({ ...row, source, revision })));
    } catch (error) {
      throw new Error(`Collection failed for ${source.id}: ${error instanceof Error ? error.message : 'unknown error'}`, { cause: error });
    }
  }
  return result;
}

/** Eight bounded, sequential search requests; results never become approved sources. */
export async function discoverSources(options: NetworkOptions = {}): Promise<DiscoveryCandidate[]> {
  const found: DiscoveryCandidate[] = [];
  for (const domain of DOMAINS) {
    const url = new URL('https://api.github.com/search/repositories');
    url.searchParams.set('q', `${domain} glossary in:name,description archived:false`);
    url.searchParams.set('per_page', '5');
    url.searchParams.set('sort', 'stars');
    url.searchParams.set('order', 'desc');
    const data: unknown = JSON.parse(await fetchText(url.href, { fetch: options.fetch, headers: githubHeaders(options.token) }));
    if (!data || typeof data !== 'object' || !('items' in data) || !Array.isArray(data.items)) throw new Error(`Invalid discovery response for ${domain}`);
    for (const item of data.items.slice(0, 5)) {
      if (!item || typeof item !== 'object' || typeof item.full_name !== 'string' || !safeRepository(item.full_name)) continue;
      const hint = item.license && typeof item.license === 'object' ? item.license.spdx_id : undefined;
      found.push({ domain, repository: item.full_name, url: `https://github.com/${item.full_name}`,
        licenseHint: typeof hint === 'string' && /^[A-Za-z0-9.+-]{1,80}$/.test(hint) ? hint : 'NOASSERTION',
        description: typeof item.description === 'string' ? item.description.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 500).trim() : '',
      });
    }
  }
  return found;
}
