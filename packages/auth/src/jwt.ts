import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

const ALLOWED_ALGS = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'EdDSA'] as const;

export interface VerifyJwtOptions {
  jwksUrl: string;
  issuer: string;
  audience?: string;
  requiredClaims?: string[];
  clockToleranceSec?: number;
}

export interface VerifiedJwt {
  payload: JWTPayload;
  header: { alg: string; kid?: string };
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(url: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, jwks);
  }
  return jwks;
}

export async function verifyJwt(token: string, opts: VerifyJwtOptions): Promise<VerifiedJwt> {
  const jwks = getJwks(opts.jwksUrl);
  const { payload, protectedHeader } = await jwtVerify(token, jwks, {
    issuer: opts.issuer,
    ...(opts.audience !== undefined ? { audience: opts.audience } : {}),
    algorithms: [...ALLOWED_ALGS],
    requiredClaims: ['exp', ...(opts.requiredClaims ?? [])],
    clockTolerance: opts.clockToleranceSec ?? 30,
  });
  return { payload, header: { alg: protectedHeader.alg, kid: protectedHeader.kid } };
}

export function parseJwtExpiryUnsafe(token: string): number | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}
