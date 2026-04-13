import type { SignedReceiptLike } from './receipt-store.js';

export interface SubmitResult {
  ok: boolean;
  status?: number;
  reason?: string;
}

export interface ReceiptSubmitter {
  submit(signed: SignedReceiptLike): Promise<SubmitResult>;
}

export interface HttpSubmitterOptions {
  endpoint: URL;
  getToken: () => Promise<string | null>;
}

export function createHttpReceiptSubmitter(opts: HttpSubmitterOptions): ReceiptSubmitter {
  return {
    async submit(signed) {
      const token = await opts.getToken();
      if (!token) return { ok: false, reason: 'no_session' };
      let res: Response;
      try {
        res = await fetch(opts.endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(signed),
        });
      } catch (err) {
        return { ok: false, reason: (err as Error).message };
      }
      if (res.ok) return { ok: true, status: res.status };
      let reason: string | undefined;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) reason = body.error;
      } catch {}
      return { ok: false, status: res.status, ...(reason ? { reason } : {}) };
    },
  };
}
