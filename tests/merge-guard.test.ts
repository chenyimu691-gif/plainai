import assert from 'node:assert/strict';
import test from 'node:test';
import { checkMergeProtection, protectionAllowsAutoMerge } from '../scripts/dictionary/merge-guard.ts';

const check = 'Dictionary quality and extension build';
function protection(): any {
  return {
    required_status_checks: { strict: true, contexts: [check], checks: [{ context: check, app_id: 15368 }] },
    enforce_admins: { enabled: true },
    required_pull_request_reviews: {
      required_approving_review_count: 1,
      dismiss_stale_reviews: true,
      bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
    },
  };
}

test('auto-merge requires effective classic protection and independently enforced quality checks', () => {
  assert.equal(protectionAllowsAutoMerge(protection()), true);
  const automated = protection();
  automated.required_pull_request_reviews.required_approving_review_count = 0;
  automated.required_pull_request_reviews.dismiss_stale_reviews = false;
  assert.equal(protectionAllowsAutoMerge(automated), true, 'required PRs and strict CI may permit automatic publication without human approval');
  const unsafe = [null, {}, { ...protection(), required_status_checks: null },
    { ...protection(), enforce_admins: { enabled: false } },
    { ...protection(), required_pull_request_reviews: null }];
  for (const mutation of [
    (p: any) => { p.required_status_checks.strict = false; },
    (p: any) => { p.required_status_checks.contexts = ['unrelated check']; p.required_status_checks.checks = []; },
    (p: any) => { p.required_pull_request_reviews.required_approving_review_count = -1; },
    (p: any) => { p.required_pull_request_reviews.required_approving_review_count = 0.5; },
    (p: any) => { p.required_pull_request_reviews.dismiss_stale_reviews = false; },
    (p: any) => { delete p.required_pull_request_reviews.bypass_pull_request_allowances; },
    (p: any) => { p.required_pull_request_reviews.bypass_pull_request_allowances.users = [{ login: 'bot' }]; },
    (p: any) => { p.required_pull_request_reviews.bypass_pull_request_allowances.teams = [{ slug: 'maintainers' }]; },
    (p: any) => { p.required_pull_request_reviews.bypass_pull_request_allowances.apps = [{ slug: 'bot' }]; },
  ]) {
    const changed = protection();
    mutation(changed);
    unsafe.push(changed);
  }
  for (const config of unsafe) assert.equal(protectionAllowsAutoMerge(config), false, JSON.stringify(config));
});

test('protection preflight reads only the fixed GitHub API and encodes branch names', async () => {
  let url = '';
  let options: RequestInit | undefined;
  const result = await checkMergeProtection({ repository: 'owner/repo', branch: 'release/main', token: 'private-token',
    fetch: async (input, init) => { url = String(input); options = init; return Response.json(protection()); },
  });
  assert.equal(result.eligible, true);
  assert.equal(url, 'https://api.github.com/repos/owner/repo/branches/release%2Fmain/protection');
  assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer private-token');
  assert.equal(options?.redirect, 'error');
  assert.ok(options?.signal);
});

test('missing, unreadable and malformed protection prevents merging without exposing provider errors', async () => {
  const config = { repository: 'owner/repo', branch: 'main', token: 'private-token' };
  for (const status of [401, 403, 404, 429, 500]) {
    const result = await checkMergeProtection({ ...config, fetch: async () => new Response('sensitive body', { status }) });
    assert.equal(result.eligible, false, String(status));
    assert.doesNotMatch(result.reason, /sensitive|private-token/);
  }
  for (const fetch of [
    async () => { throw new Error('private-token'); },
    async () => new Response('not json'),
    async () => Response.json({}),
  ]) {
    const result = await checkMergeProtection({ ...config, fetch });
    assert.equal(result.eligible, false);
    assert.doesNotMatch(result.reason, /sensitive|private-token/);
  }
  let fetched = false;
  for (const invalid of [{ repository: 'owner/repo/../secrets' }, { repository: 'https://evil.test/repo' }, { branch: '' }, { token: '' }]) {
    assert.equal((await checkMergeProtection({ ...config, ...invalid, fetch: async () => {
      fetched = true;
      return Response.json(protection());
    } })).eligible, false);
  }
  assert.equal(fetched, false);
});
