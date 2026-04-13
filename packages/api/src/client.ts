import { ApiError } from './errors.js';
import type {
  ReceiptSubmitResponse,
  SignedReceipt,
  TokenExchangeRequest,
  TokenExchangeResponse,
  UsageResponse,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.claudenomics.xyz';

export interface ApiClientOptions {
  baseUrl?: string | URL;
  tokenProvider?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

interface Internal {
  baseUrl: URL;
  exchangeToken(req: TokenExchangeRequest): Promise<TokenExchangeResponse>;
  submitReceipt(signed: SignedReceipt): Promise<ReceiptSubmitResponse>;
  getUsage(wallet: string): Promise<UsageResponse>;
}

let client: Internal | null = null;

export function configureApi(opts: ApiClientOptions = {}): void {
  client = build(opts);
}

function getClient(): Internal {
  return client ?? (client = build());
}

export const api = {
  exchangeToken: (req: TokenExchangeRequest): Promise<TokenExchangeResponse> => getClient().exchangeToken(req),
  submitReceipt: (signed: SignedReceipt): Promise<ReceiptSubmitResponse> => getClient().submitReceipt(signed),
  getUsage: (wallet: string): Promise<UsageResponse> => getClient().getUsage(wallet),
};

export function getApiBaseUrl(): URL {
  return getClient().baseUrl;
}

function build(opts: ApiClientOptions = {}): Internal {
  const baseUrl = resolveBaseUrl(opts.baseUrl);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const tokenProvider = opts.tokenProvider;

  const requireToken = async (): Promise<string> => {
    if (!tokenProvider) throw new ApiError('no_session', 401, 'no token provider configured');
    const token = await tokenProvider();
    if (!token) throw new ApiError('no_session', 401, 'no session token available');
    return token;
  };

  const post = async (path: string, body: unknown, bearer?: string): Promise<unknown> => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (bearer) headers['authorization'] = `Bearer ${bearer}`;
    return parseResponse(await safeFetch(fetchImpl, new URL(path, baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }));
  };

  const get = async (path: string, bearer?: string): Promise<unknown> => {
    const headers: Record<string, string> = {};
    if (bearer) headers['authorization'] = `Bearer ${bearer}`;
    return parseResponse(await safeFetch(fetchImpl, new URL(path, baseUrl), { headers }));
  };

  return {
    baseUrl,

    async exchangeToken(req) {
      const raw = (await post('/api/token', { code: req.code, code_verifier: req.codeVerifier })) as {
        token: string;
        expires_at: number;
        wallet: string;
        user_id: string;
        email?: string;
      };
      return {
        token: raw.token,
        expiresAt: raw.expires_at,
        wallet: raw.wallet,
        userId: raw.user_id,
        ...(raw.email ? { email: raw.email } : {}),
      };
    },

    async submitReceipt(signed) {
      const token = await requireToken();
      return (await post('/api/receipts', signed, token)) as ReceiptSubmitResponse;
    },

    async getUsage(wallet) {
      const token = await requireToken();
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
