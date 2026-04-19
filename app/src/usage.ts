import { api, type ProfileMeResponse, type ProfileStatsResponse } from '@claudenomics/api';
import { colors } from '@claudenomics/logger';
import { handleApiError } from './api-errors.js';
import { shortAddr } from './format.js';
import { createFileReceiptStore } from './receipt-store.js';
import { retryPendingReceipts } from './receipts.js';
import { requireAuth } from './session-check.js';
import { formatNextLeagueLine, normalizePeriod, renderStatsCard } from './stats-card.js';
import { text } from './text.js';

const INDENT = '   ';

export interface UsageOptions {
  period?: string;
}

export async function runUsage(opts: UsageOptions = {}): Promise<void> {
  await requireAuth();

  const period = normalizePeriod(opts.period);
  const store = createFileReceiptStore();
  await retryPendingReceipts(store);

  let me: ProfileMeResponse;
  let stats: ProfileStatsResponse;
  let pendingCount: number;
  try {
    const [meRes, pending] = await Promise.all([api.getMe(), store.listPending()]);
    me = meRes;
    pendingCount = pending.length;
    stats = await api.getProfileStats(me.handle, period);
  } catch (err) {
    handleApiError(err, { fallback: text.usage.requestFailed });
  }

  const headerParts: string[] = [colors.primary(`@${me.handle}`), colors.dim(shortAddr(me.wallet))];
  if (me.league) headerParts.push(colors.accent(me.league));
  if (me.rank !== null) headerParts.push(colors.muted(text.stats.rankLabel(me.rank)));

  const footer: string[] = [];
  const nextLine = formatNextLeagueLine(me.leagueProgress);
  if (nextLine) footer.push(colors.muted(nextLine));
  if (pendingCount > 0) footer.push(colors.muted(text.usage.pending(pendingCount)));
  footer.push(colors.link(text.usage.profileUrl(me.handle)));

  renderStatsCard({ headerParts, stats, period, footerLines: footer });

  process.stdout.write(`${INDENT}${colors.muted(text.stats.periodHint)}\n`);
}
