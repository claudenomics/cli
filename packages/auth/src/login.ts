import { randomBytes } from 'node:crypto';
import { createLogger } from '@claudenomics/logger';
import { openBrowser } from './browser.js';
import { AuthError } from './errors.js';
import { listen } from './loopback.js';
import { saveSession, type Session } from './session.js';

const log = createLogger('claudenomics');

const DEFAULT_AUTH_URL = 'http://localhost:3000/cli-auth';
const TIMEOUT_MS = 5 * 60 * 1000;

export interface LoginOptions {
  authUrl?: string;
}

export async function login(opts: LoginOptions = {}): Promise<Session> {
  const target = parseAuthUrl(opts.authUrl ?? DEFAULT_AUTH_URL);
  if (opts.authUrl) log.warn(`using overridden auth URL ${target.origin} (dev mode)`);

  const state = randomBytes(32).toString('hex');
  const server = await listen(state);

  target.searchParams.set('callback', server.url);
  target.searchParams.set('state', state);

  log.info(`opening ${target}`);
  if (!openBrowser(target.toString())) log.warn(`could not open browser — open this URL manually: ${target}`);

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
    const session: Session = {
      version: 1,
      userId: cb.userId,
      wallet: cb.wallet,
      email: cb.email,
      createdAt: Date.now(),
      expiresAt: parseJwtExpiry(cb.token),
    };
    await saveSession(session, cb.token);
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

function parseJwtExpiry(token: string): number | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}
