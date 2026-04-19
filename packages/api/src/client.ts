import { ApiError } from './errors.js';
import type {
  AcceptInviteRequest,
  CreateSquadInviteRequest,
  CreateSquadRequest,
  LeaderboardEntry,
  LeaderboardQuery,
  LeaderboardResponse,
  LeaderboardView,
  LeagueProgress,
  LeagueProgressNext,
  ModelBreakdown,
  Period,
  ProfileMeResponse,
  ProfilePatchRequest,
  ProfileResponse,
  ProfileStatsResponse,
  ProviderBreakdown,
  PublicProfileResponse,
  ReceiptSubmitResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  RevokeTokenRequest,
  SignedReceipt,
  SocialAccount,
  SquadCaptain,
  SquadInvite,
  SquadMember,
  SquadResponse,
  SquadStatsResponse,
  StatsTotals,
  TokenBundle,
  TokenExchangeRequest,
  TokenExchangeResponse,
  UsageResponse,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.claudenomics.xyz';

export interface ApiClientOptions {
  baseUrl?: string | URL;
  tokenProvider?: () => Promise<string | null>;
  onUnauthorized?: () => Promise<void>;
  fetchImpl?: typeof fetch;
}

interface Internal {
  baseUrl: URL;
  exchangeToken(req: TokenExchangeRequest): Promise<TokenExchangeResponse>;
  refreshToken(req: RefreshTokenRequest): Promise<RefreshTokenResponse>;
  revokeToken(req: RevokeTokenRequest): Promise<void>;
  submitReceipt(signed: SignedReceipt): Promise<ReceiptSubmitResponse>;
  getUsage(wallet: string): Promise<UsageResponse>;
  getProfile(wallet: string): Promise<ProfileResponse>;
  getMe(): Promise<ProfileMeResponse>;
  patchMe(req: ProfilePatchRequest): Promise<ProfileMeResponse>;
  getPublicProfile(handle: string): Promise<PublicProfileResponse>;
  getProfileStats(handle: string, period?: Period): Promise<ProfileStatsResponse>;
  getLeaderboard(query?: LeaderboardQuery): Promise<LeaderboardResponse>;
  getSquad(slug: string): Promise<SquadResponse>;
  getSquadStats(slug: string, period?: Period): Promise<SquadStatsResponse>;
  leaveSquad(slug: string): Promise<void>;
  acceptInvite(code: string, req?: AcceptInviteRequest): Promise<SquadResponse>;
  createSquad(req: CreateSquadRequest): Promise<SquadResponse>;
  createSquadInvite(slug: string, req?: CreateSquadInviteRequest): Promise<SquadInvite>;
  revokeSquadInvite(slug: string, code: string): Promise<void>;
}

let client: Internal | null = null;

export function configureApi(opts: ApiClientOptions = {}): void {
  client = build(opts);
}

function getClient(): Internal {
  return client ?? (client = build());
}

export const api = {
  exchangeToken: (req: TokenExchangeRequest): Promise<TokenExchangeResponse> =>
    getClient().exchangeToken(req),
  refreshToken: (req: RefreshTokenRequest): Promise<RefreshTokenResponse> =>
    getClient().refreshToken(req),
  revokeToken: (req: RevokeTokenRequest): Promise<void> => getClient().revokeToken(req),
  submitReceipt: (signed: SignedReceipt): Promise<ReceiptSubmitResponse> =>
    getClient().submitReceipt(signed),
  getUsage: (wallet: string): Promise<UsageResponse> => getClient().getUsage(wallet),
  getProfile: (wallet: string): Promise<ProfileResponse> => getClient().getProfile(wallet),
  getMe: (): Promise<ProfileMeResponse> => getClient().getMe(),
  patchMe: (req: ProfilePatchRequest): Promise<ProfileMeResponse> => getClient().patchMe(req),
  getPublicProfile: (handle: string): Promise<PublicProfileResponse> =>
    getClient().getPublicProfile(handle),
  getProfileStats: (handle: string, period?: Period): Promise<ProfileStatsResponse> =>
    getClient().getProfileStats(handle, period),
  getLeaderboard: (query?: LeaderboardQuery): Promise<LeaderboardResponse> =>
    getClient().getLeaderboard(query),
  getSquad: (slug: string): Promise<SquadResponse> => getClient().getSquad(slug),
  getSquadStats: (slug: string, period?: Period): Promise<SquadStatsResponse> =>
    getClient().getSquadStats(slug, period),
  leaveSquad: (slug: string): Promise<void> => getClient().leaveSquad(slug),
  acceptInvite: (code: string, req?: AcceptInviteRequest): Promise<SquadResponse> =>
    getClient().acceptInvite(code, req),
  createSquad: (req: CreateSquadRequest): Promise<SquadResponse> =>
    getClient().createSquad(req),
  createSquadInvite: (slug: string, req?: CreateSquadInviteRequest): Promise<SquadInvite> =>
    getClient().createSquadInvite(slug, req),
  revokeSquadInvite: (slug: string, code: string): Promise<void> =>
    getClient().revokeSquadInvite(slug, code),
};

export function getApiBaseUrl(): URL {
  return getClient().baseUrl;
}

interface RawTokenBundle {
  token: string;
  expires_at: number;
  refresh_token: string;
  refresh_expires_at: number;
  wallet: string;
  user_id: string;
  email?: string;
}

function fromRawBundle(raw: RawTokenBundle): TokenBundle {
  return {
    token: raw.token,
    expiresAt: raw.expires_at,
    refreshToken: raw.refresh_token,
    refreshExpiresAt: raw.refresh_expires_at,
    wallet: raw.wallet,
    userId: raw.user_id,
    ...(raw.email ? { email: raw.email } : {}),
  };
}

interface RawSocial {
  provider: string;
  handle: string;
  display_name?: string;
  bio?: string | null;
  avatar_url?: string | null;
  connected_at: number;
}

function fromRawSocial(raw: RawSocial): SocialAccount {
  const out: SocialAccount = {
    provider: raw.provider,
    handle: raw.handle,
    connectedAt: raw.connected_at,
  };
  if (raw.display_name !== undefined) out.displayName = raw.display_name;
  if (raw.bio !== undefined) out.bio = raw.bio;
  if (raw.avatar_url !== undefined) out.avatarUrl = raw.avatar_url;
  return out;
}

interface RawLeagueProgressNext {
  slug: string;
  rank: number;
}

interface RawLeagueProgress {
  current_tokens: number;
  next: RawLeagueProgressNext | null;
  required_tokens: number;
  tokens_to_next: number;
}

const EMPTY_LEAGUE_PROGRESS: LeagueProgress = {
  currentTokens: 0,
  next: null,
  requiredTokens: 0,
  tokensToNext: 0,
};

function fromRawLeagueProgress(raw: RawLeagueProgress | undefined | null): LeagueProgress {
  if (!raw) return EMPTY_LEAGUE_PROGRESS;
  const next: LeagueProgressNext | null = raw.next
    ? { slug: raw.next.slug, rank: raw.next.rank }
    : null;
  return {
    currentTokens: raw.current_tokens,
    next,
    requiredTokens: raw.required_tokens,
    tokensToNext: raw.tokens_to_next,
  };
}

interface RawPublicProfile {
  handle: string;
  wallet: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  league: string;
  rank?: number | null;
  total_builders?: number;
  league_progress?: RawLeagueProgress | null;
  created_at: number;
  updated_at: number;
  socials?: RawSocial[];
}

function fromRawPublicProfile(raw: RawPublicProfile): PublicProfileResponse {
  return {
    handle: raw.handle,
    wallet: raw.wallet,
    displayName: raw.display_name,
    bio: raw.bio,
    avatarUrl: raw.avatar_url,
    league: raw.league,
    rank: raw.rank ?? null,
    totalBuilders: raw.total_builders ?? 0,
    leagueProgress: fromRawLeagueProgress(raw.league_progress),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    socials: (raw.socials ?? []).map(fromRawSocial),
  };
}

interface RawMeProfile extends RawPublicProfile {
  email: string;
}

function fromRawMeProfile(raw: RawMeProfile): ProfileMeResponse {
  return { ...fromRawPublicProfile(raw), email: raw.email };
}

interface RawBreakdown {
  input_tokens: number;
  output_tokens: number;
  receipt_count: number;
}

interface RawModelBreakdown extends RawBreakdown {
  model: string;
}

interface RawProviderBreakdown extends RawBreakdown {
  upstream: string;
}

function fromRawTotals(raw: RawBreakdown): StatsTotals {
  return {
    inputTokens: raw.input_tokens,
    outputTokens: raw.output_tokens,
    receiptCount: raw.receipt_count,
  };
}

function fromRawModel(raw: RawModelBreakdown): ModelBreakdown {
  return { model: raw.model, ...fromRawTotals(raw) };
}

function fromRawProvider(raw: RawProviderBreakdown): ProviderBreakdown {
  return { upstream: raw.upstream, ...fromRawTotals(raw) };
}

interface RawProfileStats {
  period: Period;
  since: number | null;
  totals: RawBreakdown;
  total_session_hours: number;
  models: RawModelBreakdown[];
  providers: RawProviderBreakdown[];
}

function fromRawProfileStats(raw: RawProfileStats): ProfileStatsResponse {
  return {
    period: raw.period,
    since: raw.since,
    totals: fromRawTotals(raw.totals),
    totalSessionHours: raw.total_session_hours,
    models: (raw.models ?? []).map(fromRawModel),
    providers: (raw.providers ?? []).map(fromRawProvider),
  };
}

interface RawLeaderboardEntry {
  rank: number;
  handle: string;
  name: string | null;
  avatar_url: string | null;
  verified: boolean;
  league: string;
  tokens_burned: number;
  input_tokens: number;
  output_tokens: number;
  receipt_count: number;
  model: string | null;
  providers: string[];
  tokens_mined: number;
  total_session_hours: number;
  spend_series: number[];
}

function fromRawLeaderboardEntry(raw: RawLeaderboardEntry): LeaderboardEntry {
  return {
    rank: raw.rank,
    handle: raw.handle,
    name: raw.name,
    avatarUrl: raw.avatar_url,
    verified: raw.verified,
    league: raw.league,
    tokensBurned: raw.tokens_burned,
    inputTokens: raw.input_tokens,
    outputTokens: raw.output_tokens,
    receiptCount: raw.receipt_count,
    model: raw.model,
    providers: raw.providers ?? [],
    tokensMined: raw.tokens_mined,
    totalSessionHours: raw.total_session_hours,
    spendSeries: raw.spend_series ?? [],
  };
}

interface RawLeaderboard {
  view: LeaderboardView;
  period: Period;
  since: number | null;
  page: number;
  page_size: number;
  total: number;
  entries: RawLeaderboardEntry[];
}

function fromRawLeaderboard(raw: RawLeaderboard): LeaderboardResponse {
  return {
    view: raw.view,
    period: raw.period,
    since: raw.since,
    page: raw.page,
    pageSize: raw.page_size,
    total: raw.total,
    entries: (raw.entries ?? []).map(fromRawLeaderboardEntry),
  };
}

interface RawSquadCaptain {
  handle: string;
  wallet: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface RawSquadMember extends RawSquadCaptain {
  role: 'captain' | 'member';
  is_primary: boolean;
  joined_at: number;
}

interface RawSquadInvite {
  code: string;
  label: string | null;
  max_uses: number | null;
  use_count: number;
  expires_at: number | null;
  revoked_at: number | null;
  last_used_at: number | null;
  created_at: number;
}

interface RawSquad {
  slug: string;
  name: string;
  bio: string | null;
  avatar_url: string | null;
  league: string;
  verified?: boolean;
  captain: RawSquadCaptain | null;
  members: RawSquadMember[];
  member_count: number;
  socials?: RawSocial[];
  invite: RawSquadInvite | null;
  created_at: number;
  updated_at: number;
}

function fromRawCaptain(raw: RawSquadCaptain): SquadCaptain {
  return {
    handle: raw.handle,
    wallet: raw.wallet,
    displayName: raw.display_name,
    avatarUrl: raw.avatar_url,
  };
}

function fromRawMember(raw: RawSquadMember): SquadMember {
  return {
    ...fromRawCaptain(raw),
    role: raw.role,
    isPrimary: raw.is_primary,
    joinedAt: raw.joined_at,
  };
}

function fromRawInvite(raw: RawSquadInvite): SquadInvite {
  return {
    code: raw.code,
    label: raw.label,
    maxUses: raw.max_uses,
    useCount: raw.use_count,
    expiresAt: raw.expires_at,
    revokedAt: raw.revoked_at,
    lastUsedAt: raw.last_used_at,
    createdAt: raw.created_at,
  };
}

function fromRawSquad(raw: RawSquad): SquadResponse {
  return {
    slug: raw.slug,
    name: raw.name,
    bio: raw.bio,
    avatarUrl: raw.avatar_url,
    league: raw.league,
    verified: raw.verified ?? false,
    captain: raw.captain ? fromRawCaptain(raw.captain) : null,
    members: (raw.members ?? []).map(fromRawMember),
    memberCount: raw.member_count,
    socials: (raw.socials ?? []).map(fromRawSocial),
    invite: raw.invite ? fromRawInvite(raw.invite) : null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

function normalizeHandle(handle: string): string {
  const trimmed = handle.trim();
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== '',
  );
  if (entries.length === 0) return '';
  const qs = new URLSearchParams();
  for (const [k, v] of entries) qs.set(k, String(v));
  return `?${qs.toString()}`;
}

function build(opts: ApiClientOptions = {}): Internal {
  const baseUrl = resolveBaseUrl(opts.baseUrl);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const tokenProvider = opts.tokenProvider;
  const onUnauthorized = opts.onUnauthorized;

  const requireToken = async (): Promise<string> => {
    if (!tokenProvider) throw new ApiError('no_session', 401, 'no token provider configured');
    const token = await tokenProvider();
    if (!token) throw new ApiError('no_session', 401, 'no session token available');
    return token;
  };

  const send = async (
    method: string,
    path: string,
    body: unknown,
    bearer?: string,
  ): Promise<unknown> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (bearer) headers['authorization'] = `Bearer ${bearer}`;
    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    return parseResponse(await safeFetch(fetchImpl, new URL(path, baseUrl), init));
  };

  const post = (path: string, body: unknown, bearer?: string): Promise<unknown> =>
    send('POST', path, body, bearer);

  const patch = (path: string, body: unknown, bearer?: string): Promise<unknown> =>
    send('PATCH', path, body, bearer);

  const get = (path: string, bearer?: string): Promise<unknown> =>
    send('GET', path, undefined, bearer);

  const del = async (path: string, bearer: string): Promise<void> => {
    const res = await safeFetch(fetchImpl, new URL(path, baseUrl), {
      method: 'DELETE',
      headers: { authorization: `Bearer ${bearer}` },
    });
    if (res.ok) return;
    let code = 'unknown';
    try {
      const body = (await res.json()) as { error?: string };
      if (typeof body.error === 'string') code = body.error;
    } catch {}
    throw new ApiError(code, res.status);
  };

  const withAuthRetry = async <T>(fn: (token: string) => Promise<T>): Promise<T> => {
    const token = await requireToken();
    try {
      return await fn(token);
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401 || !onUnauthorized) throw err;
      await onUnauthorized();
      const retried = await requireToken();
      return await fn(retried);
    }
  };

  const optionalBearer = async (): Promise<string | undefined> => {
    if (!tokenProvider) return undefined;
    try {
      const t = await tokenProvider();
      return t ?? undefined;
    } catch {
      return undefined;
    }
  };

  const toSnakePatch = (req: ProfilePatchRequest): Record<string, string | null> => {
    const out: Record<string, string | null> = {};
    if (req.displayName !== undefined) out.display_name = req.displayName;
    if (req.bio !== undefined) out.bio = req.bio;
    if (req.avatarUrl !== undefined) out.avatar_url = req.avatarUrl;
    return out;
  };

  return {
    baseUrl,

    async exchangeToken(req) {
      const raw = (await post('/api/token', {
        code: req.code,
        code_verifier: req.codeVerifier,
      })) as RawTokenBundle;
      return fromRawBundle(raw);
    },

    async refreshToken(req) {
      const raw = (await post('/api/token/refresh', {
        refresh_token: req.refreshToken,
      })) as RawTokenBundle;
      return fromRawBundle(raw);
    },

    async revokeToken(req) {
      const res = await safeFetch(fetchImpl, new URL('/api/token/revoke', baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: req.refreshToken }),
      });
      if (!res.ok && res.status !== 404) throw new ApiError('revoke_failed', res.status);
    },

    async submitReceipt(signed) {
      return withAuthRetry(async (token) => (await post('/api/receipts', signed, token)) as ReceiptSubmitResponse);
    },

    async getUsage(wallet) {
      return withAuthRetry(async (token) => {
        const raw = (await get(`/api/usage/${encodeURIComponent(wallet)}`, token)) as {
          wallet: string;
          input_tokens: number;
          output_tokens: number;
          last_updated: number;
        };
        return {
          wallet: raw.wallet,
          inputTokens: raw.input_tokens,
          outputTokens: raw.output_tokens,
          lastUpdated: raw.last_updated,
        };
      });
    },

    async getProfile(wallet) {
      return withAuthRetry(async (token) => {
        const raw = (await get(`/api/profile/${encodeURIComponent(wallet)}`, token)) as {
          wallet: string;
          league?: string;
          rank?: number;
        };
        const out: ProfileResponse = { wallet: raw.wallet };
        if (typeof raw.league === 'string') out.league = raw.league;
        if (typeof raw.rank === 'number') out.rank = raw.rank;
        return out;
      });
    },

    async getMe() {
      return withAuthRetry(async (token) => {
        const raw = (await get('/api/profile/me', token)) as RawMeProfile;
        return fromRawMeProfile(raw);
      });
    },

    async patchMe(req) {
      return withAuthRetry(async (token) => {
        const raw = (await patch('/api/profile/me', toSnakePatch(req), token)) as RawMeProfile;
        return fromRawMeProfile(raw);
      });
    },

    async getPublicProfile(handle) {
      const bearer = await optionalBearer();
      const path = `/api/profile/${encodeURIComponent(normalizeHandle(handle))}`;
      const raw = (await get(path, bearer)) as RawPublicProfile;
      return fromRawPublicProfile(raw);
    },

    async getProfileStats(handle, period) {
      const bearer = await optionalBearer();
      const path = `/api/profile/${encodeURIComponent(normalizeHandle(handle))}/stats${buildQuery({ period })}`;
      const raw = (await get(path, bearer)) as RawProfileStats;
      return fromRawProfileStats(raw);
    },

    async getLeaderboard(query = {}) {
      const bearer = await optionalBearer();
      const qs = buildQuery({
        view: query.view,
        period: query.period,
        league: query.league,
        search: query.search,
        page: query.page,
        page_size: query.pageSize,
      });
      const raw = (await get(`/api/leaderboard${qs}`, bearer)) as RawLeaderboard;
      return fromRawLeaderboard(raw);
    },

    async getSquad(slug) {
      const bearer = await optionalBearer();
      const raw = (await get(`/api/squads/${encodeURIComponent(slug)}`, bearer)) as RawSquad;
      return fromRawSquad(raw);
    },

    async getSquadStats(slug, period) {
      const bearer = await optionalBearer();
      const path = `/api/squads/${encodeURIComponent(slug)}/stats${buildQuery({ period })}`;
      const raw = (await get(path, bearer)) as RawProfileStats;
      return fromRawProfileStats(raw);
    },

    async leaveSquad(slug) {
      return withAuthRetry((token) =>
        del(`/api/squads/${encodeURIComponent(slug)}/membership`, token),
      );
    },

    async acceptInvite(code, req) {
      return withAuthRetry(async (token) => {
        const body: Record<string, boolean> = {};
        if (req?.setPrimary !== undefined) body.set_primary = req.setPrimary;
        const raw = (await post(
          `/api/invites/${encodeURIComponent(code)}/accept`,
          body,
          token,
        )) as RawSquad;
        return fromRawSquad(raw);
      });
    },

    async createSquad(req) {
      return withAuthRetry(async (token) => {
        const raw = (await post(
          '/api/squads',
          { slug: req.slug, name: req.name },
          token,
        )) as RawSquad;
        return fromRawSquad(raw);
      });
    },

    async createSquadInvite(slug, req) {
      return withAuthRetry(async (token) => {
        const body: Record<string, string | number> = {};
        if (req?.label !== undefined) body.label = req.label;
        if (req?.maxUses !== undefined) body.max_uses = req.maxUses;
        if (req?.expiresAt !== undefined) body.expires_at = req.expiresAt;
        const raw = (await post(
          `/api/squads/${encodeURIComponent(slug)}/invites`,
          body,
          token,
        )) as RawSquadInvite;
        return fromRawInvite(raw);
      });
    },

    async revokeSquadInvite(slug, code) {
      return withAuthRetry((token) =>
        del(
          `/api/squads/${encodeURIComponent(slug)}/invites/${encodeURIComponent(code)}`,
          token,
        ),
      );
    },
  };
}

function resolveBaseUrl(override: string | URL | undefined): URL {
  if (override) return override instanceof URL ? override : new URL(override);
  const env = process.env.CLAUDENOMICS_API_URL;
  return new URL(env ?? DEFAULT_BASE_URL);
}

async function safeFetch(
  fetchImpl: typeof fetch,
  url: URL,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImpl(url, init);
  } catch (err) {
    throw new ApiError('unknown', 0, `network error: ${(err as Error).message}`);
  }
}

async function parseResponse(res: Response): Promise<unknown> {
  if (res.ok) {
    try {
      return await res.json();
    } catch {
      throw new ApiError('unknown', res.status, 'response was not JSON');
    }
  }
  let code: string = 'unknown';
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body.error === 'string') code = body.error;
  } catch {}
  throw new ApiError(code, res.status);
}
