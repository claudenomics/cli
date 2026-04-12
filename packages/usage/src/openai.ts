import { buildChildEnv } from './env.js';
import type { ResponsePayload, TokenUsage, VendorConfig } from './index.js';
import { splitSSE, tryParse } from './sse.js';

const OPENAI_ALLOW: readonly string[] = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_PROJECT',
  'OPENAI_ORG_ID',
  'OPENAI_ORGANIZATION',
  'CODEX_HOME',
];

const ZERO: TokenUsage = { inputTokens: 0, outputTokens: 0 };

interface ChatCompletionBody {
  object?: 'chat.completion' | 'chat.completion.chunk';
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface ResponsesBody {
  object?: 'response';
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface ResponseCompletedEvent {
  type: 'response.completed';
  response: { usage?: { input_tokens?: number; output_tokens?: number } };
}

function isStream(contentType: string | undefined): boolean {
  return contentType?.includes('text/event-stream') ?? false;
}

function extractFromBody(text: string): TokenUsage {
  const body = tryParse<ChatCompletionBody & ResponsesBody>(text);
  const usage = body?.usage;
  if (!usage) return ZERO;
  if (typeof usage.prompt_tokens === 'number') {
    return { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens ?? 0 };
  }
  if (typeof usage.input_tokens === 'number') {
    return { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens ?? 0 };
  }
  return ZERO;
}

function extractFromStream(text: string): TokenUsage {
  for (const event of splitSSE(text)) {
    if (event.name === 'response.completed') {
      const completed = tryParse<ResponseCompletedEvent>(event.data);
      const usage = completed?.response.usage;
      if (usage?.input_tokens != null) {
        return { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens ?? 0 };
      }
      continue;
    }
    const chunk = tryParse<ChatCompletionBody>(event.data);
    if (chunk?.object === 'chat.completion.chunk' && chunk.usage?.prompt_tokens != null) {
      return {
        inputTokens: chunk.usage.prompt_tokens,
        outputTokens: chunk.usage.completion_tokens ?? 0,
      };
    }
  }
  return ZERO;
}

export const openai: VendorConfig = {
  name: 'openai',
  upstream: 'https://api.openai.com',
  extractor: {
    extract: ({ responseBody, contentType }: ResponsePayload): TokenUsage => {
      const text = responseBody.toString('utf8');
      return isStream(contentType) ? extractFromStream(text) : extractFromBody(text);
    },
  },
  childEnv: (proxyUrl, base) =>
    buildChildEnv(base, OPENAI_ALLOW, { OPENAI_BASE_URL: `${proxyUrl}/v1` }),
};
