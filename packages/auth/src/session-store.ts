import { constants as fsConstants } from 'node:fs';
import { mkdir, open, rename, rm, stat, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Entry } from '@napi-rs/keyring';
import lockfile from 'proper-lockfile';

const KEYRING_SERVICE = 'claudenomics';
const KEYRING_ACCOUNT = 'session';

export interface Session {
  version: 1;
  userId: string;
  wallet: string;
  email?: string;
  createdAt: number;
  expiresAt?: number;
}

export interface SessionStore {
  load(): Promise<Session | null>;
  save(session: Session, token: string): Promise<void>;
  clear(): Promise<boolean>;
  getToken(): Promise<string | null>;
}

export interface XdgSessionStoreOptions {
  path?: string;
  service?: string;
  account?: string;
}

const NOFOLLOW = (fsConstants as { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;

function defaultSessionPath(): string {
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(base, 'claudenomics', 'session.json');
}

async function safeReadSession(path: string): Promise<string | null> {
  let fd;
  try {
    fd = await open(path, fsConstants.O_RDONLY | NOFOLLOW);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ELOOP' || code === 'EMLINK') return null;
    throw err;
  }
  try {
    const st = await fd.stat();
    if (!st.isFile()) return null;
    const myUid = typeof process.getuid === 'function' ? process.getuid() : undefined;
    if (myUid !== undefined && st.uid !== myUid) return null;
    return await fd.readFile('utf8');
  } finally {
    await fd.close();
  }
}

export function createXdgSessionStore(opts: XdgSessionStoreOptions = {}): SessionStore {
  const path = opts.path ?? defaultSessionPath();
  const service = opts.service ?? KEYRING_SERVICE;
  const account = opts.account ?? KEYRING_ACCOUNT;
  const entry = (): Entry => new Entry(service, account);

  const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    const release = await lockfile.lock(path, {
      realpath: false,
      lockfilePath: `${path}.lock`,
      retries: { retries: 5, minTimeout: 50, maxTimeout: 500 },
    });
    try {
      return await fn();
    } finally {
      await release();
    }
  };

  return {
    async load() {
      const raw = await safeReadSession(path);
      if (raw === null) return null;
      let parsed: Session;
      try {
        parsed = JSON.parse(raw) as Session;
      } catch {
        return null;
      }
      if (parsed.version !== 1 || !parsed.userId || !parsed.wallet) return null;
      if (parsed.expiresAt != null && parsed.expiresAt <= Date.now()) return null;
      return parsed;
    },

    async save(session, token) {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await withLock(async () => {
        const tmp = `${path}.tmp.${process.pid}`;
        try {
          const existing = await stat(tmp);
          if (existing.isFile()) await unlink(tmp);
        } catch {}
        const fd = await open(tmp, 'wx', 0o600);
        try {
          await fd.writeFile(JSON.stringify(session, null, 2));
        } finally {
          await fd.close();
        }
        await rename(tmp, path);
        entry().setPassword(token);
      });
    },

    async clear() {
      let cleared = false;
      try {
        if (entry().deletePassword()) cleared = true;
      } catch {}
      await withLock(async () => {
        try {
          await rm(path);
          cleared = true;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        }
      });
      return cleared;
    },

    async getToken() {
      try {
        return entry().getPassword();
      } catch {
        return null;
      }
    },
  };
}
