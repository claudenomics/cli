import { AuthError, login, type Session } from '@claudenomics/auth';
import { type ProfileResponse, type UsageResponse } from '@claudenomics/api';
import { colors } from '@claudenomics/logger';
import { fetchProfile, fetchUsage } from './account.js';
import { formatTokens, shortAddr } from './format.js';
import { CliError } from './errors.js';
import { text } from './text.js';
import {
  SHIMMER_DURATION_MS,
  SHIMMER_FRAMES,
  Spinner,
  shimmerFrame,
  shouldAnimate,
  sleep,
} from './ui.js';

const INDENT = '   ';

async function printSuccessCard(
  session: Session,
  profile: ProfileResponse | null,
  usage: UsageResponse | null,
): Promise<void> {
  const out = process.stdout;
  const sep = colors.dim('  ·  ');

  const parts: string[] = [];
  if (session.email) parts.push(colors.primary(session.email));
  parts.push(colors.dim(shortAddr(session.wallet)));
  if (profile?.league) parts.push(colors.primary(profile.league));
  if (profile?.rank != null) parts.push(colors.accent(`#${profile.rank}`));
  if (usage) {
    const total = usage.inputTokens + usage.outputTokens;
    if (total > 0) {
      parts.push(`${colors.accent(formatTokens(total))} ${colors.muted(text.home.tokensLabel)}`);
    }
  }

  out.write(`${INDENT}${parts.join(sep)}\n`);

  const nextPrefix = `${colors.muted(text.login.next)}  `;
  const nextCmd = text.login.nextCmd;

  if (!shouldAnimate()) {
    out.write(`${INDENT}${nextPrefix}${colors.accent(nextCmd)}\n`);
    return;
  }

  out.write(`${INDENT}${nextPrefix}${colors.accentDim(nextCmd)}\n`);

  const delay = SHIMMER_DURATION_MS / SHIMMER_FRAMES;
  for (let f = 1; f <= SHIMMER_FRAMES; f++) {
    await sleep(delay);
    out.write('\x1b[1A\r\x1b[2K');
    out.write(`${INDENT}${nextPrefix}${shimmerFrame(nextCmd, f, SHIMMER_FRAMES)}\n`);
  }

  out.write('\x1b[1A\r\x1b[2K');
  out.write(`${INDENT}${nextPrefix}${colors.accent(nextCmd)}\n`);
}

export async function runLogin(opts: { authUrl?: string }): Promise<void> {
  const spinner = new Spinner();
  spinner.start(text.login.phases.opening);

  let session: Session;
  try {
    session = await login({
      ...(opts.authUrl !== undefined ? { authUrl: opts.authUrl } : {}),
      onPhase: (phase) => spinner.update(text.login.phases[phase]),
    });
  } catch (err) {
    spinner.stop();
    const msg = err instanceof AuthError ? err.message : (err as Error).message;
    process.stdout.write(`${INDENT}${colors.err(text.login.failed(msg))}\n`);
    if (err instanceof AuthError) throw new CliError(msg);
    throw err;
  }

  spinner.stop();

  const [profile, usage] = await Promise.all([
    fetchProfile(session.wallet),
    fetchUsage(session.wallet),
  ]);

  await printSuccessCard(session, profile, usage);
}
