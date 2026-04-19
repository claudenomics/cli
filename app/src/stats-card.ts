import type { LeagueProgress, Period, ProfileStatsResponse } from '@claudenomics/api';
import { colors } from '@claudenomics/logger';
import { formatTokens } from './format.js';
import { text } from './text.js';

export function normalizePeriod(p: string | undefined): Period {
  if (p === 'day' || p === 'week' || p === 'month' || p === 'all') return p;
  return 'all';
}

export function formatNextLeagueLine(progress: LeagueProgress | null | undefined): string | null {
  if (!progress || !progress.next || progress.tokensToNext <= 0) return null;
  return text.stats.nextLeague(progress.next.slug, formatTokens(progress.tokensToNext));
}

const INDENT = '   ';

export function periodLabel(p: Period): string {
  return text.stats.periodLabels[p];
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 10) return `${h.toFixed(1)}h`;
  return `${Math.round(h)}h`;
}

function writeHeader(parts: string[]): void {
  const sep = colors.dim('  ·  ');
  process.stdout.write(`${INDENT}${parts.join(sep)}\n`);
}

function writeTotalsLine(period: Period, stats: ProfileStatsResponse): void {
  const { totals, totalSessionHours } = stats;
  const pieces = [
    colors.muted(periodLabel(period)),
    `${colors.muted(text.stats.inLabel)} ${colors.accent(formatTokens(totals.inputTokens))}`,
    `${colors.muted(text.stats.outLabel)} ${colors.accent(formatTokens(totals.outputTokens))}`,
    `${colors.muted(text.stats.receiptsLabel)} ${colors.primary(String(totals.receiptCount))}`,
  ];
  if (totalSessionHours > 0) {
    pieces.push(`${colors.muted(text.stats.sessionsLabel)} ${colors.primary(formatHours(totalSessionHours))}`);
  }
  process.stdout.write(`${INDENT}${pieces.join('   ')}\n`);
}

function writeBreakdownSection(
  heading: string,
  rows: Array<{ label: string; input: number; output: number }>,
): void {
  if (rows.length === 0) return;
  const out = process.stdout;
  out.write('\n');
  out.write(`${INDENT}${colors.muted(heading)}\n`);
  const labelWidth = Math.min(28, Math.max(...rows.map((r) => r.label.length)));
  const inStrs = rows.map((r) => formatTokens(r.input));
  const outStrs = rows.map((r) => formatTokens(r.output));
  const inWidth = Math.max(...inStrs.map((s) => s.length));
  const outWidth = Math.max(...outStrs.map((s) => s.length));
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const label = row.label.length > labelWidth ? row.label.slice(0, labelWidth - 1) + '…' : row.label;
    const inStr = inStrs[i]!.padStart(inWidth);
    const outStr = outStrs[i]!.padStart(outWidth);
    out.write(
      `${INDENT}  ${colors.primary(label.padEnd(labelWidth))}   ${colors.accent(inStr)} ${colors.muted(text.stats.inLabel)}   ${colors.accent(outStr)} ${colors.muted(text.stats.outLabel)}\n`,
    );
  }
}

export interface StatsCardOptions {
  headerParts?: string[];
  stats: ProfileStatsResponse;
  period: Period;
  footerLines?: string[];
}

export function renderStatsCard(opts: StatsCardOptions): void {
  const out = process.stdout;
  if (opts.headerParts && opts.headerParts.length > 0) {
    out.write('\n');
    writeHeader(opts.headerParts);
  }
  out.write('\n');
  writeTotalsLine(opts.period, opts.stats);

  if (opts.stats.totals.receiptCount === 0) {
    out.write('\n');
    out.write(`${INDENT}${colors.muted(text.stats.empty)}\n`);
    out.write('\n');
    return;
  }

  writeBreakdownSection(
    text.stats.byModel,
    opts.stats.models.map((m) => ({
      label: m.model,
      input: m.inputTokens,
      output: m.outputTokens,
    })),
  );
  writeBreakdownSection(
    text.stats.byProvider,
    opts.stats.providers.map((p) => ({
      label: p.upstream,
      input: p.inputTokens,
      output: p.outputTokens,
    })),
  );

  if (opts.footerLines && opts.footerLines.length > 0) {
    out.write('\n');
    for (const line of opts.footerLines) out.write(`${INDENT}${line}\n`);
  }

  out.write('\n');
}
