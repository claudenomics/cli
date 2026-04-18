import { constants as fsConstants } from 'node:fs';
import { mkdir, open, rename, rm, stat, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Entry } from '@napi-rs/keyring';
import lockfile from 'proper-lockfile';

const KEYRING_SERVICE = 'claudenomics';
const KEYRING_ACCOUNT = 'session';

export interface Session {
  version: 2;
  userId: string;
  wallet: string;
  email?: string;
  createdAt: number;
  expiresAt: number;
  refreshExpiresAt: number;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SessionStore {
  load(): Promise<Session | null>;
  save(session: Session, tokens: SessionTokens): Promise<void>;
  clear(): Promise<boolean>;
  getTokens(): Promise<SessionTokens | null>;
  withLock<T>(fn: () => Promise<T>): Promise<T>;
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

function validSession(raw: unknown): raw is Session {
  if (!raw || typeof raw !== 'object') return false;
  const s = raw as Record<string, unknown>;
  return (
    s.version === 2 &&
    typeof s.userId === 'string' &&
    typeof s.wallet === 'string' &&
    typeof s.createdAt === 'number' &&
    typeof s.expiresAt === 'number' &&
    typeof s.refreshExpiresAt === 'number' &&
    (s.email === undefined || typeof s.email === 'string')
  );
}

function validTokens(raw: unknown): raw is SessionTokens {
  if (!raw || typeof raw !== 'object') return false;
  const t = raw as Record<string, unknown>;
  return typeof t.accessToken === 'string' && typeof t.refreshToken === 'string';
}

export interface XdgSessionStoreOptions {
  path?: string;
  service?: string;
}

export function createXdgSessionStore(opts: XdgSessionStoreOptions = {}): SessionStore {
  const path = opts.path ?? defaultSessionPath();
  const service = opts.service ?? KEYRING_SERVICE;
  const entry = (): Entry => new Entry(service, KEYRING_ACCOUNT);

  const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const release = await lockfile.lock(path, {
      realpath: false,
      lockfilePath: `${path}.lock`,
      retries: { retries: 10, minTimeout: 50, maxTimeout: 500 },
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
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
      if (!validSession(parsed)) return null;
      if (parsed.refreshExpiresAt <= Date.now()) return null;
      return parsed;
    },

    async save(session, tokens) {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await withLock(async () => {
        entry().setPassword(JSON.stringify(tokens));
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

    async getTokens() {
      let raw: string | null;
      try {
        raw = entry().getPassword();
      } catch {
        return null;
      }
      if (!raw) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
      return validTokens(parsed) ? parsed : null;
    },

    withLock,
  };
}
