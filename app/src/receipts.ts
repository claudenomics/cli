import { api, ApiError, type SignedReceipt } from '@claudenomics/api';
import { createLogger } from '@claudenomics/logger';
import type { ProxiedResponse, ResponseHandler } from '@claudenomics/proxy';
import type { ReceiptStore } from './receipt-store.js';
import { withRetry } from './retry.js';

const log = createLogger('claudenomics·receipts');

const RECEIPT_HEADER = 'x-claudenomics-receipt';
const SSE_EVENT_NAME = 'claudenomics-receipt';

function readReceiptHeader(headers: Record<string, string | string[]>): string | null {
  const raw = headers[RECEIPT_HEADER] ?? headers[RECEIPT_HEADER.toUpperCase()];
  if (raw == null) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

function readReceiptFromSseStream(body: Buffer): string | null {
  const text = body.toString('utf8');
  const events = text.split(/\n\n/);
  for (let i = events.length - 1; i >= 0; i--) {
    const lines = events[i]!.split('\n');
    let isReceipt = false;
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event:') && line.slice(6).trim() === SSE_EVENT_NAME) isReceipt = true;
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (isReceipt && data) return data;
  }
  return null;
}

function decodeReceipt(b64: string): SignedReceipt | null {
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as SignedReceipt;
  } catch {
    return null;
  }
}

async function trySubmit(
  signed: SignedReceipt,
  store: ReceiptStore,
  signal?: AbortSignal,
): Promise<void> {
  const id = signed.receipt.response_id;
  if (!id) return;
  try {
    await withRetry(() => api.submitReceipt(signed), { signal });
    await store.markSubmitted(id);
    log.debug('submitted receipt', id);
  } catch (err) {
    if (err instanceof ApiError) {
      log.warn(`submit failed (${err.status}): ${err.code} — kept in pending/`);
    } else if (isAbortError(err)) {
      log.debug('submit aborted — receipt kept in pending/');
    } else {
      log.warn(`submit failed: ${(err as Error).message} — kept in pending/`);
    }
  }
}

function isAbortError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === 'object' &&
    'name' in err &&
    (err as { name: string }).name === 'AbortError'
  );
}

export function persistAndSubmitReceipt(
  store: ReceiptStore,
  signal?: AbortSignal,
): ResponseHandler {
  return async (response: ProxiedResponse): Promise<void> => {
    let encoded: string | null = readReceiptHeader(response.responseHeaders);
    if (!encoded && response.contentType?.includes('text/event-stream')) {
      encoded = readReceiptFromSseStream(response.responseBody);
    }
    if (!encoded) return;
    const signed = decodeReceipt(encoded);
    if (!signed) {
      log.warn('failed to decode receipt');
      return;
    }
    await store.save(signed);
    await trySubmit(signed, store, signal);
  };
}

export async function retryPendingReceipts(
  store: ReceiptStore,
  signal?: AbortSignal,
): Promise<void> {
  const pending = await store.listPending();
  if (pending.length === 0) return;
  log.debug(`retrying ${pending.length} pending receipt(s)`);
  for (const { signed } of pending) {
    if (signal?.aborted) return;
    await trySubmit(signed as SignedReceipt, store, signal);
  }
}
