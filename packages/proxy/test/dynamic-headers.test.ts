import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startProxy, type ProxyHandle } from '../src/server.js';

interface CapturedRequest {
  path: string;
  headers: Record<string, string | string[] | undefined>;
}

let upstream: Server;
let upstreamUrl: URL;
let requests: CapturedRequest[];
let proxy: ProxyHandle | null = null;

beforeEach(async () => {
  requests = [];
  upstream = createServer((req, res) => {
    requests.push({ path: req.url ?? '', headers: { ...req.headers } });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', () => resolve()));
  const addr = upstream.address() as AddressInfo;
  upstreamUrl = new URL(`http://127.0.0.1:${addr.port}`);
});

afterEach(async () => {
  if (proxy) {
    await proxy.stop();
    proxy = null;
  }
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

describe('startProxy requestHeaders', () => {
  it('calls the header function per request', async () => {
    let counter = 0;
    proxy = await startProxy({
      upstream: upstreamUrl,
      requestHeaders: async () => ({ 'x-token': `token-${++counter}` }),
    });
    await fetch(`${proxy.url}/a`);
    await fetch(`${proxy.url}/b`);
    await fetch(`${proxy.url}/c`);
    expect(requests.map((r) => r.headers['x-token'])).toEqual(['token-1', 'token-2', 'token-3']);
  });

  it('accepts a synchronous header function', async () => {
    proxy = await startProxy({
      upstream: upstreamUrl,
      requestHeaders: () => ({ 'x-sync': 'ok' }),
    });
    await fetch(`${proxy.url}/`);
    expect(requests[0]!.headers['x-sync']).toBe('ok');
  });

  it('overrides client-supplied headers with injected ones', async () => {
    proxy = await startProxy({
      upstream: upstreamUrl,
      requestHeaders: () => ({ authorization: 'Bearer injected' }),
    });
    await fetch(`${proxy.url}/`, { headers: { authorization: 'Bearer from-client' } });
    expect(requests[0]!.headers.authorization).toBe('Bearer injected');
  });
});
