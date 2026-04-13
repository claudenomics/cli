import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, configureApi } from '../src/index.js';

type MockFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const BASE = 'https://api.test';

describe('@claudenomics/api client', () => {
  let fetchMock: ReturnType<typeof vi.fn<Parameters<MockFetch>, ReturnType<MockFetch>>>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it('exchangeToken unwraps the wire shape into camelCase', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        token: 'access',
        expires_at: 1000,
        refresh_token: 'refresh',
        refresh_expires_at: 2000,
        wallet: 'W',
        user_id: 'U',
        email: 'a@b.c',
      }),
    );
    configureApi({ baseUrl: BASE, fetchImpl: fetchMock as unknown as typeof fetch });
    const res = await api.exchangeToken({ code: 'c', codeVerifier: 'v' });
    expect(res).toEqual({
      token: 'access',
      expiresAt: 1000,
      refreshToken: 'refresh',
      refreshExpiresAt: 2000,
      wallet: 'W',
      userId: 'U',
      email: 'a@b.c',
    });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init!.body as string) ?? '{}')).toEqual({
      code: 'c',
      code_verifier: 'v',
    });
  });

  it('refreshToken POSTs /api/token/refresh with snake_case body', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        token: 'new',
        expires_at: 1,
        refresh_token: 'rn',
        refresh_expires_at: 2,
        wallet: 'W',
        user_id: 'U',
      }),
    );
    configureApi({ baseUrl: BASE, fetchImpl: fetchMock as unknown as typeof fetch });
    const res = await api.refreshToken({ refreshToken: 'rc' });
    expect(res.token).toBe('new');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${BASE}/api/token/refresh`);
    expect(JSON.parse((init!.body as string) ?? '{}')).toEqual({ refresh_token: 'rc' });
  });

  it('revokeToken POSTs /api/token/revoke and swallows non-2xx', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    configureApi({ baseUrl: BASE, fetchImpl: fetchMock as unknown as typeof fetch });
    await expect(api.revokeToken({ refreshToken: 'rc' })).resolves.toBeUndefined();
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${BASE}/api/token/revoke`);
  });

  it('throws ApiError on non-2xx with the backend error code', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'invalid_code' }));
    configureApi({ baseUrl: BASE, fetchImpl: fetchMock as unknown as typeof fetch });
    await expect(api.exchangeToken({ code: 'c', codeVerifier: 'v' })).rejects.toMatchObject({
      code: 'invalid_code',
      status: 401,
    });
  });

  it('wraps network errors as ApiError(unknown, 0)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    configureApi({ baseUrl: BASE, fetchImpl: fetchMock as unknown as typeof fetch });
    await expect(api.exchangeToken({ code: 'c', codeVerifier: 'v' })).rejects.toMatchObject({
      code: 'unknown',
      status: 0,
    });
  });

  it('submitReceipt retries once after a 401 when onUnauthorized is configured', async () => {
    const tokenProvider = vi.fn().mockResolvedValueOnce('stale').mockResolvedValueOnce('fresh');
    const onUnauthorized = vi.fn().mockResolvedValue(undefined);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: 'unauthorized' }))
      .mockResolvedValueOnce(jsonResponse(200, { status: 'accepted' }));
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
      onUnauthorized,
    });
    const signed = {
      receipt: {
        wallet: 'w', response_id: 'r', upstream: 'u', model: 'm',
        input_tokens: 0, output_tokens: 0, ts: 0,
      },
      sig: 's', pubkey: 'p', compose_hash: 'c',
    };
    const res = await api.submitReceipt(signed as any);
    expect(res).toEqual({ status: 'accepted' });
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(tokenProvider).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const auth0 = (fetchMock.mock.calls[0]![1]!.headers as Record<string, string>).authorization;
    const auth1 = (fetchMock.mock.calls[1]![1]!.headers as Record<string, string>).authorization;
    expect(auth0).toBe('Bearer stale');
    expect(auth1).toBe('Bearer fresh');
  });

  it('stops retrying after the second 401', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('t');
    const onUnauthorized = vi.fn().mockResolvedValue(undefined);
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'unauthorized' }));
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
      onUnauthorized,
    });
    await expect(api.getUsage('wallet')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry when onUnauthorized is not configured', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('t');
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'unauthorized' }));
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
    });
    await expect(api.getUsage('wallet')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
