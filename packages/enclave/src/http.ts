import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { HttpError } from './errors.js';

export const HOP_BY_HOP = new Set([
  'connection', 'proxy-connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length',
]);

export const PROXY_UNSAFE: readonly string[] = [
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-forwarded-ssl',
  'x-real-ip',
  'via',
];

export type HeaderRecord = Record<string, string | string[] | undefined>;
export type HeaderMap = Record<string, string | string[]>;

export function readHeader(headers: HeaderRecord, name: string): string | undefined {
  const raw = headers[name.toLowerCase()];
  if (raw == null) return undefined;
  return Array.isArray(raw) ? raw.join(', ') : raw;
}

export function readSingleHeader(headers: HeaderRecord, name: string): string | undefined {
  const raw = headers[name.toLowerCase()];
  if (raw == null) return undefined;
  if (Array.isArray(raw)) throw new HttpError(`duplicate ${name} header`, 400);
  return raw;
}

export function filterHeaders(
  headers: IncomingHttpHeaders | HeaderRecord,
  overrides: Record<string, string> = {},
  stripExtra: readonly string[] = [],
): HeaderMap {
  const strip = new Set([...HOP_BY_HOP, ...stripExtra.map((s) => s.toLowerCase())]);
  const out: HeaderMap = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v == null || strip.has(k.toLowerCase())) continue;
    out[k] = Array.isArray(v) ? v.join(', ') : v;
  }
  for (const [k, v] of Object.entries(overrides)) out[k] = v;
  return out;
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1]!.trim() : null;
}

export async function readBodyCapped(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    total += buf.length;
    if (total > limit) throw new HttpError(`request body exceeds ${limit} bytes`, 413);
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': String(payload.length) });
  res.end(payload);
}
