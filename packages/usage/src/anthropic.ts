import { buildChildEnv } from './env.js';
import type { ResponsePayload, TokenUsage, VendorConfig } from './index.js';
import { splitSSE, tryParse } from './sse.js';

const ANTHROPIC_ALLOW: readonly string[] = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
  'CLAUDE_CONFIG_DIR',
];

interface Usage {
  input_tokens?: number;
  output_tokens?: number;
}

interface MessageResponse {
  usage?: Usage;
}

interface MessageStartEvent {
  type: 'message_start';
  message: { usage: Usage };
}

interface MessageDeltaEvent {
  type: 'message_delta';
  usage?: Usage;
}

function isStream(contentType: string | undefined): boolean {
  return contentType?.includes('text/event-stream') ?? false;
}

function extractFromBody(text: string): TokenUsage {
  const body = tryParse<MessageResponse>(text);
  return {
    inputTokens: body?.usage?.input_tokens ?? 0,
    outputTokens: body?.usage?.output_tokens ?? 0,
  };
}

function extractFromStream(text: string): TokenUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const event of splitSSE(text)) {
    if (event.name === 'message_start') {
      const start = tryParse<MessageStartEvent>(event.data);
      if (start?.message.usage.input_tokens != null) inputTokens = start.message.usage.input_tokens;
    } else if (event.name === 'message_delta') {
      const delta = tryParse<MessageDeltaEvent>(event.data);
      if (delta?.usage?.output_tokens != null) outputTokens = delta.usage.output_tokens;
    }
  }
  return { inputTokens, outputTokens };
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
