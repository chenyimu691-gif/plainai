import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

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
