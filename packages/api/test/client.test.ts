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

  it('getMe GETs /api/profile/me with bearer and maps the shape', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('abc');
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        handle: 'alice',
        wallet: 'W',
        display_name: 'Alice',
        bio: null,
        avatar_url: null,
        email: 'a@b.c',
        league: 'bronze',
        created_at: 1,
        updated_at: 2,
        socials: [
          {
            provider: 'x',
            handle: 'aliceonx',
            display_name: 'Alice on X',
            connected_at: 3,
          },
        ],
      }),
    );
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
    });
    const res = await api.getMe();
    expect(res.handle).toBe('alice');
    expect(res.email).toBe('a@b.c');
    expect(res.league).toBe('bronze');
    expect(res.socials).toHaveLength(1);
    expect(res.socials[0]).toMatchObject({
      provider: 'x',
      handle: 'aliceonx',
      displayName: 'Alice on X',
      connectedAt: 3,
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${BASE}/api/profile/me`);
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer abc');
  });

  it('patchMe PATCHes /api/profile/me with snake_case body', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('abc');
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        handle: 'alice',
        wallet: 'W',
        display_name: 'New Name',
        bio: 'hi',
        avatar_url: null,
        email: 'a@b.c',
        league: 'bronze',
        created_at: 1,
        updated_at: 2,
        socials: [],
      }),
    );
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
    });
    const res = await api.patchMe({ displayName: 'New Name', bio: 'hi' });
    expect(res.displayName).toBe('New Name');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${BASE}/api/profile/me`);
    expect(init!.method).toBe('PATCH');
    expect(JSON.parse((init!.body as string) ?? '{}')).toEqual({
      display_name: 'New Name',
      bio: 'hi',
    });
  });

  it('getPublicProfile strips leading @ and URL-encodes the handle', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        handle: 'alice',
        wallet: 'W',
        display_name: null,
        bio: null,
        avatar_url: null,
        league: 'bronze',
        created_at: 1,
        updated_at: 2,
        socials: [],
      }),
    );
    configureApi({ baseUrl: BASE, fetchImpl: fetchMock as unknown as typeof fetch });
    const res = await api.getPublicProfile('@alice');
    expect(res.handle).toBe('alice');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${BASE}/api/profile/alice`);
    expect((init!.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('getPublicProfile passes bearer if a tokenProvider is available', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('abc');
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        handle: 'alice',
        wallet: 'W',
        display_name: null,
        bio: null,
        avatar_url: null,
        league: 'bronze',
        created_at: 1,
        updated_at: 2,
        socials: [],
      }),
    );
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
    });
    await api.getPublicProfile('alice');
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer abc');
  });

  it('getProfileStats sends period query param and maps the shape', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        period: 'week',
        since: 100,
        totals: { input_tokens: 1000, output_tokens: 200, receipt_count: 5 },
        total_session_hours: 3.25,
        models: [{ model: 'claude-sonnet-4-6', input_tokens: 800, output_tokens: 150, receipt_count: 4 }],
        providers: [{ upstream: 'anthropic', input_tokens: 1000, output_tokens: 200, receipt_count: 5 }],
      }),
    );
    configureApi({ baseUrl: BASE, fetchImpl: fetchMock as unknown as typeof fetch });
    const res = await api.getProfileStats('alice', 'week');
    expect(res.period).toBe('week');
    expect(res.totals).toEqual({ inputTokens: 1000, outputTokens: 200, receiptCount: 5 });
    expect(res.totalSessionHours).toBeCloseTo(3.25);
    expect(res.models[0]).toEqual({
      model: 'claude-sonnet-4-6',
      inputTokens: 800,
      outputTokens: 150,
      receiptCount: 4,
    });
    expect(res.providers[0]).toEqual({
      upstream: 'anthropic',
      inputTokens: 1000,
      outputTokens: 200,
      receiptCount: 5,
    });
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${BASE}/api/profile/alice/stats?period=week`);
  });

  it('getProfileStats omits the period query when not given', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        period: 'all',
        since: null,
        totals: { input_tokens: 0, output_tokens: 0, receipt_count: 0 },
        total_session_hours: 0,
        models: [],
        providers: [],
      }),
    );
    configureApi({ baseUrl: BASE, fetchImpl: fetchMock as unknown as typeof fetch });
    await api.getProfileStats('alice');
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${BASE}/api/profile/alice/stats`);
  });

  it('getLeaderboard builds the query string and maps the shape', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        view: 'builders',
        period: 'week',
        since: 1,
        page: 2,
        page_size: 10,
        total: 23,
        entries: [
          {
            rank: 11,
            handle: 'alice',
            name: 'Alice',
            avatar_url: null,
            verified: true,
            league: 'bronze',
            tokens_burned: 1200,
            input_tokens: 1000,
            output_tokens: 200,
            receipt_count: 5,
            model: 'claude-sonnet-4-6',
            providers: ['anthropic'],
            tokens_mined: 0,
            total_session_hours: 1.5,
            spend_series: [],
          },
        ],
      }),
    );
    configureApi({ baseUrl: BASE, fetchImpl: fetchMock as unknown as typeof fetch });
    const res = await api.getLeaderboard({ view: 'builders', period: 'week', page: 2, pageSize: 10 });
    expect(res.total).toBe(23);
    expect(res.pageSize).toBe(10);
    expect(res.entries[0]).toMatchObject({
      rank: 11,
      handle: 'alice',
      name: 'Alice',
      tokensBurned: 1200,
      receiptCount: 5,
      model: 'claude-sonnet-4-6',
      providers: ['anthropic'],
    });
    const [url] = fetchMock.mock.calls[0]!;
    const u = new URL(String(url));
    expect(u.pathname).toBe('/api/leaderboard');
    expect(u.searchParams.get('view')).toBe('builders');
    expect(u.searchParams.get('period')).toBe('week');
    expect(u.searchParams.get('page')).toBe('2');
    expect(u.searchParams.get('page_size')).toBe('10');
  });

  it('getPublicProfile maps 404 to ApiError(not_found, 404)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'not_found' }));
    configureApi({ baseUrl: BASE, fetchImpl: fetchMock as unknown as typeof fetch });
    await expect(api.getPublicProfile('ghost')).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    });
  });

  function squadPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      slug: 'degen',
      name: 'Degen Lab',
      bio: null,
      avatar_url: null,
      league: 'bronze',
      verified: true,
      captain: {
        handle: 'alice',
        wallet: 'W',
        display_name: 'Alice',
        avatar_url: null,
      },
      members: [
        {
          handle: 'alice',
          wallet: 'W',
          display_name: 'Alice',
          avatar_url: null,
          role: 'captain',
          is_primary: true,
          joined_at: 1,
        },
        {
          handle: 'bob',
          wallet: 'W2',
          display_name: null,
          avatar_url: null,
          role: 'member',
          is_primary: false,
          joined_at: 2,
        },
      ],
      member_count: 2,
      socials: [
        { provider: 'x', handle: 'degenlab', display_name: 'Degen Lab', connected_at: 3 },
      ],
      invite: null,
      created_at: 1,
      updated_at: 2,
      ...overrides,
    };
  }

  it('getSquad GETs /api/squads/{slug} and maps the shape', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, squadPayload()));
    configureApi({ baseUrl: BASE, fetchImpl: fetchMock as unknown as typeof fetch });
    const res = await api.getSquad('degen');
    expect(res.slug).toBe('degen');
    expect(res.verified).toBe(true);
    expect(res.memberCount).toBe(2);
    expect(res.captain).toMatchObject({ handle: 'alice' });
    expect(res.members[0]).toMatchObject({
      handle: 'alice',
      role: 'captain',
      isPrimary: true,
      joinedAt: 1,
    });
    expect(res.members[1]).toMatchObject({
      handle: 'bob',
      role: 'member',
      isPrimary: false,
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${BASE}/api/squads/degen`);
    expect((init!.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('getSquad passes bearer when a tokenProvider is configured', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('abc');
    fetchMock.mockResolvedValue(jsonResponse(200, squadPayload()));
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
    });
    await api.getSquad('degen');
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer abc');
  });

  it('getSquadStats sends period query param', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        period: 'month',
        since: 1,
        totals: { input_tokens: 1, output_tokens: 2, receipt_count: 1 },
        total_session_hours: 0.5,
        models: [],
        providers: [],
      }),
    );
    configureApi({ baseUrl: BASE, fetchImpl: fetchMock as unknown as typeof fetch });
    const res = await api.getSquadStats('degen', 'month');
    expect(res.period).toBe('month');
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${BASE}/api/squads/degen/stats?period=month`);
  });

  it('leaveSquad DELETEs /api/squads/{slug}/membership with bearer on 204', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('abc');
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
    });
    await expect(api.leaveSquad('degen')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${BASE}/api/squads/degen/membership`);
    expect(init!.method).toBe('DELETE');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer abc');
  });

  it('leaveSquad maps 409 captain_cannot_leave to ApiError', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('abc');
    fetchMock.mockResolvedValue(jsonResponse(409, { error: 'captain_cannot_leave' }));
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
    });
    await expect(api.leaveSquad('degen')).rejects.toMatchObject({
      code: 'captain_cannot_leave',
      status: 409,
    });
  });

  it('acceptInvite POSTs /api/invites/{code}/accept with snake_case body and returns full squad', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('abc');
    fetchMock.mockResolvedValue(jsonResponse(200, squadPayload({ slug: 'joined-squad' })));
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
    });
    const res = await api.acceptInvite('code-123', { setPrimary: true });
    expect(res.slug).toBe('joined-squad');
    expect(res.memberCount).toBe(2);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${BASE}/api/invites/code-123/accept`);
    expect(init!.method).toBe('POST');
    expect(JSON.parse((init!.body as string) ?? '{}')).toEqual({ set_primary: true });
  });

  it('acceptInvite sends empty body when no request given', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('abc');
    fetchMock.mockResolvedValue(jsonResponse(200, squadPayload()));
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
    });
    await api.acceptInvite('code-xyz');
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init!.body as string) ?? '{}')).toEqual({});
  });

  it('acceptInvite maps squad_invite_unavailable (410) to ApiError', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('abc');
    fetchMock.mockResolvedValue(jsonResponse(410, { error: 'squad_invite_unavailable' }));
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
    });
    await expect(api.acceptInvite('revoked')).rejects.toMatchObject({
      code: 'squad_invite_unavailable',
      status: 410,
    });
  });

  it('createSquad POSTs /api/squads with slug + name and returns full squad', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('abc');
    fetchMock.mockResolvedValue(jsonResponse(201, squadPayload({ slug: 'new-squad' })));
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
    });
    const res = await api.createSquad({ slug: 'new-squad', name: 'New Squad' });
    expect(res.slug).toBe('new-squad');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${BASE}/api/squads`);
    expect(init!.method).toBe('POST');
    expect(JSON.parse((init!.body as string) ?? '{}')).toEqual({
      slug: 'new-squad',
      name: 'New Squad',
    });
  });

  it('createSquad maps 409 slug_taken to ApiError', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('abc');
    fetchMock.mockResolvedValue(jsonResponse(409, { error: 'slug_taken' }));
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
    });
    await expect(api.createSquad({ slug: 'taken', name: 'Taken' })).rejects.toMatchObject({
      code: 'slug_taken',
      status: 409,
    });
  });

  it('createSquadInvite POSTs snake_case body (max_uses, expires_at) and maps invite', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('abc');
    const createdAt = 100;
    const expiresAt = 1000;
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        code: 'inv-1',
        label: 'team',
        max_uses: 10,
        use_count: 0,
        expires_at: expiresAt,
        revoked_at: null,
        last_used_at: null,
        created_at: createdAt,
      }),
    );
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
    });
    const invite = await api.createSquadInvite('degen', {
      label: 'team',
      maxUses: 10,
      expiresAt,
    });
    expect(invite).toMatchObject({
      code: 'inv-1',
      label: 'team',
      maxUses: 10,
      useCount: 0,
      expiresAt,
      revokedAt: null,
      lastUsedAt: null,
      createdAt,
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${BASE}/api/squads/degen/invites`);
    expect(init!.method).toBe('POST');
    expect(JSON.parse((init!.body as string) ?? '{}')).toEqual({
      label: 'team',
      max_uses: 10,
      expires_at: expiresAt,
    });
  });

  it('createSquadInvite sends empty body when no options are provided', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('abc');
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        code: 'c',
        label: null,
        max_uses: null,
        use_count: 0,
        expires_at: null,
        revoked_at: null,
        last_used_at: null,
        created_at: 1,
      }),
    );
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
    });
    await api.createSquadInvite('degen');
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init!.body as string) ?? '{}')).toEqual({});
  });

  it('createSquadInvite maps 403 forbidden to ApiError', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('abc');
    fetchMock.mockResolvedValue(jsonResponse(403, { error: 'forbidden' }));
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
    });
    await expect(api.createSquadInvite('degen')).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
    });
  });

  it('revokeSquadInvite DELETEs and resolves on 204', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('abc');
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
    });
    await expect(api.revokeSquadInvite('degen', 'inv-1')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${BASE}/api/squads/degen/invites/inv-1`);
    expect(init!.method).toBe('DELETE');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer abc');
  });

  it('revokeSquadInvite maps 404 to ApiError(not_found)', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('abc');
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'not_found' }));
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
    });
    await expect(api.revokeSquadInvite('degen', 'missing')).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    });
  });

  it('getMe maps standing fields (rank, total_builders, league_progress)', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('abc');
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        handle: 'alice',
        wallet: 'W',
        display_name: null,
        bio: null,
        avatar_url: null,
        email: 'a@b.c',
        league: 'bronze',
        rank: 12,
        total_builders: 842,
        league_progress: {
          current_tokens: 1_200_000,
          next: { slug: 'silver', rank: 100 },
          required_tokens: 3_000_000,
          tokens_to_next: 1_800_000,
        },
        created_at: 1,
        updated_at: 2,
        socials: [],
      }),
    );
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
    });
    const res = await api.getMe();
    expect(res.rank).toBe(12);
    expect(res.totalBuilders).toBe(842);
    expect(res.leagueProgress).toEqual({
      currentTokens: 1_200_000,
      next: { slug: 'silver', rank: 100 },
      requiredTokens: 3_000_000,
      tokensToNext: 1_800_000,
    });
  });

  it('getMe defaults standing when payload omits it', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('abc');
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        handle: 'alice',
        wallet: 'W',
        display_name: null,
        bio: null,
        avatar_url: null,
        email: 'a@b.c',
        league: 'bronze',
        created_at: 1,
        updated_at: 2,
        socials: [],
      }),
    );
    configureApi({
      baseUrl: BASE,
      fetchImpl: fetchMock as unknown as typeof fetch,
      tokenProvider,
    });
    const res = await api.getMe();
    expect(res.rank).toBeNull();
    expect(res.totalBuilders).toBe(0);
    expect(res.leagueProgress).toEqual({
      currentTokens: 0,
      next: null,
      requiredTokens: 0,
      tokensToNext: 0,
    });
  });

  it('getPublicProfile maps null rank (no receipts yet)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        handle: 'ghost',
        wallet: 'W',
        display_name: null,
        bio: null,
        avatar_url: null,
        league: 'bronze',
        rank: null,
        total_builders: 500,
        league_progress: {
          current_tokens: 0,
          next: { slug: 'silver', rank: 100 },
          required_tokens: 3_000_000,
          tokens_to_next: 3_000_000,
        },
        created_at: 1,
        updated_at: 2,
        socials: [],
      }),
    );
    configureApi({ baseUrl: BASE, fetchImpl: fetchMock as unknown as typeof fetch });
    const res = await api.getPublicProfile('ghost');
    expect(res.rank).toBeNull();
    expect(res.totalBuilders).toBe(500);
    expect(res.leagueProgress.tokensToNext).toBe(3_000_000);
  });
});
