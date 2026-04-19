import { type ProfileMeResponse, type UsageResponse } from '@claudenomics/api';
import { loadSession, type Session } from '@claudenomics/auth';
import { colors } from '@claudenomics/logger';
import { fetchMe, fetchUsage } from './account.js';
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
const GAP = '   ';

function formatExpiry(ms: number): string {
  if (ms <= 0) return text.whoami.expired;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return text.whoami.expiresIn(`${sec}s`);
  const min = Math.floor(sec / 60);
  if (min < 60) return text.whoami.expiresIn(`${min}m`);
  const hr = Math.floor(min / 60);
  if (hr < 24) return text.whoami.expiresIn(`${hr}h`);
  const day = Math.floor(hr / 24);
  const remHr = hr % 24;
  return remHr > 0
    ? text.whoami.expiresIn(`${day}d ${remHr}h`)
    : text.whoami.expiresIn(`${day}d`);
}

interface Row {
  label: string;
  value: string;
}

function buildRows(
  session: Session,
  me: ProfileMeResponse | null,
  usage: UsageResponse | null,
): { rows: Row[]; tokenRowIdx: number } {
  const L = text.whoami.labels;
  const rows: Row[] = [];

  if (me?.handle) rows.push({ label: L.handle, value: colors.primary(`@${me.handle}`) });
  const email = me?.email ?? session.email;
  if (email) rows.push({ label: L.email, value: colors.primary(email) });
  rows.push({ label: L.wallet, value: colors.dim(session.wallet) });
  if (me?.league) rows.push({ label: L.league, value: colors.primary(me.league) });
  if (me?.rank != null) rows.push({ label: L.rank, value: colors.accent(`#${me.rank}`) });

  let tokenRowIdx = -1;
  if (usage) {
    const total = usage.inputTokens + usage.outputTokens;
    if (total > 0) {
      tokenRowIdx = rows.length;
      rows.push({ label: L.tokens, value: colors.accent(total.toLocaleString()) });
    }
  }

  rows.push({
    label: L.session,
    value: colors.dim(formatExpiry(session.refreshExpiresAt - Date.now())),
  });

  return { rows, tokenRowIdx };
}

function renderRow(row: Row, labelWidth: number): string {
  return `${INDENT}${colors.muted(row.label.padEnd(labelWidth))}${GAP}${row.value}\n`;
}

async function shimmerTokenRow(
  rows: Row[],
  tokenRowIdx: number,
  labelWidth: number,
  totalStr: string,
): Promise<void> {
  const out = process.stdout;
  const rowsBelow = rows.length - 1 - tokenRowIdx;
  const tokenLabel = rows[tokenRowIdx]!.label;
  const labelPart = `${INDENT}${colors.muted(tokenLabel.padEnd(labelWidth))}${GAP}`;

  const delay = SHIMMER_DURATION_MS / SHIMMER_FRAMES;
  for (let f = 1; f <= SHIMMER_FRAMES; f++) {
    await sleep(delay);
    const moveUp = rowsBelow + 1;
    out.write(`\x1b[${moveUp}A\r\x1b[2K`);
    out.write(`${labelPart}${shimmerFrame(totalStr, f, SHIMMER_FRAMES)}\n`);
    if (rowsBelow > 0) out.write(`\x1b[${rowsBelow}B`);
  }

  const moveUp = rowsBelow + 1;
  out.write(`\x1b[${moveUp}A\r\x1b[2K`);
  out.write(`${labelPart}${colors.accent(totalStr)}\n`);
  if (rowsBelow > 0) out.write(`\x1b[${rowsBelow}B`);
}

export async function runWhoami(): Promise<void> {
  const session = await loadSession();
  if (!session) {
    process.stdout.write(`${text.session.notSignedIn(styles.cmd('claudenomics login'))}\n`);
    return;
  }

  const [me, usage] = await Promise.all([fetchMe(), fetchUsage(session.wallet)]);

  const { rows, tokenRowIdx } = buildRows(session, me, usage);
  const labelWidth = Math.max(...rows.map((r) => r.label.length));

  const out = process.stdout;
  out.write('\n');

  const animate = tokenRowIdx >= 0 && shouldAnimate();
  const initialRows = rows.map((row, i) => {
    if (i === tokenRowIdx && animate) {
      const totalStr = (usage!.inputTokens + usage!.outputTokens).toLocaleString();
      return { ...row, value: colors.accentDim(totalStr) };
    }
    return row;
  });
  for (const row of initialRows) out.write(renderRow(row, labelWidth));

  if (animate) {
    const totalStr = (usage!.inputTokens + usage!.outputTokens).toLocaleString();
    await shimmerTokenRow(rows, tokenRowIdx, labelWidth, totalStr);
  }

  out.write('\n');
}
