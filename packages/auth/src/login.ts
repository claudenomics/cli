import { randomBytes } from 'node:crypto';
import { createLogger } from '@claudenomics/logger';
import { openBrowser } from './browser.js';
import { AuthError } from './errors.js';
import { listen } from './loopback.js';
import { saveSession, type Session } from './session.js';

const log = createLogger('claudenomics');
const DEFAULT_AUTH_URL = 'http://localhost:3000/cli-auth';
const TIMEOUT_MS = 5 * 60 * 1000;

export async function login(): Promise<Session> {
  const target = parseAuthUrl(process.env.CLAUDENOMICS_AUTH_URL ?? DEFAULT_AUTH_URL);
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
      token: cb.token,
      userId: cb.userId,
      wallet: cb.wallet,
      email: cb.email,
      createdAt: Date.now(),
    };
    await saveSession(session);
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
    throw new AuthError(`invalid CLAUDENOMICS_AUTH_URL: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AuthError(`CLAUDENOMICS_AUTH_URL must be http(s), got ${url.protocol}`);
  }
  return url;
}
