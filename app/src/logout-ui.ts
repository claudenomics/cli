import { loadSession, logout, type Session } from '@claudenomics/auth';
import { type ProfileResponse, type UsageResponse } from '@claudenomics/api';
import { colors } from '@claudenomics/logger';
import { fetchProfile, fetchUsage, formatTokens, shortAddr } from './account.js';
import { text } from './text.js';
import { Spinner } from './ui.js';

const INDENT = '   ';

function printPartingCard(
  session: Session,
  profile: ProfileResponse | null,
  usage: UsageResponse | null,
): void {
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
  out.write(`${INDENT}${colors.muted(text.session.signedOut)}\n`);
}

export async function runLogout(): Promise<void> {
  const session = await loadSession();

  if (!session) {
    process.stdout.write(`${INDENT}${colors.muted(text.session.alreadySignedOut)}\n`);
    return;
  }

  const spinner = new Spinner();
  spinner.start(text.session.signingOut);

  const [cleared, profile, usage] = await Promise.all([
    logout(),
    fetchProfile(session.wallet),
    fetchUsage(session.wallet),
  ]);

  spinner.stop();

  if (!cleared) {
    process.stdout.write(`${INDENT}${colors.muted(text.session.alreadySignedOut)}\n`);
    return;
  }

  printPartingCard(session, profile, usage);
}
