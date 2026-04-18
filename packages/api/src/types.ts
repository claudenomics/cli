export interface TokenExchangeRequest {
  code: string;
  codeVerifier: string;
}

export interface TokenBundle {
  token: string;
  expiresAt: number;
  refreshToken: string;
  refreshExpiresAt: number;
  wallet: string;
  userId: string;
  email?: string;
}

export type TokenExchangeResponse = TokenBundle;

export interface RefreshTokenRequest {
  refreshToken: string;
}

export type RefreshTokenResponse = TokenBundle;

export interface RevokeTokenRequest {
  refreshToken: string;
}

export interface SignedReceipt {
  receipt: {
    wallet: string;
    response_id: string;
    upstream: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    ts: number;
  };
  sig: string;
  pubkey: string;
  compose_hash: string;
  mode?: string;
}

export interface ReceiptSubmitResponse {
  status: 'accepted' | 'duplicate';
}

export interface UsageResponse {
  wallet: string;
  inputTokens: number;
  outputTokens: number;
  lastUpdated: number;
}

export interface ProfileResponse {
  wallet: string;
  league?: string;
  rank?: number;
}
