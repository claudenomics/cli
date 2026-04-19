import chalk from 'chalk';
import {
  api,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type LeaderboardView,
} from '@claudenomics/api';
import { colors } from '@claudenomics/logger';
import { handleApiError } from './api-errors.js';
import { formatTokens } from './format.js';
import { normalizePeriod } from './stats-card.js';
import { text } from './text.js';

const INDENT = '   ';

export interface LeaderboardOptions {
  view?: string;
  period?: string;
  league?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

function normalizeView(v: string | undefined): LeaderboardView {
  return v === 'squads' ? 'squads' : 'builders';
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + '…';
}

const RANK_STYLES = [
  (s: string): string => chalk.hex('#f5c430').bold(s),
  (s: string): string => chalk.hex('#b0b0b0').bold(s),
  (s: string): string => chalk.hex('#cd7f32').bold(s),
];

function renderRank(rank: number): string {
  const s = String(rank).padStart(3);
  if (rank >= 1 && rank <= 3) return RANK_STYLES[rank - 1]!(s);
  return colors.muted(s);
}

function entryPrimaryLabel(e: LeaderboardEntry, view: LeaderboardView): string {
  if (view === 'squads') return e.name ?? e.handle;
  return e.name ? `${e.name}` : `@${e.handle}`;
}

function entrySecondaryLabel(e: LeaderboardEntry, view: LeaderboardView): string {
  if (view === 'squads') return e.handle;
  return `@${e.handle}`;
}

export async function runLeaderboard(opts: LeaderboardOptions = {}): Promise<void> {
  const view = normalizeView(opts.view);
  const period = normalizePeriod(opts.period);
  const page = Number.isFinite(opts.page) && opts.page! > 0 ? Math.floor(opts.page!) : 1;
  const pageSize =
    Number.isFinite(opts.pageSize) && opts.pageSize! > 0
      ? Math.min(100, Math.floor(opts.pageSize!))
      : 25;

  let res: LeaderboardResponse;
  try {
    res = await api.getLeaderboard({
      view,
      period,
      ...(opts.league ? { league: opts.league } : {}),
      ...(opts.search ? { search: opts.search } : {}),
      page,
      pageSize,
    });
  } catch (err) {
    handleApiError(err, { fallback: text.leaderboard.requestFailed });
  }

  const out = process.stdout;
  out.write('\n');

  const headerParts: string[] = [
    colors.primary(text.leaderboard.viewLabels[view]),
    colors.muted(text.stats.periodLabels[period]),
  ];
  if (opts.league) headerParts.push(colors.accent(`league ${opts.league}`));
  if (opts.search) headerParts.push(colors.muted(`"${opts.search}"`));
  out.write(`${INDENT}${headerParts.join(colors.dim('  ·  '))}\n`);
  out.write('\n');

  if (res.entries.length === 0) {
    out.write(`${INDENT}${colors.muted(text.leaderboard.empty)}\n\n`);
    return;
  }

  const NAME_WIDTH = 20;
  const HANDLE_WIDTH = 18;
  const LEAGUE_WIDTH = 8;
  const TOKENS_WIDTH = 8;
  const RECEIPTS_WIDTH = 8;

  const head =
    `${INDENT}${colors.dim('  #')}  ` +
    `${colors.muted(text.leaderboard.cols.name.padEnd(NAME_WIDTH))}  ` +
    `${colors.muted(text.leaderboard.cols.handle.padEnd(HANDLE_WIDTH))}  ` +
    `${colors.muted(text.leaderboard.cols.league.padEnd(LEAGUE_WIDTH))}  ` +
    `${colors.muted(text.leaderboard.cols.tokens.padStart(TOKENS_WIDTH))}  ` +
    `${colors.muted(text.leaderboard.cols.receipts.padStart(RECEIPTS_WIDTH))}  ` +
    `${colors.muted(text.leaderboard.cols.model)}\n`;
  out.write(head);

  for (const e of res.entries) {
    const primary = truncate(entryPrimaryLabel(e, view), NAME_WIDTH);
    const secondary = truncate(entrySecondaryLabel(e, view), HANDLE_WIDTH);
    const league = truncate(e.league ?? '-', LEAGUE_WIDTH);
    const tokens = formatTokens(e.tokensBurned).padStart(TOKENS_WIDTH);
    const receipts = String(e.receiptCount).padStart(RECEIPTS_WIDTH);
    const model = e.model ?? '';

    out.write(
      `${INDENT}${renderRank(e.rank)}  ` +
        `${colors.primary(primary.padEnd(NAME_WIDTH))}  ` +
        `${colors.dim(secondary.padEnd(HANDLE_WIDTH))}  ` +
        `${colors.muted(league.padEnd(LEAGUE_WIDTH))}  ` +
        `${colors.accent(tokens)}  ` +
        `${colors.primary(receipts)}  ` +
        `${colors.muted(model)}\n`,
    );
  }

  out.write('\n');
  const totalPages = Math.max(1, Math.ceil(res.total / res.pageSize));
  out.write(
    `${INDENT}${colors.muted(text.leaderboard.pageFooter(res.page, totalPages, res.total))}\n`,
  );
  out.write('\n');
}
