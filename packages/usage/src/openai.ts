import { buildChildEnv } from './env.js';
import { newUsage, type ResponsePayload, type TokenUsage, type VendorConfig } from './index.js';
import { splitSSE, tryParse } from './sse.js';

const OPENAI_ALLOW: readonly string[] = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_PROJECT',
  'OPENAI_ORG_ID',
  'OPENAI_ORGANIZATION',
  'CODEX_HOME',
];

interface ChatCompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

interface ChatCompletionBody {
  object?: 'chat.completion' | 'chat.completion.chunk';
  usage?: ChatCompletionUsage;
}

interface ResponsesUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
}

interface ResponsesBody {
  object?: 'response';
  usage?: ResponsesUsage;
}

interface ResponseCompletedEvent {
  type: 'response.completed';
  response: { usage?: ResponsesUsage };
}

function isStream(contentType: string | undefined): boolean {
  return contentType?.includes('text/event-stream') ?? false;
}

function fromChat(u: ChatCompletionUsage | undefined): TokenUsage | null {
  if (!u || typeof u.prompt_tokens !== 'number') return null;
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  const usage = newUsage();
  usage.inputTokens = Math.max(0, u.prompt_tokens - cached);
  usage.outputTokens = u.completion_tokens ?? 0;
  usage.cacheReadTokens = cached;
  return usage;
}

function fromResponses(u: ResponsesUsage | undefined): TokenUsage | null {
  if (!u || typeof u.input_tokens !== 'number') return null;
  const cached = u.input_tokens_details?.cached_tokens ?? 0;
  const usage = newUsage();
  usage.inputTokens = Math.max(0, u.input_tokens - cached);
  usage.outputTokens = u.output_tokens ?? 0;
  usage.cacheReadTokens = cached;
  return usage;
}

function extractFromBody(text: string): TokenUsage {
  const body = tryParse<ChatCompletionBody & ResponsesBody>(text);
  return fromChat(body?.usage) ?? fromResponses(body?.usage) ?? newUsage();
}

function extractFromStream(text: string): TokenUsage {
  for (const event of splitSSE(text)) {
    if (event.name === 'response.completed') {
      const completed = tryParse<ResponseCompletedEvent>(event.data);
      const parsed = fromResponses(completed?.response.usage);
      if (parsed) return parsed;
      continue;
    }
    const chunk = tryParse<ChatCompletionBody>(event.data);
    if (chunk?.object === 'chat.completion.chunk') {
      const parsed = fromChat(chunk.usage);
      if (parsed) return parsed;
    }
  }
  return newUsage();
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
