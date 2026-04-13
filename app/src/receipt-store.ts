import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface SignedReceiptLike {
  receipt: { response_id?: string };
  sig: string;
  pubkey: string;
  compose_hash: string;
}

export interface PendingReceipt {
  path: string;
  signed: SignedReceiptLike;
}

export interface ReceiptStore {
  save(signed: SignedReceiptLike): Promise<string | null>;
  markSubmitted(responseId: string): Promise<void>;
  listPending(): Promise<PendingReceipt[]>;
}

export function defaultReceiptDir(): string {
  return join(homedir(), '.claudenomics', 'receipts');
}

const PENDING = 'pending';
const SUBMITTED = 'submitted';

export function createFileReceiptStore(dir: string = defaultReceiptDir()): ReceiptStore {
  const pendingDir = join(dir, PENDING);
  const submittedDir = join(dir, SUBMITTED);

  return {
    async save(signed) {
      const id = signed.receipt.response_id;
      if (!id) return null;
      await mkdir(pendingDir, { recursive: true, mode: 0o700 });
      const path = join(pendingDir, `${id}.json`);
      await writeFile(path, JSON.stringify(signed, null, 2), { mode: 0o600 });
      return path;
    },

    async markSubmitted(responseId) {
      await mkdir(submittedDir, { recursive: true, mode: 0o700 });
      const from = join(pendingDir, `${responseId}.json`);
      const to = join(submittedDir, `${responseId}.json`);
      try {
        await rename(from, to);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    },

    async listPending() {
      let files: string[];
      try {
        files = await readdir(pendingDir);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw err;
      }
      const out: PendingReceipt[] = [];
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const path = join(pendingDir, f);
        try {
          const data = JSON.parse(await readFile(path, 'utf8')) as SignedReceiptLike;
          out.push({ path, signed: data });
        } catch {}
      }
      return out;
    },
  };
}
