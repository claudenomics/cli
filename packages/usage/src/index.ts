export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
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
