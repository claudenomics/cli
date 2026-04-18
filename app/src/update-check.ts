import { CliError } from './errors.js';
import { styles } from './styles.js';
import { text } from './text.js';

declare const __CLAUDENOMICS_VERSION__: string;

const PACKAGE = '@claudenomics/cli';
const REGISTRY = 'https://registry.npmjs.org';
const TIMEOUT_MS = 2000;
const INSTALL_CMD = `npm install -g ${PACKAGE}@latest`;

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

async function fetchPackument(): Promise<Packument | null> {
  try {
    const res = await fetch(`${REGISTRY}/${PACKAGE}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/vnd.npm.install-v1+json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as Packument;
  } catch {
    return null;
  }
}

export async function runUpdateCheck(): Promise<void> {
  if (process.env.CI) return;
  if (process.env.CLAUDENOMICS_SKIP_UPDATE_CHECK === '1') return;

  const current = __CLAUDENOMICS_VERSION__;
  const data = await fetchPackument();
  if (!data) {
    process.stderr.write(styles.warn(`${text.update.timeout}\n`));
    return;
  }

  const currentMeta = data.versions?.[current];
  if (currentMeta?.deprecated) {
    process.stderr.write(
      styles.error(`${text.update.deprecated(current, currentMeta.deprecated)}\n`),
    );
    process.stderr.write(styles.error(`${text.update.updateHint(INSTALL_CMD)}\n`));
    process.stderr.write(styles.muted(`${text.update.override}\n`));
    throw new CliError(text.update.refusing);
  }

  const latest = data['dist-tags']?.latest;
  if (latest && isNewer(latest, current)) {
    process.stderr.write(
      styles.warn(`${text.update.updateAvailable(current, latest, INSTALL_CMD)}\n`),
    );
  }
}

export async function runUpdate(): Promise<void> {
  const current = __CLAUDENOMICS_VERSION__;
  const data = await fetchPackument();
  if (!data) {
    throw new CliError(text.update.unreachable);
  }
  const latest = data['dist-tags']?.latest;
  if (!latest) throw new CliError(text.update.noLatest);

  process.stdout.write(`${text.update.currentLatest(current, latest)}\n`);
  if (isNewer(latest, current)) {
    process.stdout.write(`\n${text.update.runHint(styles.cmd(INSTALL_CMD))}\n`);
  } else {
    process.stdout.write(`${styles.check} ${text.update.alreadyLatest}\n`);
  }
}
