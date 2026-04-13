import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface SignedReceiptLike {
  receipt: { response_id?: string };
  sig: string;
  pubkey: string;
  compose_hash: string;
}

export interface ReceiptStore {
  save(signed: SignedReceiptLike): Promise<string | null>;
}

export function defaultReceiptDir(): string {
  return join(homedir(), '.claudenomics', 'receipts');
}

export function createFileReceiptStore(dir: string = defaultReceiptDir()): ReceiptStore {
  return {
    async save(signed) {
      const id = signed.receipt.response_id;
      if (!id) return null;
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const path = join(dir, `${id}.json`);
      await writeFile(path, JSON.stringify(signed, null, 2), { mode: 0o600 });
      return path;
    },
  };
}
