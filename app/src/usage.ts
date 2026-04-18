import { type ProfileResponse, type UsageResponse } from '@claudenomics/api';
import { loadSession, type Session } from '@claudenomics/auth';
import { colors } from '@claudenomics/logger';
import { fetchProfile, fetchUsage, shortAddr } from './account.js';
import { CliError } from './errors.js';
import { createFileReceiptStore, type PendingReceipt } from './receipt-store.js';
import { retryPendingReceipts } from './receipts.js';
import { styles } from './styles.js';
import { text } from './text.js';
import {
  SHIMMER_DURATION_MS,
  SHIMMER_FRAMES,
  shimmerFrame,
  shouldAnimate,
  sleep,
} from './ui.js';

const INDENT = '   ';

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return text.usage.justNow;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toISOString().slice(0, 10);
}

function writeHeader(session: Session, profile: ProfileResponse | null): void {
  const out = process.stdout;
  const sep = colors.dim('  ·  ');

  const standingParts: string[] = [];
  if (profile?.league) standingParts.push(colors.primary(profile.league));
  if (profile?.rank != null) standingParts.push(colors.accent(`#${profile.rank}`));
  if (standingParts.length > 0) {
    out.write(`${INDENT}${standingParts.join(sep)}\n`);
  }

  const identityParts: string[] = [];
  if (session.email) identityParts.push(colors.muted(session.email));
  identityParts.push(colors.dim(shortAddr(session.wallet)));
  out.write(`${INDENT}${identityParts.join(sep)}\n`);
}

async function writeHeroTotal(total: number): Promise<void> {
  const out = process.stdout;
  const totalStr = total.toLocaleString();
  const label = colors.muted(` ${text.usage.tokensLabel}`);

  if (!shouldAnimate()) {
    out.write(`${INDENT}${colors.accent(totalStr)}${label}\n`);
    return;
  }

  out.write(`${INDENT}${colors.accentDim(totalStr)}${label}\n`);

  const delay = SHIMMER_DURATION_MS / SHIMMER_FRAMES;
  for (let f = 1; f <= SHIMMER_FRAMES; f++) {
    await sleep(delay);
    out.write('\x1b[1A\r\x1b[2K');
    out.write(`${INDENT}${shimmerFrame(totalStr, f, SHIMMER_FRAMES)}${label}\n`);
  }

  out.write('\x1b[1A\r\x1b[2K');
  out.write(`${INDENT}${colors.accent(totalStr)}${label}\n`);
}

function writeBreakdown(usage: UsageResponse): void {
  const out = process.stdout;
  const inputStr = usage.inputTokens.toLocaleString();
  const outputStr = usage.outputTokens.toLocaleString();
  const numWidth = Math.max(inputStr.length, outputStr.length);
  const labelWidth = Math.max(text.usage.inLabel.length, text.usage.outLabel.length);

  out.write(
    `${INDENT}${colors.muted(text.usage.inLabel.padEnd(labelWidth))}   ${colors.primary(inputStr.padStart(numWidth))}\n`,
  );
  out.write(
    `${INDENT}${colors.muted(text.usage.outLabel.padEnd(labelWidth))}   ${colors.primary(outputStr.padStart(numWidth))}\n`,
  );
}

function writeStatus(usage: UsageResponse, pending: PendingReceipt[]): void {
  const parts: string[] = [];
  if (pending.length > 0) parts.push(text.usage.pending(pending.length));
  if (usage.lastUpdated > 0) parts.push(text.usage.updated(formatRelativeTime(usage.lastUpdated)));
  if (parts.length === 0) return;
  process.stdout.write(`${INDENT}${colors.muted(parts.join('  ·  '))}\n`);
}

function writeProfileLink(session: Session): void {
  process.stdout.write(`${INDENT}${colors.link(text.usage.profileUrl(shortAddr(session.wallet)))}\n`);
}

export async function runUsage(): Promise<void> {
  const session = await loadSession();
  if (!session) {
    throw new CliError(text.session.notSignedIn(styles.cmd('claudenomics login')));
  }

  const store = createFileReceiptStore();
  await retryPendingReceipts(store);

  const [profile, usage, pending] = await Promise.all([
    fetchProfile(session.wallet),
    fetchUsage(session.wallet),
    store.listPending(),
  ]);

  if (!usage) {
    throw new CliError(text.usage.requestFailed('unreachable'));
  }

  const out = process.stdout;
  out.write('\n');
  writeHeader(session, profile);
  out.write('\n');
  await writeHeroTotal(usage.inputTokens + usage.outputTokens);
  out.write('\n');
  writeBreakdown(usage);

  const hasStatus = pending.length > 0 || usage.lastUpdated > 0;
  if (hasStatus) {
    out.write('\n');
    writeStatus(usage, pending);
  }

  out.write('\n');
  writeProfileLink(session);
}
