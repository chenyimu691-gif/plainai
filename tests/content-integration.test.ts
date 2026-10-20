import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { setImmediate as turn } from 'node:timers/promises';
import { CATEGORY_STORAGE_KEY } from '../lib/dictionary/categories.ts';

test('page listens for cache updates before its first asynchronous dictionary request finishes', async () => {
  const compiled = await build({ entryPoints: ['entrypoints/content.tsx'], bundle: true, write: false,
    format: 'iife', platform: 'browser', globalName: 'ContentModule' });
  const listeners: unknown[] = [];
  let requests = 0;
  const context: any = {
    defineContentScript: (value: unknown) => value,
    document: { head: { appendChild() {} }, createElement: () => ({}) },
    browser: {
      runtime: { sendMessage: () => { requests++; return new Promise(() => {}); } },
      storage: { onChanged: { addListener: (listener: unknown) => listeners.push(listener) } },
    },
    console,
  };
  runInNewContext(compiled.outputFiles[0].text, context);
  context.ContentModule.default.main();
  assert.equal(requests, 1);
  assert.equal(listeners.length, 1);
});

test('page refreshes selected libraries on local changes, removes old marks and respects selection in worker fallback', async () => {
  const compiled = await build({ entryPoints: ['entrypoints/content.tsx'], bundle: true, write: false,
    format: 'iife', platform: 'browser', globalName: 'ContentModule' });
  const packaged = [
    { term: '缓存', category: 'technical', plain: '经常使用的数据暂存到容易读取的位置。' },
    { term: '采购', category: 'business', plain: '企业选择供应商并为工作购买需要的物品。' },
  ];
  const listeners: Array<(changes: object, area: string) => void> = [];
  const counts: number[] = [];
  const removed: string[] = [];
  let selected = ['business'];
  let requests = 0;
  let normalizeCount = 0;
  const context: any = {
    defineContentScript: (value: unknown) => value,
    document: {
      head: { appendChild() {} }, createElement: () => ({}), createTextNode: (text: string) => text,
      querySelectorAll: () => [{ textContent: '旧标记', parentElement: { normalize: () => { normalizeCount++; } }, replaceWith: (text: string) => removed.push(text) }],
      querySelector: () => null, createTreeWalker: () => ({ nextNode: () => false }), body: {}, readyState: 'complete',
    },
    NodeFilter: { SHOW_TEXT: 4 }, MutationObserver: class { observe() {} },
    browser: {
      runtime: { sendMessage: async () => { requests++; throw new Error('worker unavailable'); }, getURL: (path: string) => `chrome-extension://test${path}` },
      storage: { local: { get: async () => ({ [CATEGORY_STORAGE_KEY]: selected }) }, onChanged: { addListener: (listener: typeof listeners[number]) => listeners.push(listener) } },
    },
    fetch: async () => Response.json(packaged), setTimeout, clearTimeout,
    console: { log: (message: string, count: number) => { if (message.includes('降维翻译器已加载')) counts.push(count); }, error: assert.fail, warn: assert.fail },
  };
  runInNewContext(compiled.outputFiles[0].text, context);
  context.ContentModule.default.main(); await turn();
  assert.deepEqual(counts, [1], 'fallback uses the selected industry, not the whole packaged library');
  listeners[0]({ [CATEGORY_STORAGE_KEY]: {} }, 'sync'); await turn();
  assert.equal(requests, 1, 'other storage areas do not alter the local selection');
  selected = [];
  listeners[0]({ [CATEGORY_STORAGE_KEY]: {} }, 'local'); await turn();
  assert.deepEqual(counts, [1, 0]);
  selected = ['technical', 'business'];
  listeners[0]({ plainai_remote_dictionary_v1: {} }, 'local'); await turn();
  assert.deepEqual(counts, [1, 0, 2]);
  assert.deepEqual(removed, ['旧标记', '旧标记', '旧标记']);
  assert.equal(normalizeCount, 3, 'old annotation fragments are joined before rescanning');
});
