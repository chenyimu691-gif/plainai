import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const REQUIRED_CHECK = 'Dictionary quality and extension build';
const NOT_CONFIGURED = 'Auto-merge skipped: verify classic branch protection with required CI, zero required human approvals and no bypass allowances. The data PR remains unpublished.';
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : undefined;

/** An unknown or partial protection response must never authorize a merge. */
export function protectionAllowsAutoMerge(value: unknown): boolean {
  const protection = object(value);
  const checks = object(protection?.required_status_checks);
  const reviews = object(protection?.required_pull_request_reviews);
  const bypass = object(reviews?.bypass_pull_request_allowances);
  const requiredCheck = Array.isArray(checks?.contexts) && checks.contexts.includes(REQUIRED_CHECK)
    || Array.isArray(checks?.checks) && checks.checks.some(check => object(check)?.context === REQUIRED_CHECK);
  return Boolean(
    checks?.strict === true && requiredCheck
    && object(protection?.enforce_admins)?.enabled === true
    && reviews?.required_approving_review_count === 0
    && bypass && ['users', 'teams', 'apps'].every(key => Array.isArray(bypass[key]) && bypass[key].length === 0)
  );
}

export async function checkMergeProtection(config: {
  repository: string;
  branch: string;
  token: string;
  fetch?: typeof globalThis.fetch;
}): Promise<{ eligible: boolean; reason: string }> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(config.repository) || !config.branch.trim() || !config.token.trim()) {
    return { eligible: false, reason: NOT_CONFIGURED };
  }
  try {
    const response = await (config.fetch ?? globalThis.fetch)(
      `https://api.github.com/repos/${config.repository}/branches/${encodeURIComponent(config.branch)}/protection`,
      {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${config.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (response.status !== 200 || !protectionAllowsAutoMerge(await response.json())) {
      return { eligible: false, reason: NOT_CONFIGURED };
    }
    return { eligible: true, reason: 'Classic branch protection verified; requesting protected auto-merge.' };
  } catch {
    // Do not expose token-bearing network/provider error messages in Actions logs.
    return { eligible: false, reason: NOT_CONFIGURED };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await checkMergeProtection({
    repository: process.env.GITHUB_REPOSITORY ?? '',
    branch: process.env.BASE_BRANCH ?? '',
    token: process.env.GH_TOKEN ?? '',
  });
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `eligible=${result.eligible}\n`);
  console.log(result.reason);
}
