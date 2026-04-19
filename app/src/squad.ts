import {
  api,
  type CreateSquadInviteRequest,
  type Period,
  type ProfileStatsResponse,
  type SquadInvite,
  type SquadMember,
  type SquadResponse,
} from '@claudenomics/api';

import { colors } from '@claudenomics/logger';
import { handleApiError } from './api-errors.js';
import { CliError } from './errors.js';
import { requireAuth } from './session-check.js';
import { normalizePeriod, renderStatsCard } from './stats-card.js';
import { text } from './text.js';

const INDENT = '   ';
const MAX_MEMBERS_LISTED = 10;
const SEP = colors.dim('  ·  ');

export interface SquadViewOptions {
  period?: string;
}

export interface SquadJoinOptions {
  primary?: boolean;
}

export interface SquadCreateOptions {
  name?: string;
}

export interface InviteCreateOptions {
  label?: string;
  uses?: number;
  expiresIn?: string;
}

const DURATION_RE = /^(\d+)(s|m|h|d)$/;
const DURATION_UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseExpiresIn(input: string): number {
  const match = DURATION_RE.exec(input.trim());
  if (!match) throw new CliError(text.squad.badDuration(input));
  const ms = Number.parseInt(match[1]!, 10) * DURATION_UNIT_MS[match[2]!]!;
  if (ms <= 0) throw new CliError(text.squad.badDuration(input));
  return Date.now() + ms;
}

function formatInviteExpiry(expiresAt: number | null): string {
  if (expiresAt === null) return text.squad.neverExpires;
  const ms = expiresAt - Date.now();
  if (ms <= 0) return text.squad.expired;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return text.squad.expiresIn(`${sec}s`);
  const min = Math.floor(sec / 60);
  if (min < 60) return text.squad.expiresIn(`${min}m`);
  const hr = Math.floor(min / 60);
  if (hr < 24) return text.squad.expiresIn(`${hr}h`);
  return text.squad.expiresIn(`${Math.floor(hr / 24)}d`);
}

function inviteDetailParts(invite: SquadInvite): string[] {
  const parts: string[] = [colors.accent(invite.code)];
  if (invite.maxUses !== null) {
    parts.push(colors.muted(text.squad.inviteUses(invite.useCount, invite.maxUses)));
  } else if (invite.useCount > 0) {
    parts.push(colors.muted(text.squad.inviteUsesUnlimited(invite.useCount)));
  }
  parts.push(colors.muted(formatInviteExpiry(invite.expiresAt)));
  return parts;
}

function sortMembers(members: SquadMember[]): SquadMember[] {
  return [...members].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'captain' ? -1 : 1;
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.joinedAt - b.joinedAt;
  });
}

function memberTag(m: SquadMember): string {
  if (m.role === 'captain') return colors.accent(text.squad.captainLabel);
  if (m.isPrimary) return colors.muted(text.squad.primaryLabel);
  return '';
}

function deriveDefaultName(slug: string): string {
  return (
    slug
      .split('-')
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ') || slug
  );
}

function writeHeader(squad: SquadResponse): void {
  const parts: string[] = [
    colors.primary(squad.name),
    colors.dim(squad.slug),
    colors.accent(squad.league),
  ];
  if (squad.verified) parts.push(colors.muted(text.squad.verifiedBadge));
  process.stdout.write(`${INDENT}${parts.join(SEP)}\n`);
}

function writeSubHeader(squad: SquadResponse): void {
  const pieces: string[] = [];
  if (squad.captain) {
    pieces.push(
      `${colors.muted(text.squad.captainLabel)} ${colors.primary(`@${squad.captain.handle}`)}`,
    );
  }
  pieces.push(colors.muted(text.squad.memberCount(squad.memberCount)));
  process.stdout.write(`${INDENT}${pieces.join(SEP)}\n`);
}

function writeMembersSection(squad: SquadResponse): void {
  if (squad.members.length === 0) return;
  const out = process.stdout;
  out.write('\n');
  out.write(`${INDENT}${colors.muted(text.squad.membersHeading)}\n`);
  const shown = sortMembers(squad.members).slice(0, MAX_MEMBERS_LISTED);
  const handleWidth = Math.min(24, Math.max(...shown.map((m) => `@${m.handle}`.length)));
  for (const m of shown) {
    const handle = `@${m.handle}`.padEnd(handleWidth);
    out.write(`${INDENT}  ${colors.primary(handle)}   ${memberTag(m)}\n`);
  }
  const remaining = squad.members.length - shown.length;
  if (remaining > 0) {
    out.write(`${INDENT}  ${colors.muted(text.squad.moreMembers(remaining))}\n`);
  }
}

function writeInviteSection(invite: SquadInvite | null): void {
  if (!invite) return;
  const out = process.stdout;
  out.write('\n');
  out.write(
    `${INDENT}${colors.muted(text.squad.inviteHeading)}   ${inviteDetailParts(invite).join(SEP)}\n`,
  );
}

function socialsFooter(squad: SquadResponse): string[] {
  const lines: string[] = [];
  if (squad.bio) lines.push(colors.muted(squad.bio));
  if (squad.socials.length > 0) {
    const parts = squad.socials.map(
      (s) => `${colors.muted(s.provider)} ${colors.primary(`@${s.handle}`)}`,
    );
    lines.push(parts.join(SEP));
  }
  lines.push(colors.link(text.squad.squadUrl(squad.slug)));
  return lines;
}

function renderSquad(squad: SquadResponse, stats: ProfileStatsResponse, period: Period): void {
  const out = process.stdout;
  out.write('\n');
  writeHeader(squad);
  writeSubHeader(squad);

  renderStatsCard({ stats, period });

  writeMembersSection(squad);
  writeInviteSection(squad.invite);

  out.write('\n');
  for (const line of socialsFooter(squad)) out.write(`${INDENT}${line}\n`);
  out.write('\n');
}

async function renderSquadCardWithStats(squad: SquadResponse): Promise<void> {
  let stats: ProfileStatsResponse | null = null;
  try {
    stats = await api.getSquadStats(squad.slug, 'all');
  } catch {}
  if (stats) renderSquad(squad, stats, 'all');
  else process.stdout.write(`${INDENT}${colors.link(text.squad.squadUrl(squad.slug))}\n`);
}

export async function runSquadView(slug: string, opts: SquadViewOptions = {}): Promise<void> {
  const period = normalizePeriod(opts.period);
  let squad: SquadResponse;
  let stats: ProfileStatsResponse;
  try {
    [squad, stats] = await Promise.all([
      api.getSquad(slug),
      api.getSquadStats(slug, period),
    ]);
  } catch (err) {
    handleApiError(err, {
      byStatus: { 404: text.squad.notFound(slug) },
      fallback: text.squad.requestFailed,
    });
  }
  renderSquad(squad, stats, period);
}

export async function runSquadJoin(code: string, opts: SquadJoinOptions = {}): Promise<void> {
  await requireAuth();

  let squad: SquadResponse;
  try {
    squad = await api.acceptInvite(code, opts.primary ? { setPrimary: true } : undefined);
  } catch (err) {
    handleApiError(err, {
      byCode: {
        squad_invite_unavailable: text.squad.inviteUnavailable,
      },
      byStatus: { 404: text.squad.inviteNotFound(code) },
      fallback: text.squad.requestFailed,
    });
  }

  process.stdout.write(
    `${INDENT}${colors.ok(text.squad.joinedSuccess(squad.name))}\n`,
  );
  await renderSquadCardWithStats(squad);
}

export async function runSquadLeave(slug: string): Promise<void> {
  await requireAuth();
  try {
    await api.leaveSquad(slug);
  } catch (err) {
    handleApiError(err, {
      byCode: {
        captain_cannot_leave: text.squad.captainCannotLeave,
      },
      byStatus: { 404: text.squad.notMemberOrMissing(slug) },
      fallback: text.squad.requestFailed,
    });
  }
  process.stdout.write(`${INDENT}${colors.ok(text.squad.leftSuccess(slug))}\n`);
}

export async function runSquadCreate(
  slug: string,
  opts: SquadCreateOptions = {},
): Promise<void> {
  await requireAuth();

  const name = opts.name?.trim() || deriveDefaultName(slug);
  let squad: SquadResponse;
  try {
    squad = await api.createSquad({ slug, name });
  } catch (err) {
    handleApiError(err, {
      byCode: {
        slug_taken: text.squad.slugTaken(slug),
        invalid_request: text.squad.invalidSlug(slug),
      },
      fallback: text.squad.requestFailed,
    });
  }

  process.stdout.write(
    `${INDENT}${colors.ok(text.squad.createdSuccess(squad.name))}\n`,
  );
  await renderSquadCardWithStats(squad);
}

function writeInviteCard(slug: string, invite: SquadInvite): void {
  const out = process.stdout;
  out.write('\n');
  out.write(`${INDENT}${colors.ok(text.squad.inviteCreatedSuccess(slug))}\n`);
  out.write(`${INDENT}${inviteDetailParts(invite).join(SEP)}\n`);
  if (invite.label) {
    out.write(`${INDENT}${colors.muted(`label: ${invite.label}`)}\n`);
  }
  out.write('\n');
  out.write(`${INDENT}${colors.muted(text.squad.inviteJoinHint(invite.code))}\n`);
  out.write('\n');
}

function buildInviteRequest(opts: InviteCreateOptions): CreateSquadInviteRequest {
  const req: CreateSquadInviteRequest = {};
  if (opts.label !== undefined) req.label = opts.label;
  if (opts.uses !== undefined) {
    if (!Number.isInteger(opts.uses) || opts.uses <= 0) {
      throw new CliError(text.squad.badUses(String(opts.uses)));
    }
    req.maxUses = opts.uses;
  }
  if (opts.expiresIn !== undefined) req.expiresAt = parseExpiresIn(opts.expiresIn);
  return req;
}

export async function runInviteCreate(
  slug: string,
  opts: InviteCreateOptions = {},
): Promise<void> {
  await requireAuth();
  const req = buildInviteRequest(opts);

  let invite: SquadInvite;
  try {
    invite = await api.createSquadInvite(slug, req);
  } catch (err) {
    handleApiError(err, {
      byCode: {
        forbidden: text.squad.onlyCaptainsCan,
      },
      byStatus: { 404: text.squad.notFound(slug) },
      fallback: text.squad.requestFailed,
    });
  }

  writeInviteCard(slug, invite);
}

export async function runInviteRevoke(slug: string, code: string): Promise<void> {
  await requireAuth();
  try {
    await api.revokeSquadInvite(slug, code);
  } catch (err) {
    handleApiError(err, {
      byCode: {
        forbidden: text.squad.onlyCaptainsCan,
      },
      byStatus: { 404: text.squad.inviteNotFoundForSquad(slug, code) },
      fallback: text.squad.requestFailed,
    });
  }
  process.stdout.write(
    `${INDENT}${colors.ok(text.squad.inviteRevokedSuccess(code))}\n`,
  );
}
