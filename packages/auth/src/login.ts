import { randomBytes } from 'node:crypto';
import { api, ApiError } from '@claudenomics/api';
import { createLogger } from '@claudenomics/logger';
import { openBrowser } from './browser.js';
import { AuthError } from './errors.js';
import { verifyJwt } from './jwt.js';
import { listen } from './loopback.js';
import { createPkcePair } from './pkce.js';
import { createXdgSessionStore, type SessionStore, type Session } from './session-store.js';

const log = createLogger('claudenomics');

const TIMEOUT_MS = 5 * 60 * 1000;

export interface LoginOptions {
  authUrl?: string;
  sessionStore?: SessionStore;
}

interface JwtVerifyConfig {
  jwksUrl: string;
  issuer: string;
  audience?: string;
}

function loadJwtConfig(): JwtVerifyConfig | null {
  const jwksUrl = process.env.CLAUDENOMICS_JWKS_URL;
  const issuer = process.env.CLAUDENOMICS_JWT_ISSUER;
  if (!jwksUrl || !issuer) return null;
  const cfg: JwtVerifyConfig = { jwksUrl, issuer };
  const audience = process.env.CLAUDENOMICS_JWT_AUDIENCE;
  if (audience) cfg.audience = audience;
  return cfg;
}

function resolveAuthUrl(opts: LoginOptions): string {
  if (opts.authUrl) return opts.authUrl;
  const env = process.env.CLAUDENOMICS_AUTH_URL;
  if (env) return env;
  throw new AuthError(
    'no auth URL configured — set CLAUDENOMICS_AUTH_URL or pass --auth-url',
  );
}

export async function login(opts: LoginOptions = {}): Promise<Session> {
  const store = opts.sessionStore ?? createXdgSessionStore();
  const target = parseAuthUrl(resolveAuthUrl(opts));
  const override = opts.authUrl !== undefined;
  if (override) log.warn(`using overridden auth URL ${target.origin} (dev mode)`);

  const state = randomBytes(32).toString('hex');
  const pkce = createPkcePair();
  const server = await listen(state);

  target.searchParams.set('callback', server.url);
  target.searchParams.set('state', state);
  target.searchParams.set('code_challenge', pkce.challenge);
  target.searchParams.set('code_challenge_method', pkce.method);

  log.info(`opening ${target.origin}${target.pathname}`);
  if (!openBrowser(target.toString())) log.warn('could not open browser — check stderr for the URL');

  let timer: NodeJS.Timeout | undefined;
  const onSigint = (): void => {
    server.close().finally(() => process.exit(130));
  };
  process.once('SIGINT', onSigint);

  try {
    const cb = await Promise.race([
      server.result,
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new AuthError('login timed out after 5m')), TIMEOUT_MS);
      }),
    ]);

    let exchanged;
    try {
      exchanged = await api.exchangeToken({ code: cb.code, codeVerifier: pkce.verifier });
    } catch (err) {
      if (err instanceof ApiError) throw new AuthError(`token exchange failed: ${err.code}`);
      throw new AuthError(`token endpoint unreachable: ${(err as Error).message}`);
    }

    const jwtCfg = loadJwtConfig();
    if (jwtCfg) {
      try {
        await verifyJwt(exchanged.token, jwtCfg);
      } catch (err) {
        throw new AuthError(`token failed JWT verification: ${(err as Error).message}`);
      }
    } else if (!override) {
      throw new AuthError(
        'CLAUDENOMICS_JWKS_URL and CLAUDENOMICS_JWT_ISSUER must be set for production logins',
      );
    } else {
      log.warn('JWT verification skipped (dev-override auth URL, no JWKS config)');
    }

    const session: Session = {
      version: 2,
      userId: exchanged.userId,
      wallet: exchanged.wallet,
      ...(exchanged.email ? { email: exchanged.email } : {}),
      createdAt: Date.now(),
      expiresAt: exchanged.expiresAt,
      refreshExpiresAt: exchanged.refreshExpiresAt,
    };
    await store.save(session, {
      accessToken: exchanged.token,
      refreshToken: exchanged.refreshToken,
    });
    return session;
  } finally {
    process.off('SIGINT', onSigint);
    if (timer) clearTimeout(timer);
    await server.close();
  }
}

function parseAuthUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AuthError(`invalid auth URL: ${raw}`);
  }
  if (url.protocol === 'https:') return url;
  if (url.protocol === 'http:' && isLoopbackHost(url.hostname)) return url;
  throw new AuthError(
    `auth URL must be https (or http on loopback for dev), got ${url.protocol}//${url.hostname}`,
  );
}

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}
