import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Attestor } from './attestor.js';
import { CLAUDENOMICS_AUTH_HEADER, type AuthService } from './auth-service.js';
import type { ServerConfig } from './config.js';
import { AuthError, HttpError } from './errors.js';
import {
  PROXY_UNSAFE,
  filterHeaders,
  readBodyCapped,
  readHeader,
  readSingleHeader,
  writeJson,
  type HeaderMap,
} from './http.js';
import type { RateLimiter } from './rate-limiter.js';
import { encodeReceipt, signReceipt, type Receipt } from './receipt.js';
import type { UpstreamClient, UpstreamResponse } from './upstream-client.js';
import { extractMeta, type SelectedVendor } from './vendor.js';

const WALLET_HEADER = 'x-claudenomics-wallet';
const RECEIPT_HEADER = 'x-claudenomics-receipt';
const RECEIPT_SSE_EVENT = 'claudenomics-receipt';
const ERROR_SSE_EVENT = 'claudenomics-error';
const STRIPPED_HEADERS = [WALLET_HEADER, CLAUDENOMICS_AUTH_HEADER, ...PROXY_UNSAFE];

export interface ProxyService {
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
}

export interface ProxyDeps {
  upstreamBase: URL;
  upstream: UpstreamClient;
  auth: AuthService;
  rateLimiter: RateLimiter;
  attestor: Attestor;
  vendor: SelectedVendor;
  config: ServerConfig;
}

export function createProxyService(deps: ProxyDeps): ProxyService {
  return {
    async handle(req, res) {
      const wallet = requireWallet(req);
      await deps.auth.authenticate(readSingleHeader(req.headers, CLAUDENOMICS_AUTH_HEADER), wallet);
      if (!deps.rateLimiter.check(wallet)) {
        return writeJson(res, 429, { error: 'rate limit exceeded' });
      }

      const target = resolveUpstreamUrl(req.url, deps.upstreamBase);
      const requestBody = await readBodyCapped(req, deps.config.maxRequestBytes);
      const upstreamRes = await deps.upstream.forward({
        method: req.method ?? 'GET',
        url: target,
        headers: req.headers,
        ...(requestBody.length > 0 ? { body: requestBody } : {}),
        stripHeaders: STRIPPED_HEADERS,
      });

      if (upstreamRes.contentType?.includes('text/event-stream')) {
        await pipeStreamed(upstreamRes, wallet, res, deps);
      } else {
        await pipeBuffered(upstreamRes, wallet, res, deps);
      }
    },
  };
}

function requireWallet(req: IncomingMessage): string {
  const wallet = readSingleHeader(req.headers, WALLET_HEADER);
  if (!wallet) throw new AuthError(`missing ${WALLET_HEADER} header`, 400);
  return wallet;
}

function resolveUpstreamUrl(reqUrl: string | undefined, base: URL): URL {
  if (!reqUrl || !reqUrl.startsWith('/')) {
    throw new HttpError('invalid request target', 400);
  }
  let parsed: URL;
  try {
    parsed = new URL(reqUrl, 'http://placeholder.invalid');
  } catch {
    throw new HttpError('invalid request target', 400);
  }
  const resolved = new URL(parsed.pathname + parsed.search, base);
  if (resolved.origin !== base.origin) {
    throw new HttpError('upstream origin mismatch', 400);
  }
  return resolved;
}

async function pipeStreamed(
  upstream: UpstreamResponse,
  wallet: string,
  res: ServerResponse,
  deps: ProxyDeps,
): Promise<void> {
  res.writeHead(upstream.status, upstream.headers);
  const body = await collectWithCap(upstream.body, deps.config.maxResponseBytes, async (buf) => {
    if (!res.write(buf)) await new Promise<void>((r) => res.once('drain', () => r()));
  });
  if (!body) {
    res.write(`event: ${ERROR_SSE_EVENT}\ndata: response-too-large\n\n`);
    res.end();
    return;
  }
  const signed = await buildReceipt(deps, wallet, body, upstream.contentType);
  if (signed) {
    res.write(`event: ${RECEIPT_SSE_EVENT}\ndata: ${encodeReceipt(signed)}\n\n`);
  }
  res.end();
}

async function pipeBuffered(
  upstream: UpstreamResponse,
  wallet: string,
  res: ServerResponse,
  deps: ProxyDeps,
): Promise<void> {
  const body = await collectWithCap(upstream.body, deps.config.maxResponseBytes);
  if (!body) throw new HttpError('upstream response too large', 502);
  const signed = await buildReceipt(deps, wallet, body, upstream.contentType);
  const headers: HeaderMap = { ...upstream.headers };
  if (signed) headers[RECEIPT_HEADER] = encodeReceipt(signed);
  res.writeHead(upstream.status, headers);
  res.end(body);
}

async function collectWithCap(
  body: AsyncIterable<Buffer>,
  limit: number,
  onChunk?: (buf: Buffer) => Promise<void>,
): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const buf of body) {
    total += buf.length;
    if (total > limit) return null;
    if (onChunk) await onChunk(buf);
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

async function buildReceipt(
  deps: ProxyDeps,
  wallet: string,
  body: Buffer,
  contentType: string | undefined,
) {
  const meta = extractMeta(deps.vendor.config, body, contentType);
  if (!meta.response_id) return null;
  const receipt: Receipt = {
    wallet,
    response_id: meta.response_id,
    upstream: deps.vendor.name,
    model: meta.model,
    input_tokens: meta.input_tokens,
    output_tokens: meta.output_tokens,
    ts: Date.now(),
  };
  return signReceipt(deps.attestor, receipt);
}
