import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { readCatalog, collectSources, discoverSources } from './network.ts';
import { verifyRelease, writeRelease } from './releases.ts';
import { readModelConfig, simplifyAndReview } from './llm.ts';
import { buildNotices } from './notices.ts';
import { planUpdate, planSourceUpdate, parseQuarantine } from './update.ts';
import { DOMAINS } from '../../lib/dictionary/remote-schema.ts';
import type { DictEntry } from '../../lib/dictionary/types.ts';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const writeData = async (name: string, value: unknown) => {
  await mkdir(join(root, 'data/dictionary'), { recursive: true });
  await writeFile(join(root, `data/dictionary/${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
};

async function main(command: string) {
  const sources = await readCatalog(root);
  if (command === 'verify') {
    const { manifest } = await verifyRelease(root, sources);
    console.log(`Verified dictionary v${manifest.version}: ${manifest.count} entries; ${sources.length} licensed sources`);
  } else if (command === 'build') {
    const { manifest } = await verifyRelease(root, sources);
    const site = join(root, '.dictionary-site');
    await rm(site, { recursive: true, force: true });
    await cp(join(root, 'public/dictionary'), join(site, 'dictionary'), { recursive: true });
    const { notices, licenses } = await buildNotices(root, sources);
    await mkdir(join(site, 'dictionary/licenses'), { recursive: true });
    for (const license of licenses) {
      await writeFile(join(site, 'dictionary/licenses', license.name), license.text);
    }
    await writeFile(join(site, 'dictionary/THIRD_PARTY_NOTICES.txt'), notices);
    await writeFile(join(site, '.nojekyll'), '');
    await writeFile(join(site, 'index.html'), `<!doctype html><meta charset="utf-8"><title>PlainAI 词库更新</title><h1>PlainAI 词库更新服务</h1><p>版本 ${manifest.version}，在线词条 ${manifest.count} 条。</p><p>词条保留来源及各自许可证，逐条记录原文采集或模型改写方式；已有内置词库的 CC BY-NC 条件继续适用。</p><p><a href="dictionary/manifest.json">版本信息</a> · <a href="dictionary/THIRD_PARTY_NOTICES.txt">完整来源与许可声明</a></p>`);
    console.log(`Staged verified Pages dictionary v${manifest.version}`);
  } else if (command === 'discover') {
    const candidates = await discoverSources({ token: process.env.GITHUB_TOKEN });
    await writeData('discovered', { domains: DOMAINS, candidates });
    console.log(`Found ${candidates.length} unapproved source candidates across ${DOMAINS.length} configured domains`);
  } else if (command === 'probe') {
    const candidates = await collectSources(sources, { token: process.env.GITHUB_TOKEN });
    const counts = Object.fromEntries(sources.map(s => [s.id, candidates.filter(c => c.source.id === s.id).length]));
    console.log(JSON.stringify({ licenseAndCollection: 'passed', counts }));
  } else if (command === 'update') {
    const mode = process.env.DICTIONARY_MODE?.trim() || 'source-copy';
    if (mode !== 'source-copy' && mode !== 'ai') throw new Error('DICTIONARY_MODE must be source-copy or ai');
    const config = mode === 'ai' ? readModelConfig() : null;
    const previous = await verifyRelease(root, sources);
    let priorQuarantine = { items: [] } as unknown;
    try { priorQuarantine = JSON.parse(await readFile(join(root, 'data/dictionary/quarantine.json'), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const previousQuarantine = parseQuarantine(priorQuarantine);
    const builtin: DictEntry[] = JSON.parse(await readFile(join(root, 'public/dict.json'), 'utf8'));
    const discovered = await discoverSources({ token: process.env.GITHUB_TOKEN });
    const candidates = await collectSources(sources, { token: process.env.GITHUB_TOKEN });
    const now = new Date().toISOString();
    const result = config ? await planUpdate({ candidates, builtin, previous: previous.snapshot.entries, previousQuarantine,
      run: { generator: config.generator, reviewer: config.reviewer, now }, simplify: c => simplifyAndReview(c, config) })
      : planSourceUpdate({ candidates, builtin, previous: previous.snapshot.entries, now });
    const release = await writeRelease(root, result.entries, now);
    await verifyRelease(root, sources);
    await writeData('discovered', { domains: DOMAINS, candidates: discovered });
    await writeData('quarantine', { items: result.quarantine });
    console.log(JSON.stringify({ mode, changed: release.changed, version: release.manifest.version,
      entries: result.entries.length, quarantined: result.quarantine.length, modelPairs: result.calls }));
  } else throw new Error('Usage: dictionary CLI <verify|build|discover|probe|update>');
}

main(process.argv[2] ?? '').catch(error => {
  console.error(`[dictionary] ${error instanceof Error ? error.message : 'operation failed'}`);
  process.exitCode = 1;
});
