declare const __CLAUDENOMICS_AUTH_URL__: string;
declare const __CLAUDENOMICS_JWKS_URL__: string;
declare const __CLAUDENOMICS_JWT_ISSUER__: string;
declare const __CLAUDENOMICS_ENCLAVE_URL__: string;

const EMBEDDED: Record<string, string> = {
  CLAUDENOMICS_AUTH_URL: __CLAUDENOMICS_AUTH_URL__,
  CLAUDENOMICS_JWKS_URL: __CLAUDENOMICS_JWKS_URL__,
  CLAUDENOMICS_JWT_ISSUER: __CLAUDENOMICS_JWT_ISSUER__,
  CLAUDENOMICS_ENCLAVE_URL: __CLAUDENOMICS_ENCLAVE_URL__,
};

export function applyEmbeddedDefaults(): void {
  for (const [key, value] of Object.entries(EMBEDDED)) {
    if (value && !process.env[key]) process.env[key] = value;
  }
}
