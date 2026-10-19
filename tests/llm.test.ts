import test from 'node:test';
import assert from 'node:assert/strict';
import { readModelConfig, requestJson } from '../scripts/dictionary/llm.ts';

const env = { DICTIONARY_API_KEY: 'test-not-a-secret', DICTIONARY_GENERATOR_MODEL: 'generate-test', DICTIONARY_REVIEWER_MODEL: 'review-test' };
test('live model calls require explicit secret, distinct model names and safe endpoint', () => {
  assert.throws(() => readModelConfig({}), /DICTIONARY/);
  assert.throws(() => readModelConfig({ ...env, DICTIONARY_REVIEWER_MODEL: env.DICTIONARY_GENERATOR_MODEL }), /independent|distinct/);
  assert.throws(() => readModelConfig({ ...env, DICTIONARY_API_BASE: 'http://localhost/v1' }), /HTTPS/);
  assert.equal(readModelConfig(env).wire, 'responses');
});

test('Responses requests disable storage, keep untrusted payload in input, and parse message output', async () => {
  const config = readModelConfig(env);
  const result = await requestJson(config, config.generator, 'Return JSON only.', { term: 'test' }, async (url, init) => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false); assert.equal(body.instructions, 'Return JSON only.');
    assert.equal(JSON.parse(body.input).term, 'test');
    assert.equal(init?.redirect, 'error');
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"plain":"测试解释"}' }] }] }));
  });
  assert.deepEqual(result, { plain: '测试解释' });
});

test('chat compatibility requires completed JSON and refuses incomplete or failed model output', async () => {
  const config = readModelConfig({ ...env, DICTIONARY_WIRE_API: 'chat' });
  const ok = await requestJson(config, config.generator, 'Return JSON', {}, async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"safe":true}' } }] })));
  assert.deepEqual(ok, { safe: true });
  await assert.rejects(requestJson(config, config.generator, 'JSON', {}, async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }))));
  await assert.rejects(requestJson(readModelConfig(env), 'generate-test', 'JSON', {}, async () => new Response(JSON.stringify({ status: 'incomplete', output: [] }))));
  await assert.rejects(requestJson(config, 'generate-test', 'JSON', {}, async () => new Response('secret-provider-detail', { status: 401 })), error => !String(error).includes('secret-provider-detail'));
});
