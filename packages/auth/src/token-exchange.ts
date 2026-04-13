import { AuthError } from './errors.js';

export interface TokenResponse {
  token: string;
  expires_at: number;
  wallet: string;
  user_id: string;
  email?: string;
}

export async function exchangeCode(
  tokenUrl: URL,
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: codeVerifier }),
    });
  } catch (err) {
    throw new AuthError(`token endpoint unreachable: ${(err as Error).message}`);
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {}
    throw new AuthError(`token exchange failed: ${detail}`);
  }

  let body: TokenResponse;
  try {
    body = (await res.json()) as TokenResponse;
  } catch {
    throw new AuthError('token endpoint returned non-JSON response');
  }

  if (!body.token || typeof body.token !== 'string') {
    throw new AuthError('token endpoint missing token field');
  }
  if (!body.wallet || typeof body.wallet !== 'string') {
    throw new AuthError('token endpoint missing wallet field');
  }
  if (!body.user_id || typeof body.user_id !== 'string') {
    throw new AuthError('token endpoint missing user_id field');
  }
  if (typeof body.expires_at !== 'number') {
    throw new AuthError('token endpoint missing expires_at field');
  }
  return body;
}
