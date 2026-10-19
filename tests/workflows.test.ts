import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const { load } = createRequire(import.meta.url)('js-yaml');
const names = ['dictionary-checks', 'dictionary-weekly', 'dictionary-publish'];

function workflow(name: string): any {
  const path = new URL(`../.github/workflows/${name}.yml`, import.meta.url);
  assert.ok(existsSync(path), `${name} workflow must exist`);
  return load(readFileSync(path, 'utf8'));
}

test('untrusted PR validation cannot access secrets or write to the repository', () => {
  const config = workflow('dictionary-checks');
  assert.ok(Object.hasOwn(config.on, 'pull_request'));
  assert.deepEqual(config.permissions, { contents: 'read' });
  assert.doesNotMatch(JSON.stringify(config), /secrets\.|pull_request_target|workflow_run/);
  for (const job of Object.values(config.jobs) as any[]) {
    assert.equal(job.permissions, undefined);
    assert.ok(job.steps.some((step: any) => step.run === 'npm test'));
    assert.ok(job.steps.some((step: any) => step.run === 'npm run dictionary:verify'));
  }
});

test('weekly generation creates an allowlisted data PR only after validation', () => {
  const config = workflow('dictionary-weekly');
  assert.equal(config.on.schedule[0].cron, '0 2 * * 1');
  const job = config.jobs.update;
  assert.match(job.if, /github\.ref/);
  assert.match(job.if, /default_branch/);
  const prIndex = job.steps.findIndex((step: any) => step.uses?.startsWith('peter-evans/create-pull-request@'));
  assert.ok(prIndex > 0);
  const pr = job.steps[prIndex];
  assert.deepEqual(pr.with['add-paths'].trim().split(/\s+/), [
    'data/dictionary/entries.json',
    'data/dictionary/discovered.json',
    'data/dictionary/quarantine.json',
    'public/dictionary/',
  ]);
  for (const command of ['npm run dictionary:update', 'npm test', 'npm run dictionary:verify', 'npm run compile', 'npm run build', 'node scripts/verify.cjs']) {
    assert.ok(job.steps.slice(0, prIndex).some((step: any) => step.run === command), `${command} must pass before creating the PR`);
  }
  assert.doesNotMatch(JSON.stringify(job), /git push|--admin/);
  const autoMerge = job.steps.find((step: any) => step.run?.includes('gh pr merge'));
  assert.match(autoMerge.if, /DICTIONARY_AUTO_MERGE/);
  assert.match(autoMerge.if, /HAS_DICTIONARY_BOT_TOKEN/);
  const guardIndex = job.steps.findIndex((step: any) => step.id === 'merge_guard');
  assert.ok(guardIndex > prIndex && guardIndex < job.steps.indexOf(autoMerge));
  const guard = job.steps[guardIndex];
  assert.match(guard.run, /scripts\/dictionary\/merge-guard\.ts/);
  assert.match(guard.if, /DICTIONARY_AUTO_MERGE/);
  assert.match(guard.if, /HAS_DICTIONARY_BOT_TOKEN/);
  assert.equal(guard.env.BASE_BRANCH, '${{ github.event.repository.default_branch }}');
  assert.match(autoMerge.if, /steps\.merge_guard\.outputs\.eligible == 'true'/);
  assert.match(autoMerge.run, /--auto/);
});

test('publishing validates committed data and grants Pages writes only to deployment', () => {
  const config = workflow('dictionary-publish');
  assert.deepEqual(config.on.push.branches, ['main']);
  assert.deepEqual(config.permissions, { contents: 'read' });
  assert.ok(config.jobs.build.steps.some((step: any) => step.run === 'npm test'));
  assert.ok(config.jobs.build.steps.some((step: any) => step.run === 'npm run dictionary:verify'));
  assert.ok(config.jobs.build.steps.some((step: any) => step.run === 'npm run dictionary:build'));
  const upload = config.jobs.build.steps.find((step: any) => step.uses?.startsWith('actions/upload-pages-artifact@'));
  assert.equal(upload.with.path, '.dictionary-site');
  assert.deepEqual(config.jobs.deploy.needs, 'build');
  assert.deepEqual(config.jobs.deploy.permissions, { pages: 'write', 'id-token': 'write' });
  assert.equal(config.jobs.build.permissions, undefined);
});

test('all actions are immutable and checkout does not persist credentials', () => {
  for (const name of names) {
    const config = workflow(name);
    assert.equal(config.on.pull_request_target, undefined);
    for (const job of Object.values(config.jobs) as any[]) {
      for (const step of job.steps) {
        if (step.uses) assert.match(step.uses, /^[\w.-]+\/[\w.-]+@[a-f0-9]{40}$/, `${name}: mutable Action reference`);
        if (step.uses?.startsWith('actions/checkout@')) assert.equal(step.with['persist-credentials'], false);
      }
    }
  }
});
