import { request as undiciRequest, type Dispatcher } from 'undici';
import { filterHeaders, readHeader, type HeaderMap, type HeaderRecord } from './http.js';

export interface UpstreamRequest {
  method: string;
  url: URL;
  headers: HeaderRecord;
  body?: Buffer;
  stripHeaders?: readonly string[];
}

export interface UpstreamResponse {
  status: number;
  headers: HeaderMap;
  contentType: string | undefined;
  body: AsyncIterable<Buffer>;
}

export interface UpstreamClient {
  forward(req: UpstreamRequest): Promise<UpstreamResponse>;
}

async function* asBufferStream(body: AsyncIterable<unknown>): AsyncIterable<Buffer> {
  for await (const chunk of body) {
    yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
  }
}

export function createUndiciUpstreamClient(): UpstreamClient {
  return {
    async forward(req: UpstreamRequest): Promise<UpstreamResponse> {
      const outboundHeaders = filterHeaders(
        req.headers,
        { host: req.url.host, 'accept-encoding': 'identity' },
        req.stripHeaders,
      );
      const res = await undiciRequest(req.url, {
        method: req.method as Dispatcher.HttpMethod,
        headers: outboundHeaders,
        ...(req.body && req.body.length > 0 ? { body: req.body } : {}),
      });
      const responseHeaders = res.headers as HeaderRecord;
      return {
        status: res.statusCode,
        headers: filterHeaders(responseHeaders),
        contentType: readHeader(responseHeaders, 'content-type'),
        body: asBufferStream(res.body),
      };
    },
  };
}
