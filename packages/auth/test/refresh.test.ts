import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  RefreshTokenRequest,
  RefreshTokenResponse,
  RevokeTokenRequest,
  TokenBundle,
} from '@claudenomics/api';

const hoisted = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(public code: string, public status: number, message?: string) {
      super(message ?? code);
    }
  }
  return { refreshToken: vi.fn(), revokeToken: vi.fn(), ApiError };
});

vi.mock('@claudenomics/api', () => ({
  api: { refreshToken: hoisted.refreshToken, revokeToken: hoisted.revokeToken },
  ApiError: hoisted.ApiError,
}));

const mockRefresh = hoisted.refreshToken as unknown as ReturnType<
  typeof vi.fn<[RefreshTokenRequest], Promise<RefreshTokenResponse>>
>;
const mockRevoke = hoisted.revokeToken as unknown as ReturnType<
  typeof vi.fn<[RevokeTokenRequest], Promise<void>>
>;
const ApiError = hoisted.ApiError;

import { AuthError } from '../src/errors.js';
import { createRefresher } from '../src/refresh.js';
import type { Session, SessionStore, SessionTokens } from '../src/session-store.js';

function makeStore(initial?: { session: Session; tokens: SessionTokens }): SessionStore & {
  calls: { save: number; clear: number; lock: number };
} {
  let session = initial?.session ?? null;
  let tokens = initial?.tokens ?? null;
  const calls = { save: 0, clear: 0, lock: 0 };
  let chain: Promise<unknown> = Promise.resolve();
  return {
    calls,
    async load() {
      return session;
    },
    async save(s, t) {
      session = s;
      tokens = t;
      calls.save++;
    },
    async clear() {
      const had = session !== null;
      session = null;
      tokens = null;
      calls.clear++;
      return had;
    },
    async getTokens() {
      return tokens;
    },
    async withLock<T>(fn: () => Promise<T>): Promise<T> {
      calls.lock++;
      const next = chain.then(fn);
      chain = next.catch(() => undefined);
      return next;
    },
  };
}

function bundle(overrides: Partial<TokenBundle> = {}): RefreshTokenResponse {
  const now = Date.now();
  return {
    token: 'new-access',
    expiresAt: now + 3_600_000,
    refreshToken: 'crn_refresh_NEW',
    refreshExpiresAt: now + 30 * 24 * 3_600_000,
    wallet: 'W',
    userId: 'U',
    ...overrides,
  };
}

function seed(overrides: Partial<Session> = {}): { session: Session; tokens: SessionTokens } {
  return {
    session: {
      version: 2,
      userId: 'U',
      wallet: 'W',
      createdAt: Date.now(),
      expiresAt: Date.now() + 3_600_000,
      refreshExpiresAt: Date.now() + 30 * 24 * 3_600_000,
      ...overrides,
    },
    tokens: { accessToken: 'current', refreshToken: 'crn_refresh_CURRENT' },
  };
}

beforeEach(() => {
  mockRefresh.mockReset();
  mockRevoke.mockReset();
});

describe('getAccessToken', () => {
  it('returns null when there is no session', async () => {
    const r = createRefresher(makeStore());
    expect(await r.getAccessToken()).toBeNull();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('returns the current token when far from expiry', async () => {
    const r = createRefresher(makeStore(seed()));
    expect(await r.getAccessToken()).toBe('current');
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('refreshes when within the skew window', async () => {
    const r = createRefresher(makeStore(seed({ expiresAt: Date.now() + 10_000 })));
    mockRefresh.mockResolvedValue(bundle());
    expect(await r.getAccessToken()).toBe('new-access');
    expect(mockRefresh).toHaveBeenCalledWith({ refreshToken: 'crn_refresh_CURRENT' });
  });
});

describe('forceRefresh', () => {
  it('rotates the stored tokens on success', async () => {
    const store = makeStore(seed());
    const r = createRefresher(store);
    mockRefresh.mockResolvedValue(bundle({ token: 'rotated', refreshToken: 'crn_refresh_R2' }));
    await r.forceRefresh();
    expect(await store.getTokens()).toEqual({
      accessToken: 'rotated',
      refreshToken: 'crn_refresh_R2',
    });
  });

  it('dedupes concurrent calls', async () => {
    const r = createRefresher(makeStore(seed()));
    let resolve!: (v: RefreshTokenResponse) => void;
    mockRefresh.mockReturnValue(new Promise<RefreshTokenResponse>((res) => (resolve = res)));
    const p = Promise.all([r.forceRefresh(), r.forceRefresh(), r.forceRefresh()]);
    await new Promise((r) => setImmediate(r));
    resolve(bundle());
    await p;
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it.each([400, 401, 404, 405])('clears the session on %i', async (status) => {
    const store = makeStore(seed());
    const r = createRefresher(store);
    mockRefresh.mockRejectedValue(new ApiError('unauthorized', status));
    await expect(r.forceRefresh()).rejects.toBeInstanceOf(AuthError);
    expect(store.calls.clear).toBe(1);
  });

  it('preserves the session on network errors', async () => {
    const store = makeStore(seed());
    const r = createRefresher(store);
    mockRefresh.mockRejectedValue(new ApiError('unknown', 0, 'boom'));
    await expect(r.forceRefresh()).rejects.toBeInstanceOf(ApiError);
    expect(store.calls.clear).toBe(0);
  });

  it('bails inside the lock when another process already rotated tokens', async () => {
    const store = makeStore(seed());
    const r = createRefresher(store);
    mockRefresh.mockResolvedValue(bundle());
    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    const originalWithLock = store.withLock.bind(store);
    store.withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
      await gate;
      return originalWithLock(fn);
    };
    const p = r.forceRefresh();
    await new Promise((r) => setImmediate(r));
    await store.save(seed().session, {
      accessToken: 'sibling',
      refreshToken: 'crn_refresh_SIBLING',
    });
    store.calls.save = 0;
    release();
    await p;
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(store.calls.save).toBe(0);
    expect((await store.getTokens())?.refreshToken).toBe('crn_refresh_SIBLING');
  });
});

describe('logout', () => {
  it('revokes server-side and clears local state', async () => {
    const store = makeStore(seed());
    const r = createRefresher(store);
    mockRevoke.mockResolvedValue(undefined);
    expect(await r.logout()).toBe(true);
    expect(mockRevoke).toHaveBeenCalledWith({ refreshToken: 'crn_refresh_CURRENT' });
    expect(store.calls.clear).toBe(1);
  });

  it('clears locally even when revoke throws', async () => {
    const store = makeStore(seed());
    const r = createRefresher(store);
    mockRevoke.mockRejectedValue(new ApiError('revoke_failed', 500));
    expect(await r.logout()).toBe(true);
    expect(store.calls.clear).toBe(1);
  });

  it('returns false when there is nothing to clear', async () => {
    const r = createRefresher(makeStore());
    expect(await r.logout()).toBe(false);
    expect(mockRevoke).not.toHaveBeenCalled();
  });
});
