import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { canonicalJson, sha256 } from '../lib/dictionary/remote-schema.ts';
import { REMOTE_ALARM, REMOTE_CACHE_KEY, REMOTE_STATUS_KEY, REMOTE_BASE_URL } from '../lib/dictionary/remote-sync.ts';

const compiled = await build({ entryPoints: ['entrypoints/background.ts'], bundle: true, write: false,
  format: 'iife', platform: 'browser', globalName: 'BackgroundModule' });
const fixture = { id: 'a'.repeat(64), term: 'Procurement', category: 'business', plain: '企业为工作买东西，包括选择供应商和安排采购。',
  source: { id: 'test', url: `https://github.com/a/b/blob/${'b'.repeat(40)}/data.json`, revision: 'b'.repeat(40),
    license: 'MIT', licenseUrl: 'https://github.com/a/b/LICENSE', licenseSha256: 'c'.repeat(64), attribution: 'Test authors', definition: 'An organization obtains goods and services.' },
  quality: { generator: 'a', reviewer: 'b', promptVersion: '1', reviewedAt: '2026-10-19T00:00:00.000Z',
    reason: '解释准确且通俗，没有增加原文没有的结论。', checks: { faithful: true, plainLanguage: true, domainCorrect: true, safe: true } } };
function event() { const listeners: Array<(...args: any[]) => any> = []; return { listeners, addListener: (fn: (...args: any[]) => any) => listeners.push(fn) }; }
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'worker did not finish its asynchronous operation');
    await delay(2);
  }
}
async function worker(blockAlarm = false, seed?: unknown) {
  const snapshot = { version: 7, entries: [fixture] };
  const storage: Record<string, any> = { [REMOTE_CACHE_KEY]: { schemaVersion: 1, snapshot, sha256: await sha256(canonicalJson(snapshot)), syncedAt: new Date().toISOString() },
    [REMOTE_STATUS_KEY]: { checkedAt: new Date().toISOString() } };
  const events = { message: event(), startup: event(), installed: event(), alarm: event() };
  let release!: (value: undefined) => void;
  const gate = new Promise<undefined>(resolve => { release = resolve; });
  const created: unknown[] = []; const requests: string[] = []; let currentAlarm: object | undefined;
  const browser = { storage: { local: { get: async (key: string) => ({ [key]: storage[key] }), set: async (values: object) => Object.assign(storage, values) } },
    alarms: { get: async () => blockAlarm ? gate : currentAlarm, create: async (name: string, info: unknown) => { currentAlarm = { name }; created.push(info); }, onAlarm: events.alarm },
    runtime: { getURL: (path: string) => `chrome-extension://test${path}`, onMessage: events.message, onStartup: events.startup, onInstalled: events.installed } };
  const context: any = { defineBackground: (fn: unknown) => fn, browser, crypto: globalThis.crypto, TextEncoder, TextDecoder, URL, Error,
    AbortController, setTimeout, clearTimeout, console,
    fetch: async (url: string) => { if (url.endsWith('/dictionary-seed.json')) return Response.json(seed ?? []);
      if (url.startsWith('chrome-extension:')) return new Response(JSON.stringify([{ term: '自建术语', category: 'general', plain: '内置解释' }]));
      requests.push(url); throw new Error('offline'); } };
  runInNewContext(compiled.outputFiles[0].text, context); context.BackgroundModule.default();
  return { storage, events, created, requests, release, resetAlarm: () => { currentAlarm = undefined; }, message: (type: string) => events.message.listeners[0]({ type }) };
}

test('worker registers every lifecycle listener synchronously and recreates a missing daily alarm', async () => {
  const h = await worker(true);
  for (const value of Object.values(h.events)) assert.equal(value.listeners.length, 1);
  assert.equal(h.created.length, 0);
  h.release(undefined); await turn();
  assert.equal(h.created.length, 1); assert.equal((h.created[0] as any).periodInMinutes, 1440);
  assert.equal(h.requests.length, 0);
  h.resetAlarm(); h.events.startup.listeners[0](); await turn();
  assert.equal(h.created.length, 2);
});

test('worker serves validated old cache offline and excludes corrupt cached entries', async () => {
  const h = await worker(); await turn();
  assert.deepEqual(Array.from(await h.message('GET_DICTIONARY'), (entry: any) => entry.term), ['自建术语']);
  assert.equal((await h.message('GET_DICT_STATS')).availableTotal, 2);
  h.storage[REMOTE_CACHE_KEY].sha256 = 'f'.repeat(64);
  assert.equal((await h.message('GET_DICTIONARY')).length, 1);
});

test('worker applies multiple category choices to offline lookup and reports available counts separately', async () => {
  const h = await worker();
  h.storage.plainai_dictionary_categories = ['business'];
  assert.deepEqual(Array.from(await h.message('GET_DICTIONARY'), (entry: any) => entry.term), ['Procurement']);
  const stats = await h.message('GET_DICT_STATS');
  assert.equal(stats.total, 1);
  assert.equal(stats.byCategory.business, 1);
  assert.equal(stats.availableByCategory.general, 1);
  h.storage.plainai_dictionary_categories = ['general', 'business'];
  assert.equal((await h.message('GET_DICTIONARY')).length, 2);
  h.storage.plainai_dictionary_categories = [];
  assert.equal((await h.message('GET_DICTIONARY')).length, 0);
});

test('worker provides packaged industry terms offline and lets a newer cache remove them', async () => {
  const seed = { version: 8, entries: [{ ...fixture, id: 'd'.repeat(64), term: '交通量', category: 'science',
    plain: '单位时间内通过道路某一断面的车辆数量，用来描述交通流量。' }] };
  const h = await worker(false, seed);
  h.storage.plainai_dictionary_categories = ['science', 'business'];
  assert.deepEqual(Array.from(await h.message('GET_DICTIONARY'), (entry: any) => entry.term), ['交通量']);
  const snapshot = { version: 9, entries: [] };
  h.storage[REMOTE_CACHE_KEY] = { schemaVersion: 1, snapshot, sha256: await sha256(canonicalJson(snapshot)), syncedAt: new Date().toISOString() };
  assert.equal((await h.message('GET_DICTIONARY')).length, 0, 'online removals supersede the packaged baseline');
});

test('daily alarm respects the check interval and failed network sync retains old snapshot', async () => {
  const h = await worker(); await turn();
  h.events.alarm.listeners[0]({ name: REMOTE_ALARM }); await turn(); assert.equal(h.requests.length, 0);
  h.storage[REMOTE_STATUS_KEY].checkedAt = '2020-01-01T00:00:00.000Z';
  h.events.alarm.listeners[0]({ name: 'unrelated' }); await turn(); assert.equal(h.requests.length, 0);
  h.events.alarm.listeners[0]({ name: REMOTE_ALARM });
  // WebCrypto finishes on a native worker; two event-loop turns do not guarantee completion.
  await until(() => typeof h.storage[REMOTE_STATUS_KEY].error === 'string');
  assert.deepEqual(h.requests, [`${REMOTE_BASE_URL}manifest.json`]);
  assert.equal(h.storage[REMOTE_CACHE_KEY].snapshot.version, 7);
  assert.match(h.storage[REMOTE_STATUS_KEY].error, /offline/);
});
