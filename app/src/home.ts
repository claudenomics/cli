import chalk from 'chalk';
import { type ProfileResponse, type UsageResponse } from '@claudenomics/api';
import { loadSession, type Session } from '@claudenomics/auth';
import { colors } from '@claudenomics/logger';
import { fetchProfile, fetchUsage } from './account.js';
import { formatTokens, shortAddr } from './format.js';
import { text } from './text.js';
import {
  SHIMMER_DURATION_MS,
  SHIMMER_FRAMES,
  shimmerFrame,
  shouldAnimate,
  sleep,
} from './ui.js';

declare const __CLAUDENOMICS_VERSION__: string;

const WORDMARK_LINES: string[] = [
  "       _                 _                            _           ",
  "   ___| | __ _ _   _  __| | ___ _ __   ___  _ __ ___ (_) ___ ___ ",
  "  / __| |/ _` | | | |/ _` |/ _ \\ '_ \\ / _ \\| '_ ` _ \\| |/ __/ __|",
  " | (__| | (_| | |_| | (_| |  __/ | | | (_) | | | | | | | (__\\__ \\",
  "  \\___|_|\\__,_|\\__,_|\\__,_|\\___|_| |_|\\___/|_| |_| |_|_|\\___|___/",
];

interface HomeCommand {
  name: string;
  desc: string;
}

const { login, claude, codex, usage: usageCmd, logout } = text.home.commands;
const COMMON_COMMANDS: HomeCommand[] = [claude, codex, usageCmd];
const LOGGED_OUT_COMMANDS: HomeCommand[] = [login, ...COMMON_COMMANDS];
const LOGGED_IN_COMMANDS: HomeCommand[] = [...COMMON_COMMANDS, logout];

function pickTip(): string {
  const tips = text.home.tips;
  return text.home.tipPrefix + tips[Math.floor(Math.random() * tips.length)]!;
}

const SWEEP_FRAMES = 8;
const SWEEP_DURATION_MS = 320;

async function animateSweep(): Promise<void> {
  const totalWidth = Math.max(...WORDMARK_LINES.map((l) => l.length));

  for (const line of WORDMARK_LINES) {
    process.stdout.write(colors.brandDim(line) + '\n');
  }

  const frameDelay = SWEEP_DURATION_MS / SWEEP_FRAMES;

  for (let f = 1; f <= SWEEP_FRAMES; f++) {
    await sleep(frameDelay);
    const wavePos = Math.floor((f / SWEEP_FRAMES) * (totalWidth + 4));
    process.stdout.write(`\x1b[${WORDMARK_LINES.length}A`);
    for (let i = 0; i < WORDMARK_LINES.length; i++) {
      const line = WORDMARK_LINES[i]!;
      const bright = colors.brand(line.slice(0, wavePos));
      const rest = colors.brandDim(line.slice(wavePos));
      process.stdout.write('\r\x1b[2K' + bright + rest + '\n');
    }
  }
}

function writeStaticWordmark(): void {
  for (const line of WORDMARK_LINES) {
    process.stdout.write(colors.brand(line) + '\n');
  }
}

interface AuthLine {
  prefix: string;
  tokenText: string | null;
  tokenLabel: string;
  sep: string;
}

function buildAuthLine(
  session: Session,
  profile: ProfileResponse | null,
  usage: UsageResponse | null,
): AuthLine {
  const sep = colors.dim('  ·  ');
  const prefixParts: string[] = [];
  if (session.email) prefixParts.push(colors.muted(session.email));
  prefixParts.push(colors.dim(shortAddr(session.wallet)));
  if (profile?.league) prefixParts.push(colors.primary(profile.league));
  if (profile?.rank != null) prefixParts.push(colors.accent(`#${profile.rank}`));

  let tokenText: string | null = null;
  if (usage) {
    const total = usage.inputTokens + usage.outputTokens;
    if (total > 0) tokenText = formatTokens(total);
  }

  return {
    prefix: prefixParts.join(sep),
    tokenText,
    tokenLabel: colors.muted(` ${text.home.tokensLabel}`),
    sep,
  };
}

async function writeAuthRow(
  session: Session,
  profile: ProfileResponse | null,
  usage: UsageResponse | null,
): Promise<void> {
  const out = process.stdout;
  const line = buildAuthLine(session, profile, usage);
  const renderTokens = (colored: string): string =>
    line.tokenText ? `${line.sep}${colored}${line.tokenLabel}` : '';

  if (!line.tokenText || !shouldAnimate()) {
    const tokens = line.tokenText ? renderTokens(colors.accent(line.tokenText)) : '';
    out.write(`   ${line.prefix}${tokens}\n`);
    return;
  }

  out.write(`   ${line.prefix}${renderTokens(colors.accentDim(line.tokenText))}\n`);

  const delay = SHIMMER_DURATION_MS / SHIMMER_FRAMES;
  for (let f = 1; f <= SHIMMER_FRAMES; f++) {
    await sleep(delay);
    out.write('\x1b[1A\r\x1b[2K');
    out.write(`   ${line.prefix}${renderTokens(shimmerFrame(line.tokenText, f, SHIMMER_FRAMES))}\n`);
  }

  out.write('\x1b[1A\r\x1b[2K');
  out.write(`   ${line.prefix}${renderTokens(colors.accent(line.tokenText))}\n`);
}

async function writeBody(
  session: Session | null,
  profile: ProfileResponse | null,
  usage: UsageResponse | null,
): Promise<void> {
  const sep = colors.dim('  ·  ');
  const out = process.stdout;

  out.write('\n');
  out.write(`   ${colors.muted(pickTip())}\n`);
  out.write('\n');

  if (session) {
    await writeAuthRow(session, profile, usage);
  } else {
    out.write(`   ${colors.muted(text.home.notSignedIn)}\n`);
  }
  out.write('\n');

  const commands = session ? LOGGED_IN_COMMANDS : LOGGED_OUT_COMMANDS;
  const maxNameLen = Math.max(...commands.map((c) => c.name.length));
  for (const c of commands) {
    const padded = c.name.padEnd(maxNameLen);
    out.write(`     ${colors.cmd(padded)}   ${colors.desc(c.desc)}\n`);
  }
  out.write('\n');

  const v = colors.ver(`v${__CLAUDENOMICS_VERSION__}`);
  const help = colors.dim(text.brand.help);
  const url = colors.link(text.brand.url);
  out.write(`   ${v}${sep}${help}${sep}${url}\n`);
}

export async function printHome(): Promise<void> {
  const session = await loadSession();
  const profilePromise = session ? fetchProfile(session.wallet) : Promise.resolve(null);
  const usagePromise = session ? fetchUsage(session.wallet) : Promise.resolve(null);

  if (shouldAnimate()) {
    await animateSweep();
  } else {
    writeStaticWordmark();
  }

  const [profile, usage] = await Promise.all([profilePromise, usagePromise]);
  await writeBody(session, profile, usage);
}
