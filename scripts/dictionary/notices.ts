import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Source } from './core.ts';

/** Package every notice from a verified catalog, including retained historical grants. */
export async function buildNotices(root: string, sources: Source[]): Promise<{
  notices: string; licenses: Array<{ name: string; text: string }>;
}> {
  const notices: string[] = [];
  const licenses = new Map<string, string>();
  for (const source of sources) {
    const versions = [{ license: source.license, name: `${source.id}.txt`, label: source.id },
      ...(source.licenseHistory ?? []).map(license => ({ license, name: `${source.id}-${license.sha256}.txt`,
        label: `${source.id} (historical; approved revisions: ${license.revisions.join(', ')})` }))];
    for (const { license, name, label } of versions) {
      // Keep the complete UTF-8 notice unchanged: no trimming or newline conversion.
      const text = await readFile(join(root, license.textPath), 'utf8');
      licenses.set(name, text);
      notices.push(`${label}\nLicense: ${license.spdx}\n${license.attribution}\nChanges: Chinese translation and plain-language adaptation by PlainAI.\n${text}`);
    }
  }
  return { notices: notices.join('\n\n---\n\n'), licenses: [...licenses].map(([name, text]) => ({ name, text })) };
}
