import { hkdfSync } from 'node:crypto';

const SALT = Buffer.from('claudenomics-enclave-v1', 'utf8');
const INFO = Buffer.from('secp256k1-signing', 'utf8');

const HEX_RE = /^[0-9a-fA-F]+$/;
const B64_STD_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const B64_URL_RE = /^[A-Za-z0-9_-]+={0,2}$/;

export function deriveKey(ikm: Buffer): Uint8Array {
  return new Uint8Array(hkdfSync('sha256', ikm, SALT, INFO, 32));
}

export function validateSeed(seed: string): Buffer | null {
  if (seed.length >= 64 && seed.length % 2 === 0 && HEX_RE.test(seed)) {
    const buf = Buffer.from(seed, 'hex');
    if (buf.length >= 32) return buf;
  }
  if (B64_STD_RE.test(seed)) {
    const buf = Buffer.from(seed, 'base64');
    if (buf.length >= 32) return buf;
  }
  if (B64_URL_RE.test(seed)) {
    const normalized = seed.replace(/-/g, '+').replace(/_/g, '/');
    const buf = Buffer.from(normalized, 'base64');
    if (buf.length >= 32) return buf;
  }
  return null;
}
