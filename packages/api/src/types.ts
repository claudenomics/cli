export interface TokenExchangeRequest {
  code: string;
  codeVerifier: string;
}

export interface TokenBundle {
  token: string;
  expiresAt: number;
  refreshToken: string;
  refreshExpiresAt: number;
  wallet: string;
  userId: string;
  email?: string;
}

export type TokenExchangeResponse = TokenBundle;

export interface RefreshTokenRequest {
  refreshToken: string;
}

export type RefreshTokenResponse = TokenBundle;

export interface RevokeTokenRequest {
  refreshToken: string;
}

export interface SignedReceipt {
  receipt: {
    wallet: string;
    response_id: string;
    upstream: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    ts: number;
  };
  sig: string;
  pubkey: string;
  compose_hash: string;
  mode?: string;
}

export interface ReceiptSubmitResponse {
  status: 'accepted' | 'duplicate';
}

export interface UsageResponse {
  wallet: string;
  inputTokens: number;
  outputTokens: number;
  lastUpdated: number;
}

export interface ProfileResponse {
  wallet: string;
  league?: string;
  rank?: number;
}

export type Period = 'day' | 'week' | 'month' | 'all';

export interface SocialAccount {
  provider: string;
  handle: string;
  displayName?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  connectedAt: number;
}

export interface LeagueProgressNext {
  slug: string;
  rank: number;
}

export interface LeagueProgress {
  currentTokens: number;
  next: LeagueProgressNext | null;
  requiredTokens: number;
  tokensToNext: number;
}

export interface PublicProfileResponse {
  handle: string;
  wallet: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  league: string;
  rank: number | null;
  totalBuilders: number;
  leagueProgress: LeagueProgress;
  createdAt: number;
  updatedAt: number;
  socials: SocialAccount[];
}

export interface ProfileMeResponse extends PublicProfileResponse {
  email: string;
}

export interface ProfilePatchRequest {
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
}

export interface StatsTotals {
  inputTokens: number;
  outputTokens: number;
  receiptCount: number;
}

export interface ModelBreakdown {
  model: string;
  inputTokens: number;
  outputTokens: number;
  receiptCount: number;
}

export interface ProviderBreakdown {
  upstream: string;
  inputTokens: number;
  outputTokens: number;
  receiptCount: number;
}

export interface ProfileStatsResponse {
  period: Period;
  since: number | null;
  totals: StatsTotals;
  totalSessionHours: number;
  models: ModelBreakdown[];
  providers: ProviderBreakdown[];
}

export type LeaderboardView = 'builders' | 'squads';

export interface LeaderboardQuery {
  view?: LeaderboardView;
  period?: Period;
  league?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface LeaderboardEntry {
  rank: number;
  handle: string;
  name: string | null;
  avatarUrl: string | null;
  verified: boolean;
  league: string;
  tokensBurned: number;
  inputTokens: number;
  outputTokens: number;
  receiptCount: number;
  model: string | null;
  providers: string[];
  tokensMined: number;
  totalSessionHours: number;
  spendSeries: number[];
}

export interface LeaderboardResponse {
  view: LeaderboardView;
  period: Period;
  since: number | null;
  page: number;
  pageSize: number;
  total: number;
  entries: LeaderboardEntry[];
}

export type SquadMemberRole = 'captain' | 'member';

export interface SquadMember {
  handle: string;
  wallet: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: SquadMemberRole;
  isPrimary: boolean;
  joinedAt: number;
}

export interface SquadCaptain {
  handle: string;
  wallet: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface SquadInvite {
  code: string;
  label: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: number | null;
  revokedAt: number | null;
  lastUsedAt: number | null;
  createdAt: number;
}

export interface SquadResponse {
  slug: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  league: string;
  verified: boolean;
  captain: SquadCaptain | null;
  members: SquadMember[];
  memberCount: number;
  socials: SocialAccount[];
  invite: SquadInvite | null;
  createdAt: number;
  updatedAt: number;
}

export type SquadStatsResponse = ProfileStatsResponse;

export interface AcceptInviteRequest {
  setPrimary?: boolean;
}

export interface CreateSquadRequest {
  slug: string;
  name: string;
}

export interface CreateSquadInviteRequest {
  label?: string;
  maxUses?: number;
  expiresAt?: number;
}
