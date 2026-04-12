import { describe, it, expect } from 'vitest';
import { anthropic, openai } from '../src/index.js';

const buf = (s: string) => Buffer.from(s, 'utf8');

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
    expect(anthropic.extractor.extract(payload(body, 'application/json')))
      .toEqual({ inputTokens: 42, outputTokens: 128 });
  });

  it('stream: input from message_start, cumulative output from final message_delta', () => {
    const sse =
      'event: message_start\n' +
      'data: {"type":"message_start","message":{"id":"msg_1","type":"message","usage":{"input_tokens":25,"output_tokens":1}}}\n\n' +
      'event: content_block_start\n' +
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n' +
      'event: ping\n' +
      'data: {"type":"ping"}\n\n' +
      'event: content_block_delta\n' +
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n\n' +
      'event: message_delta\n' +
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":15}}\n\n' +
      'event: message_stop\n' +
      'data: {"type":"message_stop"}\n\n';
    expect(anthropic.extractor.extract(payload(sse, 'text/event-stream')))
      .toEqual({ inputTokens: 25, outputTokens: 15 });
  });

  it('returns zeros when no usage is present', () => {
    expect(anthropic.extractor.extract(payload('{"error":"nope"}', 'application/json')))
      .toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it('returns zeros on malformed JSON', () => {
    expect(anthropic.extractor.extract(payload('not json', 'application/json')))
      .toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});

describe('openai', () => {
  it('chat completions non-stream: prompt_tokens + completion_tokens', () => {
    const body = JSON.stringify({
      object: 'chat.completion',
      usage: { prompt_tokens: 15, completion_tokens: 30, total_tokens: 45 },
    });
    expect(openai.extractor.extract(payload(body, 'application/json')))
      .toEqual({ inputTokens: 15, outputTokens: 30 });
  });

  it('chat completions stream (include_usage): reads usage from final chunk', () => {
    const sse =
      'data: {"id":"c1","object":"chat.completion.chunk","choices":[{"delta":{"content":"hi"}}]}\n\n' +
      'data: {"id":"c1","object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":7,"completion_tokens":2,"total_tokens":9}}\n\n' +
      'data: [DONE]\n\n';
    expect(openai.extractor.extract(payload(sse, 'text/event-stream')))
      .toEqual({ inputTokens: 7, outputTokens: 2 });
  });

  it('responses API non-stream: input_tokens + output_tokens', () => {
    const body = JSON.stringify({
      object: 'response',
      usage: { input_tokens: 8, output_tokens: 12, total_tokens: 20 },
    });
    expect(openai.extractor.extract(payload(body, 'application/json')))
      .toEqual({ inputTokens: 8, outputTokens: 12 });
  });

  it('responses API stream: reads usage from response.completed event', () => {
    const sse =
      'event: response.created\n' +
      'data: {"type":"response.created","response":{"id":"r1"}}\n\n' +
      'event: response.output_text.delta\n' +
      'data: {"type":"response.output_text.delta","delta":"hi"}\n\n' +
      'event: response.completed\n' +
      'data: {"type":"response.completed","response":{"id":"r1","usage":{"input_tokens":11,"output_tokens":22,"total_tokens":33}}}\n\n';
    expect(openai.extractor.extract(payload(sse, 'text/event-stream')))
      .toEqual({ inputTokens: 11, outputTokens: 22 });
  });

  it('returns zeros on malformed JSON', () => {
    expect(openai.extractor.extract(payload('not json', 'application/json')))
      .toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});
