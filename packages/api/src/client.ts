import { ApiError } from './errors.js';
import type {
  ProfileResponse,
  ReceiptSubmitResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  RevokeTokenRequest,
  SignedReceipt,
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

  const post = async (path: string, body: unknown, bearer?: string): Promise<unknown> => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (bearer) headers['authorization'] = `Bearer ${bearer}`;
    return parseResponse(
      await safeFetch(fetchImpl, new URL(path, baseUrl), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
    );
  };

  const get = async (path: string, bearer?: string): Promise<unknown> => {
    const headers: Record<string, string> = {};
    if (bearer) headers['authorization'] = `Bearer ${bearer}`;
    return parseResponse(await safeFetch(fetchImpl, new URL(path, baseUrl), { headers }));
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
