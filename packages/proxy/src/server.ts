import { createServer, type IncomingMessage, type ServerResponse, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { request as undiciRequest, type Dispatcher } from 'undici';
import { createLogger } from '@claudenomics/logger';

const HOST = '127.0.0.1';
const log = createLogger('proxy');

const HOP_BY_HOP = new Set([
  'connection', 'proxy-connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length',
]);

export interface ProxiedResponse {
  method: string;
  url: string;
  status: number;
  requestBody: Buffer;
  responseBody: Buffer;
  contentType: string | undefined;
  responseHeaders: Record<string, string | string[]>;
}

export type ResponseHandler = (response: ProxiedResponse) => void | Promise<void>;

export type RequestHeaders = Record<string, string>;

export interface StartProxyOptions {
  upstream: URL;
  onResponse?: ResponseHandler | readonly ResponseHandler[];
  requestHeaders?: () => Promise<RequestHeaders> | RequestHeaders;
}

export interface ProxyHandle {
  url: string;
  stop(): Promise<void>;
}

export async function startProxy(options: StartProxyOptions): Promise<ProxyHandle> {
  const handlers = normalizeHandlers(options.onResponse);
  const resolveHeaders = options.requestHeaders ?? (() => ({}));

  const server = createServer(async (req, res) => {
    const upstreamUrl = new URL(req.url ?? '/', options.upstream);
    log.debug('→', req.method, upstreamUrl.toString());

    let response: ProxiedResponse;
    try {
      const injectHeaders = await resolveHeaders();
      response = await forward(req, res, upstreamUrl, injectHeaders);
    } catch (err) {
      const message = (err as Error).message;
      if (isBenignClose(err)) {
        log.debug('forward aborted:', message);
      } else {
        log.warn('forward error:', message);
      }
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain' });
        res.end(`claudenomics proxy error: ${message}\n`);
      } else if (!res.writableEnded) {
        res.destroy();
      }
      return;
    }

    log.debug('←', response.status);
    for (const handler of handlers) {
      try {
        await handler(response);
      } catch (err) {
        log.warn('handler error:', (err as Error).message);
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const { port } = server.address() as AddressInfo;
  const url = `http://${HOST}:${port}`;
  log.debug('listening', url);

  return {
    url,
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

function normalizeHandlers(
  onResponse: ResponseHandler | readonly ResponseHandler[] | undefined,
): readonly ResponseHandler[] {
  if (onResponse === undefined) return [];
  if (typeof onResponse === 'function') return [onResponse];
  return onResponse;
}

const BENIGN_CLOSE_PATTERNS = [
  /other side closed/i,
  /premature close/i,
  /socket hang up/i,
  /ECONNRESET/,
];

function isBenignClose(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  if (e?.code === 'ECONNRESET') return true;
  const msg = e?.message;
  return typeof msg === 'string' && BENIGN_CLOSE_PATTERNS.some((re) => re.test(msg));
}

async function forward(
  clientReq: IncomingMessage,
  clientRes: ServerResponse,
  upstreamUrl: URL,
  injectHeaders: Record<string, string>,
): Promise<ProxiedResponse> {
  const requestBody = await readBody(clientReq);
  const upstream = await undiciRequest(upstreamUrl, {
    method: (clientReq.method ?? 'GET') as Dispatcher.HttpMethod,
    headers: filterHeaders(clientReq.headers, { host: upstreamUrl.host, ...injectHeaders }),
    body: requestBody.length > 0 ? requestBody : undefined,
  });

  const headers = upstream.headers as Record<string, string | string[] | undefined>;
  const filteredResponseHeaders = filterHeaders(headers);
  clientRes.writeHead(upstream.statusCode, filteredResponseHeaders);

  const contentType = readHeader(headers, 'content-type');
  const chunks: Buffer[] = [];
  for await (const chunk of upstream.body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    chunks.push(buf);
    if (!clientRes.write(buf)) {
      await new Promise<void>((resolve) => clientRes.once('drain', () => resolve()));
    }
  }
  clientRes.end();
  return {
    method: clientReq.method ?? 'GET',
    url: upstreamUrl.toString(),
    status: upstream.statusCode,
    requestBody,
    responseBody: Buffer.concat(chunks),
    contentType,
    responseHeaders: filteredResponseHeaders,
  };
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  return Buffer.concat(chunks);
}

function filterHeaders<T extends IncomingHttpHeaders | Record<string, string | string[] | undefined>>(
  headers: T,
  overrides: Record<string, string> = {},
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v == null || HOP_BY_HOP.has(k.toLowerCase())) continue;
    out[k] = Array.isArray(v) ? v.join(', ') : v;
  }
  for (const [k, v] of Object.entries(overrides)) out[k] = v;
  return out;
}

function readHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (raw == null) return undefined;
  return Array.isArray(raw) ? raw.join(', ') : raw;
}
