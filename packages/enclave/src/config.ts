import { loadAttestorConfig, type AttestorConfig } from './attestor.js';
import { loadJwtConfig, type JwtAuthConfig } from './auth-service.js';
import { loadDefaultVendor, type Vendor } from './vendor.js';

export interface ServerConfig {
  host: string;
  port: number;
  maxRequestBytes: number;
  maxResponseBytes: number;
  rateLimitPerMin: number;
  rateLimitWindowMs?: number;
}

export interface EnclaveConfig {
  server: ServerConfig;
  attestor: AttestorConfig;
  defaultVendor: Vendor | null;
  jwt: JwtAuthConfig | null;
}

const DEFAULTS: ServerConfig = {
  host: '0.0.0.0',
  port: 8787,
  maxRequestBytes: 10 * 1024 * 1024,
  maxResponseBytes: 64 * 1024 * 1024,
  rateLimitPerMin: 120,
};

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number, got '${raw}'`);
  }
  return n;
}

export function loadServerConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    host: overrides.host ?? DEFAULTS.host,
    port: overrides.port ?? numberEnv('PORT', DEFAULTS.port),
    maxRequestBytes: overrides.maxRequestBytes ?? numberEnv('MAX_REQUEST_BYTES', DEFAULTS.maxRequestBytes),
    maxResponseBytes: overrides.maxResponseBytes ?? numberEnv('MAX_RESPONSE_BYTES', DEFAULTS.maxResponseBytes),
    rateLimitPerMin: overrides.rateLimitPerMin ?? numberEnv('RATE_LIMIT_PER_MIN', DEFAULTS.rateLimitPerMin),
    ...(overrides.rateLimitWindowMs !== undefined ? { rateLimitWindowMs: overrides.rateLimitWindowMs } : {}),
  };
}

export function loadEnclaveConfig(overrides: Partial<ServerConfig> = {}): EnclaveConfig {
  return {
    server: loadServerConfig(overrides),
    attestor: loadAttestorConfig(),
    defaultVendor: loadDefaultVendor(),
    jwt: loadJwtConfig(),
  };
}
