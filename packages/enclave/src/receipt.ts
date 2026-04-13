import { createHash } from 'node:crypto';
import { signAsync } from '@noble/secp256k1';
import type { Attestor } from './attestor.js';

const DOMAIN_SEPARATOR = Buffer.from('claudenomics-receipt-v1\0', 'utf8');
const MAX_UINT64_SAFE = Number.MAX_SAFE_INTEGER;

export interface Receipt {
  wallet: string;
  response_id: string;
  upstream: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  ts: number;
}

export interface SignedReceipt {
  receipt: Receipt;
  sig: string;
  pubkey: string;
  compose_hash: string;
}

function requireSafeInt(name: string, n: number): number {
  if (!Number.isFinite(n)) throw new TypeError(`receipt.${name} must be a finite number, got ${n}`);
  const truncated = Math.trunc(n);
  if (truncated < 0) throw new RangeError(`receipt.${name} must be >= 0, got ${truncated}`);
  if (truncated > MAX_UINT64_SAFE) throw new RangeError(`receipt.${name} exceeds MAX_SAFE_INTEGER`);
  return truncated;
}

function pushString(parts: Buffer[], s: string): void {
  const b = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(b.length, 0);
  parts.push(len, b);
}

function pushUint64(parts: Buffer[], n: number): void {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(n), 0);
  parts.push(b);
}

export function canonicalize(r: Receipt): Buffer {
  const input = requireSafeInt('input_tokens', r.input_tokens);
  const output = requireSafeInt('output_tokens', r.output_tokens);
  const ts = requireSafeInt('ts', r.ts);

  const parts: Buffer[] = [DOMAIN_SEPARATOR];
  pushString(parts, r.wallet);
  pushString(parts, r.response_id);
  pushString(parts, r.upstream);
  pushString(parts, r.model);
  pushUint64(parts, input);
  pushUint64(parts, output);
  pushUint64(parts, ts);
  return Buffer.concat(parts);
}

export async function signReceipt(
  attestor: Attestor,
  receipt: Receipt,
): Promise<SignedReceipt> {
  const digest = createHash('sha256').update(canonicalize(receipt)).digest();
  const sig = await signAsync(digest, attestor.privateKey);
  return {
    receipt,
    sig: Buffer.from(sig.toCompactRawBytes()).toString('hex'),
    pubkey: Buffer.from(attestor.publicKey).toString('hex'),
    compose_hash: attestor.composeHash(),
  };
}

export function encodeReceipt(signed: SignedReceipt): string {
  return Buffer.from(JSON.stringify(signed)).toString('base64');
}
