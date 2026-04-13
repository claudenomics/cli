import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createLogger } from '@claudenomics/logger';
import {
  createDstackAttestor,
  createSimulatorAttestor,
  type Attestor,
  type AttestorConfig,
} from './attestor.js';
import {
  createJwtAuthService,
  type AuthService,
  type JwtAuthConfig,
} from './auth-service.js';
import { loadEnclaveConfig, type ServerConfig } from './config.js';
import { createRoutes, type Routes } from './endpoints.js';
import { AuthError, HttpError } from './errors.js';
import { writeJson } from './http.js';
import { createProxyService } from './proxy-service.js';
import { createInMemoryRateLimiter } from './rate-limiter.js';
import { createUndiciUpstreamClient } from './upstream-client.js';
import { buildVendorRegistry, vendorNames, type Vendor, type VendorRegistry } from './vendor.js';

const log = createLogger('enclave');

export interface StartServerOptions extends Partial<ServerConfig> {}

export interface ServerHandle {
  url: string;
  stop(): Promise<void>;
}

export async function startServer(options: StartServerOptions = {}): Promise<ServerHandle> {
  const config = loadEnclaveConfig(options);
  if (!config.jwt) {
    throw new Error('JWT auth required — set CLAUDENOMICS_JWKS_URL and CLAUDENOMICS_JWT_ISSUER');
  }

  const attestor = await buildAttestor(config.attestor);
  const vendors = buildVendorRegistry();
  const auth = buildAuth(config.jwt);
  const proxy = createProxyService({
    vendors,
    defaultVendor: config.defaultVendor,
    upstream: createUndiciUpstreamClient(),
    auth,
    rateLimiter: createInMemoryRateLimiter({
      perMinute: config.server.rateLimitPerMin,
      ...(config.server.rateLimitWindowMs !== undefined
        ? { windowMs: config.server.rateLimitWindowMs }
        : {}),
    }),
    attestor,
    config: config.server,
  });
  const routes = createRoutes(attestor, vendors, config.defaultVendor, proxy);

  log.info(
    `attestor=${attestor.mode} vendors=${vendorNames(vendors).join(',')} default=${config.defaultVendor ?? 'none'} jwt=${config.jwt ? 'on' : 'off'}`,
  );

  const server = createServer((req, res) =>
    dispatch(req, res, routes).catch((err) => handleError(res, err as Error)),
  );
  await listen(server, config.server);
  const url = `http://${config.server.host}:${config.server.port}`;
  log.info(`listening ${url}`);

  return {
    url,
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

function buildAttestor(cfg: AttestorConfig): Promise<Attestor> {
  return cfg.mode === 'production' ? createDstackAttestor() : Promise.resolve(createSimulatorAttestor(cfg.seed));
}

function buildAuth(cfg: JwtAuthConfig): AuthService {
  return createJwtAuthService(cfg);
}

async function dispatch(req: IncomingMessage, res: ServerResponse, routes: Routes): Promise<void> {
  const pathname = parsePathname(req.url);
  if (pathname === null) throw new HttpError('invalid request target', 400);
  if (req.method === 'GET' && pathname === '/health') return routes.health(res);
  if (req.method === 'GET' && pathname === '/attestation') return routes.attestation(res);
  return routes.proxy(req, res);
}

function parsePathname(reqUrl: string | undefined): string | null {
  if (!reqUrl || !reqUrl.startsWith('/')) return null;
  try {
    return new URL(reqUrl, 'http://placeholder.invalid').pathname;
  } catch {
    return null;
  }
}

function handleError(res: ServerResponse, err: Error): void {
  const status = err instanceof HttpError ? err.status : 502;
  if (err instanceof AuthError || status < 500) log.debug('client error:', err.message);
  else log.warn('handler error:', err.message);

  if (!res.headersSent) writeJson(res, status, { error: err.message });
  else if (!res.writableEnded) res.destroy();
}

function listen(server: Server, config: ServerConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}
