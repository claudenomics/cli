export interface RateLimiter {
  check(key: string): boolean;
}

export interface RateLimiterOptions {
  perMinute: number;
  windowMs?: number;
  maxKeys?: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_KEYS = 10_000;

interface Bucket { count: number; resetAt: number }

export function createInMemoryRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const window = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const maxKeys = opts.maxKeys ?? DEFAULT_MAX_KEYS;
  const buckets = new Map<string, Bucket>();

  const prune = (now: number): void => {
    for (const [k, b] of buckets) {
      if (b.resetAt < now) buckets.delete(k);
    }
  };

  const evictOldestIfFull = (): void => {
    if (buckets.size < maxKeys) return;
    const oldest = buckets.keys().next();
    if (!oldest.done) buckets.delete(oldest.value);
  };

  return {
    check(key) {
      const now = Date.now();
      const b = buckets.get(key);
      if (!b || b.resetAt < now) {
        prune(now);
        evictOldestIfFull();
        buckets.set(key, { count: 1, resetAt: now + window });
        return true;
      }
      if (b.count >= opts.perMinute) return false;
      b.count++;
      return true;
    },
  };
}
