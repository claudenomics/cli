export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  webSearchRequests: number;
}

export const EMPTY_USAGE: Readonly<TokenUsage> = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreateTokens: 0,
  webSearchRequests: 0,
});

export function newUsage(): TokenUsage {
  return { ...EMPTY_USAGE };
}

export function addUsage(into: TokenUsage, delta: Partial<TokenUsage>): void {
  into.inputTokens += delta.inputTokens ?? 0;
  into.outputTokens += delta.outputTokens ?? 0;
  into.cacheReadTokens += delta.cacheReadTokens ?? 0;
  into.cacheCreateTokens += delta.cacheCreateTokens ?? 0;
  into.webSearchRequests += delta.webSearchRequests ?? 0;
}

export interface ResponsePayload {
  method: string;
  url: string;
  status: number;
  requestBody: Buffer;
  responseBody: Buffer;
  contentType: string | undefined;
}

export interface UsageExtractor {
  extract(payload: ResponsePayload): TokenUsage;
}

export interface VendorConfig {
  name: string;
  upstream: string;
  extractor: UsageExtractor;
  childEnv(proxyUrl: string, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
}

export { anthropic } from './anthropic.js';
export { openai } from './openai.js';
