import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ResolvedConfig {
  authUrl?: string;
  jwksUrl?: string;
  jwtIssuer?: string;
  jwtAudience?: string;
  enclaveUrl?: string;
  apiUrl?: string;
  logLevel?: LogLevel;
  receiptsDir?: string;
}

const KEY_TO_ENV: Record<keyof ResolvedConfig, string> = {
  authUrl: 'CLAUDENOMICS_AUTH_URL',
  jwksUrl: 'CLAUDENOMICS_JWKS_URL',
  jwtIssuer: 'CLAUDENOMICS_JWT_ISSUER',
  jwtAudience: 'CLAUDENOMICS_JWT_AUDIENCE',
  enclaveUrl: 'CLAUDENOMICS_ENCLAVE_URL',
  apiUrl: 'CLAUDENOMICS_API_URL',
  logLevel: 'CLAUDENOMICS_LOG',
  receiptsDir: 'CLAUDENOMICS_RECEIPTS_DIR',
};

const USER_CONFIG_PATH = join(homedir(), '.claudenomics', 'config.json');
const PROJECT_CONFIG_FILENAME = '.claudenomics.json';

function readJson(path: string): Record<string, unknown> | null {
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function projectConfigPath(): string {
  return join(process.cwd(), PROJECT_CONFIG_FILENAME);
}

function coerceLogLevel(v: unknown): LogLevel | undefined {
  if (v === 'debug' || v === 'info' || v === 'warn' || v === 'error') return v;
  return undefined;
}

function coerceString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function fromObject(src: Record<string, unknown> | null): Partial<ResolvedConfig> {
  if (!src) return {};
  const out: Partial<ResolvedConfig> = {};
  out.authUrl = coerceString(src.authUrl);
  out.jwksUrl = coerceString(src.jwksUrl);
  out.jwtIssuer = coerceString(src.jwtIssuer);
  out.jwtAudience = coerceString(src.jwtAudience);
  out.enclaveUrl = coerceString(src.enclaveUrl);
  out.apiUrl = coerceString(src.apiUrl);
  out.logLevel = coerceLogLevel(src.logLevel);
  out.receiptsDir = coerceString(src.receiptsDir);
  return stripUndefined(out);
}

function fromEnv(env: NodeJS.ProcessEnv): Partial<ResolvedConfig> {
  const out: Partial<ResolvedConfig> = {
    authUrl: coerceString(env[KEY_TO_ENV.authUrl]),
    jwksUrl: coerceString(env[KEY_TO_ENV.jwksUrl]),
    jwtIssuer: coerceString(env[KEY_TO_ENV.jwtIssuer]),
    jwtAudience: coerceString(env[KEY_TO_ENV.jwtAudience]),
    enclaveUrl: coerceString(env[KEY_TO_ENV.enclaveUrl]),
    apiUrl: coerceString(env[KEY_TO_ENV.apiUrl]),
    logLevel: coerceLogLevel(env[KEY_TO_ENV.logLevel]),
    receiptsDir: coerceString(env[KEY_TO_ENV.receiptsDir]),
  };
  return stripUndefined(out);
}

function stripUndefined<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) {
    if (o[k] === undefined) delete o[k];
  }
  return o;
}

declare const __CLAUDENOMICS_AUTH_URL__: string;
declare const __CLAUDENOMICS_JWKS_URL__: string;
declare const __CLAUDENOMICS_JWT_ISSUER__: string;
declare const __CLAUDENOMICS_ENCLAVE_URL__: string;

function embedded(): Partial<ResolvedConfig> {
  return stripUndefined({
    authUrl: coerceString(__CLAUDENOMICS_AUTH_URL__),
    jwksUrl: coerceString(__CLAUDENOMICS_JWKS_URL__),
    jwtIssuer: coerceString(__CLAUDENOMICS_JWT_ISSUER__),
    enclaveUrl: coerceString(__CLAUDENOMICS_ENCLAVE_URL__),
  });
}

export function resolveConfig(env: NodeJS.ProcessEnv = process.env): ResolvedConfig {
  const layers: Partial<ResolvedConfig>[] = [
    embedded(),
    fromObject(readJson(USER_CONFIG_PATH)),
    fromObject(readJson(projectConfigPath())),
    fromEnv(env),
  ];
  const merged: ResolvedConfig = {};
  for (const layer of layers) Object.assign(merged, layer);
  return merged;
}

export function applyConfigToEnv(cfg: ResolvedConfig, env: NodeJS.ProcessEnv = process.env): void {
  for (const [key, envName] of Object.entries(KEY_TO_ENV) as [keyof ResolvedConfig, string][]) {
    const v = cfg[key];
    if (v !== undefined && env[envName] === undefined) env[envName] = String(v);
  }
}
