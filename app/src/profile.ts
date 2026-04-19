import {
  api,
  type ProfileStatsResponse,
  type PublicProfileResponse,
} from '@claudenomics/api';
import { colors } from '@claudenomics/logger';
import { handleApiError } from './api-errors.js';
import { shortAddr } from './format.js';
import { requireAuth } from './session-check.js';
import { formatNextLeagueLine, normalizePeriod, renderStatsCard } from './stats-card.js';
import { text } from './text.js';

export interface ProfileOptions {
  period?: string;
}

async function resolveSelfHandle(): Promise<string> {
  await requireAuth();
  try {
    const me = await api.getMe();
    return me.handle;
  } catch (err) {
    handleApiError(err, { fallback: text.profile.requestFailed });
  }
}

function formatSocials(profile: PublicProfileResponse): string | null {
  if (profile.socials.length === 0) return null;
  const sep = colors.dim('  ·  ');
  return profile.socials
    .map((s) => `${colors.muted(s.provider)} ${colors.primary(`@${s.handle}`)}`)
    .join(sep);
}

export async function runProfileView(
  handleArg: string | undefined,
  opts: ProfileOptions = {},
): Promise<void> {
  const target = handleArg?.trim() || (await resolveSelfHandle());
  const period = normalizePeriod(opts.period);

  let profile: PublicProfileResponse;
  let stats: ProfileStatsResponse;
  try {
    [profile, stats] = await Promise.all([
      api.getPublicProfile(target),
      api.getProfileStats(target, period),
    ]);
  } catch (err) {
    handleApiError(err, {
      byStatus: { 404: text.profile.notFound(target) },
      fallback: text.profile.requestFailed,
    });
  }

  const displayName = profile.displayName ?? `@${profile.handle}`;
  const headerParts: string[] = [
    colors.primary(displayName),
    colors.muted(`@${profile.handle}`),
    colors.dim(shortAddr(profile.wallet)),
  ];
  if (profile.league) headerParts.push(colors.accent(profile.league));
  if (profile.rank !== null) headerParts.push(colors.muted(text.stats.rankLabel(profile.rank)));

  const footer: string[] = [];
  if (profile.bio) footer.push(colors.muted(profile.bio));
  const nextLine = formatNextLeagueLine(profile.leagueProgress);
  if (nextLine) footer.push(colors.muted(nextLine));
  const socialsLine = formatSocials(profile);
  if (socialsLine) footer.push(socialsLine);
  footer.push(colors.link(text.usage.profileUrl(profile.handle)));

  renderStatsCard({ headerParts, stats, period, footerLines: footer });
}
