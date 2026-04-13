import { createHash, randomBytes } from 'node:crypto';
import { getPublicKey } from '@noble/secp256k1';
import { createLogger } from '@claudenomics/logger';
import { deriveKey, validateSeed } from './seed.js';

const log = createLogger('enclave·attestor');

export type AttestorMode = 'production' | 'simulator';

export interface Attestor {
  mode: AttestorMode;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  quote(): Promise<Uint8Array>;
  composeHash(): string;
}

export type AttestorConfig =
  | { mode: 'production' }
  | { mode: 'simulator'; seed: string };

export function loadAttestorConfig(): AttestorConfig {
  const rawMode = process.env.DSTACK_MODE;
  if (rawMode === undefined || rawMode === '') {
    throw new Error(
      'DSTACK_MODE must be set to "production" or "simulator" (fail-closed; no implicit default)',
    );
  }
  if (rawMode === 'production') return { mode: 'production' };
  if (rawMode === 'simulator') {
    const seed = process.env.ENCLAVE_SEED;
    if (seed === undefined || seed === '') {
      throw new Error('ENCLAVE_SEED must be set in simulator mode');
    }
    return { mode: 'simulator', seed };
  }
  throw new Error(
    `DSTACK_MODE must be exactly "production" or "simulator", got '${rawMode}' (fail-closed to prevent typos)`,
  );
}

export async function createAttestor(cfg: AttestorConfig): Promise<Attestor> {
  return cfg.mode === 'production' ? createDstackAttestor() : createSimulatorAttestor(cfg.seed);
}

export async function createDstackAttestor(): Promise<Attestor> {
  const dstack = await import('@phala/dstack-sdk');
  const client = new dstack.DstackClient();
  const keyResp = await client.getKey('receipts');
  const privateKey = new Uint8Array(keyResp.key);
  const publicKey = getPublicKey(privateKey, true);
  const info = await client.info();
  const composeHash: string = info.compose_hash ?? '';
  log.info('production mode — compose_hash', composeHash);
  return {
    mode: 'production',
    privateKey,
    publicKey,
    async quote(): Promise<Uint8Array> {
      const reportData = Buffer.alloc(64);
      Buffer.from(publicKey).copy(reportData, 0, 0, Math.min(publicKey.length, 64));
      const q = await client.getQuote(reportData);
      if (typeof q.quote !== 'string') throw new Error('dstack returned non-string quote');
      const hex = q.quote.startsWith('0x') ? q.quote.slice(2) : q.quote;
      return new Uint8Array(Buffer.from(hex, 'hex'));
    },
    composeHash: () => composeHash,
  };
}

export function createSimulatorAttestor(seed: string): Attestor {
  const ikm = validateSeed(seed);
  if (!ikm) {
    throw new Error(
      'ENCLAVE_SEED must be ≥32 bytes of entropy in one canonical encoding (hex ≥64 chars, standard base64 ≥44 chars, or URL-safe base64 ≥43 chars). Mixed encodings are rejected.',
    );
  }
  const privateKey = deriveKey(ikm);
  const publicKey = getPublicKey(privateKey, true);
  const simHash = createHash('sha256').update(publicKey).update('simulator').digest('hex');
  log.info('simulator mode — ephemeral compose_hash', simHash);
  return {
    mode: 'simulator',
    privateKey,
    publicKey,
    async quote(): Promise<Uint8Array> {
      return new Uint8Array(0);
    },
    composeHash: () => simHash,
  };
}

export function generateSimulatorSeed(): string {
  return randomBytes(32).toString('hex');
}
