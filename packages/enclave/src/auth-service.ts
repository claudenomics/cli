import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { AuthError } from './errors.js';
import { extractBearerToken } from './http.js';

const ALLOWED_ALGS = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'EdDSA'] as const;

export const CLAUDENOMICS_AUTH_HEADER = 'x-claudenomics-auth';

export interface JwtAuthConfig {
  jwksUrl: string;
  issuer: string;
  audience?: string;
  walletClaim: string;
}

export function loadJwtConfig(): JwtAuthConfig | null {
  const jwksUrl = process.env.CLAUDENOMICS_JWKS_URL;
  const issuer = process.env.CLAUDENOMICS_JWT_ISSUER;
  if (!jwksUrl || !issuer) return null;
  const cfg: JwtAuthConfig = {
    jwksUrl,
    issuer,
    walletClaim: process.env.CLAUDENOMICS_JWT_WALLET_CLAIM ?? 'wallet',
  };
  const aud = process.env.CLAUDENOMICS_JWT_AUDIENCE;
  if (aud) cfg.audience = aud;
  return cfg;
}

export interface AuthenticatedIdentity {
  sub: string;
  payload: JWTPayload;
}

export interface AuthService {
  authenticate(authHeader: string | undefined, walletHeader: string): Promise<AuthenticatedIdentity>;
}

export function createJwtAuthService(cfg: JwtAuthConfig): AuthService {
  const jwks = createRemoteJWKSet(new URL(cfg.jwksUrl));

  return {
    async authenticate(authHeader, walletHeader) {
      const token = extractBearerToken(authHeader);
      if (!token) throw new AuthError('missing bearer token');

      let payload: JWTPayload;
      try {
        const result = await jwtVerify(token, jwks, {
          issuer: cfg.issuer,
          ...(cfg.audience !== undefined ? { audience: cfg.audience } : {}),
          algorithms: [...ALLOWED_ALGS],
          requiredClaims: ['exp', 'sub'],
          clockTolerance: 30,
        });
        payload = result.payload;
      } catch (err) {
        throw new AuthError(`invalid token: ${(err as Error).message}`);
      }

      const claimed = (payload as Record<string, unknown>)[cfg.walletClaim];
      if (typeof claimed !== 'string' || claimed.length === 0) {
        throw new AuthError(`jwt missing required wallet claim: ${cfg.walletClaim}`, 403);
      }
      if (claimed !== walletHeader) {
        throw new AuthError('wallet header does not match jwt claim', 403);
      }
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new AuthError('jwt missing sub claim', 403);
      }
      return { sub: payload.sub, payload };
    },
  };
}
