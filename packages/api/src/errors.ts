export type ApiErrorCode =
  | 'no_session'
  | 'invalid_request'
  | 'invalid_code'
  | 'verifier_mismatch'
  | 'wallet_unavailable'
  | 'wallet_mismatch'
  | 'unauthorized'
  | 'invalid_signature'
  | 'unknown_compose_hash'
  | 'compose_hash_drift'
  | 'unattested_pubkey'
  | 'unacceptable_tcb'
  | 'non_production_receipt'
  | 'rate_limited'
  | 'unknown';

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode | string,
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `${status} ${code}`);
    this.name = 'ApiError';
  }
}
