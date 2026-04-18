import { ApiError } from '@claudenomics/api';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  signal?: AbortSignal;
  shouldRetry?: (err: unknown, attempt: number) => boolean;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 32_000;

const RETRYABLE_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_NODE_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT']);

export function isRetryableDefault(err: unknown): boolean {
  if (err instanceof ApiError) return RETRYABLE_STATUSES.has(err.status);
  if (!(err instanceof Error)) return false;
  if (err.name === 'AbortError') return false;
  const code = (err as NodeJS.ErrnoException).code;
  return typeof code === 'string' && RETRYABLE_NODE_CODES.has(code);
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const jitter = opts.jitter ?? true;
  const shouldRetry = opts.shouldRetry ?? isRetryableDefault;
  const signal = opts.signal;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw signalReason(signal);
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) break;
      if (!shouldRetry(err, attempt)) break;
      const delay = backoff(attempt, baseDelayMs, maxDelayMs, jitter);
      await sleep(delay, signal);
    }
  }
  throw lastError;
}

function backoff(attempt: number, base: number, max: number, jitter: boolean): number {
  const exp = Math.min(max, base * 2 ** (attempt - 1));
  if (!jitter) return exp;
  const spread = exp * 0.25;
  return Math.max(0, exp + (Math.random() * 2 - 1) * spread);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signalReason(signal));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signalReason(signal!));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function signalReason(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  const err = new Error(typeof reason === 'string' ? reason : 'aborted');
  err.name = 'AbortError';
  return err;
}
