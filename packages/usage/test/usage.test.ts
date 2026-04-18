import { describe, it, expect } from 'vitest';
import { anthropic, openai, type TokenUsage } from '../src/index.js';

const buf = (s: string) => Buffer.from(s, 'utf8');

const ZERO: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreateTokens: 0,
  webSearchRequests: 0,
};

function payload(body: string, contentType: string) {
  return {
    method: 'POST',
    url: 'https://example.test/',
    status: 200,
    requestBody: Buffer.alloc(0),
    responseBody: buf(body),
    contentType,
  };
}

describe('anthropic', () => {
  it('non-stream: reads usage.input_tokens + usage.output_tokens', () => {
    const body = JSON.stringify({
      id: 'msg_01',
      type: 'message',
      usage: { input_tokens: 42, output_tokens: 128 },
    });
    expect(anthropic.extractor.extract(payload(body, 'application/json'))).toEqual({
      ...ZERO,
      inputTokens: 42,
      outputTokens: 128,
    });
  });

  it('non-stream: reads all four token fields + web_search_requests', () => {
    const body = JSON.stringify({
      id: 'msg_01',
      type: 'message',
      usage: {
        input_tokens: 100,
        output_tokens: 250,
        cache_creation_input_tokens: 500,
        cache_read_input_tokens: 4_000,
        server_tool_use: { web_search_requests: 3 },
      },
    });
    expect(anthropic.extractor.extract(payload(body, 'application/json'))).toEqual({
      inputTokens: 100,
      outputTokens: 250,
      cacheReadTokens: 4_000,
      cacheCreateTokens: 500,
      webSearchRequests: 3,
    });
  });

  it('stream: sums cache_creation + cache_read across message_start + message_delta', () => {
    const sse =
      'event: message_start\n' +
      'data: {"type":"message_start","message":{"id":"msg_1","type":"message","usage":{"input_tokens":25,"output_tokens":1,"cache_creation_input_tokens":200,"cache_read_input_tokens":1500}}}\n\n' +
      'event: content_block_delta\n' +
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n\n' +
      'event: message_delta\n' +
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":15}}\n\n' +
      'event: message_stop\n' +
      'data: {"type":"message_stop"}\n\n';
    expect(anthropic.extractor.extract(payload(sse, 'text/event-stream'))).toEqual({
      inputTokens: 25,
      outputTokens: 16,
      cacheReadTokens: 1_500,
      cacheCreateTokens: 200,
      webSearchRequests: 0,
    });
  });

  it('stream: captures server_tool_use.web_search_requests from message_delta', () => {
    const sse =
      'event: message_start\n' +
      'data: {"type":"message_start","message":{"id":"msg_1","type":"message","usage":{"input_tokens":10,"output_tokens":0}}}\n\n' +
      'event: message_delta\n' +
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":7,"server_tool_use":{"web_search_requests":2}}}\n\n';
    expect(anthropic.extractor.extract(payload(sse, 'text/event-stream'))).toEqual({
      inputTokens: 10,
      outputTokens: 7,
      cacheReadTokens: 0,
      cacheCreateTokens: 0,
      webSearchRequests: 2,
    });
  });

  it('stream: partial transcript with only message_start still yields input tokens', () => {
    const sse =
      'event: message_start\n' +
      'data: {"type":"message_start","message":{"id":"msg_1","type":"message","usage":{"input_tokens":42,"output_tokens":1,"cache_read_input_tokens":100}}}\n\n' +
      'event: content_block_start\n' +
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n';
    expect(anthropic.extractor.extract(payload(sse, 'text/event-stream'))).toEqual({
      inputTokens: 42,
      outputTokens: 1,
      cacheReadTokens: 100,
      cacheCreateTokens: 0,
      webSearchRequests: 0,
    });
  });

  it('returns zeros when no usage is present', () => {
    expect(anthropic.extractor.extract(payload('{"error":"nope"}', 'application/json'))).toEqual(
      ZERO,
    );
  });

  it('returns zeros on malformed JSON', () => {
    expect(anthropic.extractor.extract(payload('not json', 'application/json'))).toEqual(ZERO);
  });
});

describe('openai', () => {
  it('childEnv does not forward deprecated OPENAI_BASE_URL', () => {
    const env = openai.childEnv('http://proxy.test', {
      PATH: '/bin',
      OPENAI_API_KEY: 'sk-test',
      OPENAI_BASE_URL: 'https://deprecated.example',
      CODEX_HOME: '/tmp/codex-home',
    });
    expect(env.OPENAI_API_KEY).toBe('sk-test');
    expect(env.CODEX_HOME).toBe('/tmp/codex-home');
    expect(env.OPENAI_BASE_URL).toBeUndefined();
  });

  it('childArgs injects a Codex proxy provider over HTTP responses', () => {
    expect(openai.childArgs?.('http://127.0.0.1:8787', ['exec', 'hello'])).toEqual([
      '-c',
      'model_provider="claudenomics_proxy"',
      '-c',
      'model_providers.claudenomics_proxy.name="claudenomics proxy"',
      '-c',
      'model_providers.claudenomics_proxy.base_url="http://127.0.0.1:8787/v1"',
      '-c',
      'model_providers.claudenomics_proxy.env_key="OPENAI_API_KEY"',
      '-c',
      'model_providers.claudenomics_proxy.requires_openai_auth=true',
      '-c',
      'model_providers.claudenomics_proxy.wire_api="responses"',
      '-c',
      'model_providers.claudenomics_proxy.supports_websockets=false',
      'exec',
      'hello',
    ]);
  });

  it('chat completions non-stream: prompt_tokens + completion_tokens', () => {
    const body = JSON.stringify({
      object: 'chat.completion',
      usage: { prompt_tokens: 15, completion_tokens: 30, total_tokens: 45 },
    });
    expect(openai.extractor.extract(payload(body, 'application/json'))).toEqual({
      ...ZERO,
      inputTokens: 15,
      outputTokens: 30,
    });
  });

  it('chat completions non-stream: splits cached_tokens out of prompt_tokens', () => {
    const body = JSON.stringify({
      object: 'chat.completion',
      usage: {
        prompt_tokens: 1_000,
        completion_tokens: 200,
        prompt_tokens_details: { cached_tokens: 750 },
      },
    });
    expect(openai.extractor.extract(payload(body, 'application/json'))).toEqual({
      inputTokens: 250,
      outputTokens: 200,
      cacheReadTokens: 750,
      cacheCreateTokens: 0,
      webSearchRequests: 0,
    });
  });

  it('chat completions stream (include_usage): reads usage from final chunk', () => {
    const sse =
      'data: {"id":"c1","object":"chat.completion.chunk","choices":[{"delta":{"content":"hi"}}]}\n\n' +
      'data: {"id":"c1","object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":7,"completion_tokens":2,"total_tokens":9}}\n\n' +
      'data: [DONE]\n\n';
    expect(openai.extractor.extract(payload(sse, 'text/event-stream'))).toEqual({
      ...ZERO,
      inputTokens: 7,
      outputTokens: 2,
    });
  });

  it('responses API non-stream: input_tokens + output_tokens', () => {
    const body = JSON.stringify({
      object: 'response',
      usage: { input_tokens: 8, output_tokens: 12, total_tokens: 20 },
    });
    expect(openai.extractor.extract(payload(body, 'application/json'))).toEqual({
      ...ZERO,
      inputTokens: 8,
      outputTokens: 12,
    });
  });

  it('responses API non-stream: splits cached_tokens out of input_tokens', () => {
    const body = JSON.stringify({
      object: 'response',
      usage: {
        input_tokens: 500,
        output_tokens: 40,
        input_tokens_details: { cached_tokens: 400 },
      },
    });
    expect(openai.extractor.extract(payload(body, 'application/json'))).toEqual({
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 400,
      cacheCreateTokens: 0,
      webSearchRequests: 0,
    });
  });

  it('responses API stream: reads usage from response.completed event', () => {
    const sse =
      'event: response.created\n' +
      'data: {"type":"response.created","response":{"id":"r1"}}\n\n' +
      'event: response.output_text.delta\n' +
      'data: {"type":"response.output_text.delta","delta":"hi"}\n\n' +
      'event: response.completed\n' +
      'data: {"type":"response.completed","response":{"id":"r1","usage":{"input_tokens":11,"output_tokens":22,"input_tokens_details":{"cached_tokens":4}}}}\n\n';
    expect(openai.extractor.extract(payload(sse, 'text/event-stream'))).toEqual({
      inputTokens: 7,
      outputTokens: 22,
      cacheReadTokens: 4,
      cacheCreateTokens: 0,
      webSearchRequests: 0,
    });
  });

  it('returns zeros on malformed JSON', () => {
    expect(openai.extractor.extract(payload('not json', 'application/json'))).toEqual(ZERO);
  });
});
