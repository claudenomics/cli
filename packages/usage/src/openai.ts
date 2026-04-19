import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildChildEnv } from './env.js';
import { newUsage, type ResponsePayload, type TokenUsage, type VendorConfig } from './index.js';
import { splitSSE, tryParse } from './sse.js';

const OPENAI_ALLOW: readonly string[] = [
  'OPENAI_API_KEY',
  'OPENAI_PROJECT',
  'OPENAI_ORG_ID',
  'OPENAI_ORGANIZATION',
  'CODEX_HOME',
];

const CODEX_PROXY_PROVIDER = 'claudenomics_proxy';

const OPENAI_API_UPSTREAM = 'https://api.openai.com';
const OPENAI_API_BASE_PATH = '/v1';
const CHATGPT_UPSTREAM = 'https://chatgpt.com';
const CHATGPT_BASE_PATH = '/backend-api/codex';

export const CODEX_AUTH_MODE_HEADER = 'x-claudenomics-codex-auth-mode';

type CodexAuthMode = 'chatgpt' | 'apikey';

interface CodexAuthFile {
  auth_mode?: CodexAuthMode | null;
}

function codexAuthMode(base: NodeJS.ProcessEnv): CodexAuthMode {
  const home = base.CODEX_HOME ?? join(base.HOME ?? homedir(), '.codex');
  try {
    const raw = readFileSync(join(home, 'auth.json'), 'utf8');
    const parsed = JSON.parse(raw) as CodexAuthFile;
    return parsed.auth_mode === 'chatgpt' ? 'chatgpt' : 'apikey';
  } catch {
    return 'apikey';
  }
}

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

function looksLikeSSE(text: string): boolean {
  return text.startsWith('event:') || text.startsWith('data:');
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

function codexBasePath(base: NodeJS.ProcessEnv): string {
  return codexAuthMode(base) === 'chatgpt' ? CHATGPT_BASE_PATH : OPENAI_API_BASE_PATH;
}

function codexConfigArgs(proxyUrl: string, base: NodeJS.ProcessEnv): string[] {
  const baseUrl = `${proxyUrl}${codexBasePath(base)}`;
  return [
    '-c',
    `model_provider="${CODEX_PROXY_PROVIDER}"`,
    '-c',
    `model_providers.${CODEX_PROXY_PROVIDER}.name="claudenomics proxy"`,
    '-c',
    `model_providers.${CODEX_PROXY_PROVIDER}.base_url="${baseUrl}"`,
    '-c',
    `model_providers.${CODEX_PROXY_PROVIDER}.requires_openai_auth=true`,
    '-c',
    `model_providers.${CODEX_PROXY_PROVIDER}.wire_api="responses"`,
    '-c',
    `model_providers.${CODEX_PROXY_PROVIDER}.supports_websockets=false`,
  ];
}

export const openai: VendorConfig = {
  name: 'openai',
  upstream: (base) => (codexAuthMode(base) === 'chatgpt' ? CHATGPT_UPSTREAM : OPENAI_API_UPSTREAM),
  extractor: {
    extract: ({ responseBody, contentType }: ResponsePayload): TokenUsage => {
      const text = responseBody.toString('utf8');
      if (isStream(contentType) || looksLikeSSE(text)) return extractFromStream(text);
      return extractFromBody(text);
    },
  },
  childEnv: (_proxyUrl, base) => buildChildEnv(base, OPENAI_ALLOW, {}),
  childArgs: (proxyUrl, args, base) => [...codexConfigArgs(proxyUrl, base), ...args],
  enclaveHeaders: (base) => ({ [CODEX_AUTH_MODE_HEADER]: codexAuthMode(base) }),
};
