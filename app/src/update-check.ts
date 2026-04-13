import chalk from 'chalk';
import { CliError } from './errors.js';

declare const __CLAUDENOMICS_VERSION__: string;

const PACKAGE = '@claudenomics/cli';
const REGISTRY = 'https://registry.npmjs.org';
const TIMEOUT_MS = 2000;

interface Packument {
  'dist-tags'?: { latest?: string };
  versions?: Record<string, { deprecated?: string }>;
}

function parseSemver(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function isNewer(latest: string, current: string): boolean {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i]! > b[i]!) return true;
    if (a[i]! < b[i]!) return false;
  }
  return false;
}

export async function runUpdateCheck(): Promise<void> {
  if (process.env.CI) return;
  if (process.env.CLAUDENOMICS_SKIP_UPDATE_CHECK === '1') return;

  const current = __CLAUDENOMICS_VERSION__;

  let data: Packument;
  try {
    const res = await fetch(`${REGISTRY}/${PACKAGE}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/vnd.npm.install-v1+json' },
    });
    if (!res.ok) return;
    data = (await res.json()) as Packument;
  } catch {
    process.stderr.write(
      chalk.yellow(
        'update check timed out — proceeding (set CLAUDENOMICS_SKIP_UPDATE_CHECK=1 to silence)\n',
      ),
    );
    return;
  }

  const currentMeta = data.versions?.[current];
  if (currentMeta?.deprecated) {
    process.stderr.write(chalk.red(`this version (${current}) is deprecated: ${currentMeta.deprecated}\n`));
    process.stderr.write(chalk.red(`update: npm install -g ${PACKAGE}\n`));
    process.stderr.write(chalk.gray('override: CLAUDENOMICS_SKIP_UPDATE_CHECK=1\n'));
    throw new CliError('refusing to run deprecated version');
  }

  const latest = data['dist-tags']?.latest;
  if (latest && isNewer(latest, current)) {
    process.stderr.write(
      chalk.yellow(`update available: ${current} → ${latest} (npm install -g ${PACKAGE})\n`),
    );
  }
}
