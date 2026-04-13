import { createLogger } from '@claudenomics/logger';
import type { ProxiedResponse, ResponseHandler } from '@claudenomics/proxy';
import type { ReceiptStore, SignedReceiptLike } from './receipt-store.js';
import type { ReceiptSubmitter } from './receipt-submitter.js';

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

function decodeReceipt(b64: string): SignedReceiptLike | null {
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as SignedReceiptLike;
  } catch {
    return null;
  }
}

async function trySubmit(
  signed: SignedReceiptLike,
  store: ReceiptStore,
  submitter: ReceiptSubmitter | null,
): Promise<void> {
  const id = signed.receipt.response_id;
  if (!id || !submitter) return;
  const result = await submitter.submit(signed);
  if (result.ok) {
    await store.markSubmitted(id);
    log.debug('submitted receipt', id);
  } else {
    log.warn(`submit failed (${result.status ?? '?'}): ${result.reason ?? 'unknown'} — kept in pending/`);
  }
}

export function persistAndSubmitReceipt(
  store: ReceiptStore,
  submitter: ReceiptSubmitter | null,
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
    await trySubmit(signed, store, submitter);
  };
}

export async function retryPendingReceipts(
  store: ReceiptStore,
  submitter: ReceiptSubmitter,
): Promise<void> {
  const pending = await store.listPending();
  if (pending.length === 0) return;
  log.debug(`retrying ${pending.length} pending receipt(s)`);
  for (const { signed } of pending) {
    await trySubmit(signed, store, submitter);
  }
}
