import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AuthError } from './errors.js';

export interface Callback {
  token: string;
  userId: string;
  wallet: string;
  email?: string;
}

const HEADERS = {
  'content-type': 'text/plain; charset=utf-8',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
};

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function parseCallback(q: URLSearchParams, expectedState: string): Callback | string {
  const state = q.get('state');
  if (!state || !safeEqual(state, expectedState)) return 'state mismatch';
  const error = q.get('error');
  if (error) return error;
  const token = q.get('token');
  const userId = q.get('userId');
  const wallet = q.get('wallet');
  if (!token || !userId || !wallet) return 'missing token, userId or wallet';
  return { token, userId, wallet, email: q.get('email') ?? undefined };
}

export async function listen(expectedState: string) {
  let resolve!: (c: Callback) => void;
  let reject!: (e: Error) => void;
  const result = new Promise<Callback>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  result.catch(() => {});

  let expectedHost = '';
  let settled = false;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/callback') return void res.writeHead(404).end();

    const send = (status: number, body: string): void => void res.writeHead(status, HEADERS).end(body);

    if (req.headers.host !== expectedHost) return send(400, 'bad host');
    if (settled) return send(409, 'already completed');

    const parsed = parseCallback(url.searchParams, expectedState);
    settled = true;
    if (typeof parsed === 'string') {
      send(400, parsed);
      reject(new AuthError(parsed));
    } else {
      send(200, 'signed in — you can close this tab');
      resolve(parsed);
    }
  });

  await new Promise<void>((res, rej) => {
    const onErr = (e: Error): void => rej(new AuthError(`could not bind loopback: ${e.message}`));
    server.once('error', onErr);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onErr);
      res();
    });
  });

  const { port } = server.address() as AddressInfo;
  expectedHost = `127.0.0.1:${port}`;

  return {
    url: `http://127.0.0.1:${port}/callback`,
    result,
    close: (): Promise<void> =>
      new Promise<void>((res) => {
        server.closeAllConnections();
        server.close(() => res());
      }),
  };
}
