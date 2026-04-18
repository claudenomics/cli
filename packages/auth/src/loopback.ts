import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AuthError } from './errors.js';
import { renderError, renderSuccess } from './callback-page.js';

export interface Callback {
  code: string;
  state: string;
}

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'content-security-policy':
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};

const TEXT_HEADERS = {
  'content-type': 'text/plain; charset=utf-8',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
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
  const code = q.get('code');
  if (!code) return 'missing code';
  return { code, state };
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
    if (url.pathname !== '/callback') return void res.writeHead(404, TEXT_HEADERS).end('not found');

    const sendText = (status: number, body: string): void =>
      void res.writeHead(status, TEXT_HEADERS).end(body);
    const sendHtml = (status: number, body: string): void =>
      void res.writeHead(status, HTML_HEADERS).end(body);

    if (req.headers.host !== expectedHost) return sendText(400, 'bad host');
    if (settled) return sendHtml(409, renderError('This sign-in link has already been used.'));

    const parsed = parseCallback(url.searchParams, expectedState);
    settled = true;
    if (typeof parsed === 'string') {
      sendHtml(400, renderError(parsed));
      reject(new AuthError(parsed));
    } else {
      sendHtml(200, renderSuccess());
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
