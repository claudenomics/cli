import { buildChildEnv } from './env.js';
import {
  addUsage,
  newUsage,
  type ResponsePayload,
  type TokenUsage,
  type VendorConfig,
} from './index.js';
import { splitSSE, tryParse } from './sse.js';

const ANTHROPIC_ALLOW: readonly string[] = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
  'CLAUDE_CONFIG_DIR',
];

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  server_tool_use?: {
    web_search_requests?: number;
  };
}

interface MessageResponse {
  usage?: AnthropicUsage;
}

interface MessageStartEvent {
  type: 'message_start';
  message: { usage?: AnthropicUsage };
}

interface MessageDeltaEvent {
  type: 'message_delta';
  usage?: AnthropicUsage;
}

function isStream(contentType: string | undefined): boolean {
  return contentType?.includes('text/event-stream') ?? false;
}

function toDelta(u: AnthropicUsage | undefined): Partial<TokenUsage> {
  if (!u) return {};
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens,
    cacheCreateTokens: u.cache_creation_input_tokens,
    webSearchRequests: u.server_tool_use?.web_search_requests,
  };
}

function extractFromBody(text: string): TokenUsage {
  const usage = newUsage();
  const body = tryParse<MessageResponse>(text);
  addUsage(usage, toDelta(body?.usage));
  return usage;
}

function extractFromStream(text: string): TokenUsage {
  const usage = newUsage();
  for (const event of splitSSE(text)) {
    if (event.name === 'message_start') {
      const start = tryParse<MessageStartEvent>(event.data);
      addUsage(usage, toDelta(start?.message.usage));
    } else if (event.name === 'message_delta') {
      const delta = tryParse<MessageDeltaEvent>(event.data);
      addUsage(usage, toDelta(delta?.usage));
    }
  }
  return usage;
}

export const anthropic: VendorConfig = {
  name: 'anthropic',
  upstream: 'https://api.anthropic.com',
  extractor: {
    extract: ({ responseBody, contentType }: ResponsePayload): TokenUsage => {
      const text = responseBody.toString('utf8');
      return isStream(contentType) ? extractFromStream(text) : extractFromBody(text);
    },
  },
  childEnv: (proxyUrl, base) => {
    const overrides: NodeJS.ProcessEnv = { ANTHROPIC_BASE_URL: proxyUrl };
    if (base.ANTHROPIC_API_KEY && !base.ANTHROPIC_AUTH_TOKEN) {
      overrides.ANTHROPIC_AUTH_TOKEN = base.ANTHROPIC_API_KEY;
    }
    return buildChildEnv(base, ANTHROPIC_ALLOW, overrides);
  },
};
