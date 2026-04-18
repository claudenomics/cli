import { api, ApiError } from '@claudenomics/api';
import { AuthError } from './errors.js';
import {
  createXdgSessionStore,
  type Session,
  type SessionStore,
} from './session-store.js';

const SKEW_MS = 60_000;
const CLEAR_ON_STATUSES = new Set([400, 401, 404, 405]);

export interface Refresher {
  load(): Promise<Session | null>;
  getAccessToken(opts?: { skewMs?: number }): Promise<string | null>;
  forceRefresh(): Promise<void>;
  logout(): Promise<boolean>;
}

export function createRefresher(store: SessionStore): Refresher {
  let inflight: Promise<void> | null = null;

  async function doRefresh(): Promise<void> {
    const preSession = await store.load();
    if (!preSession) throw new AuthError('not signed in');
    const preTokens = await store.getTokens();
    if (!preTokens) {
      await store.clear();
      throw new AuthError('session has no tokens — run `claudenomics login`');
    }
    await store.withLock(async () => {
      const session = await store.load();
      const tokens = await store.getTokens();
      if (!session || !tokens) return;
      if (tokens.refreshToken !== preTokens.refreshToken) return;
      try {
        const r = await api.refreshToken({ refreshToken: tokens.refreshToken });
        await store.save(
          {
            version: 2,
            userId: r.userId,
            wallet: r.wallet,
            ...(r.email ? { email: r.email } : {}),
            createdAt: session.createdAt,
            expiresAt: r.expiresAt,
            refreshExpiresAt: r.refreshExpiresAt,
          },
          { accessToken: r.token, refreshToken: r.refreshToken },
        );
      } catch (err) {
        if (err instanceof ApiError && CLEAR_ON_STATUSES.has(err.status)) {
          await store.clear();
          throw new AuthError('session expired — run `claudenomics login`');
        }
        throw err;
      }
    });
  }

  async function forceRefresh(): Promise<void> {
    if (inflight) return inflight;
    inflight = doRefresh().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function getAccessToken(opts: { skewMs?: number } = {}): Promise<string | null> {
    const session = await store.load();
    if (!session) return null;
    const skew = opts.skewMs ?? SKEW_MS;
    if (session.expiresAt - Date.now() <= skew) await forceRefresh();
    return (await store.getTokens())?.accessToken ?? null;
  }

  async function logout(): Promise<boolean> {
    const tokens = await store.getTokens();
    if (tokens) {
      try {
        await api.revokeToken({ refreshToken: tokens.refreshToken });
      } catch {}
    }
    return store.clear();
  }

  return { load: () => store.load(), getAccessToken, forceRefresh, logout };
}

let defaultRefresher: Refresher | null = null;
let defaultStore: SessionStore | null = null;

function getStore(): SessionStore {
  return (defaultStore ??= createXdgSessionStore());
}

function getRefresher(): Refresher {
  return (defaultRefresher ??= createRefresher(getStore()));
}

export const loadSession = (): Promise<Session | null> => getRefresher().load();
export const getSessionToken = (opts?: { skewMs?: number }): Promise<string | null> =>
  getRefresher().getAccessToken(opts);
export const forceRefresh = (): Promise<void> => getRefresher().forceRefresh();
export const logout = (): Promise<boolean> => getRefresher().logout();
