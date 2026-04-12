import { mkdir, open, readFile, rename, rm, stat, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Entry } from '@napi-rs/keyring';
import lockfile from 'proper-lockfile';

const SERVICE = 'claudenomics';
const ACCOUNT = 'session';

export interface Session {
  version: 1;
  userId: string;
  wallet: string;
  email?: string;
  createdAt: number;
  expiresAt?: number;
}

interface FileShape extends Session {}

function sessionPath(): string {
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(base, 'claudenomics', 'session.json');
}

function entry(): Entry {
  return new Entry(SERVICE, ACCOUNT);
}

async function withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
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
}

export async function loadSession(): Promise<Session | null> {
  const path = sessionPath();
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  let parsed: FileShape;
  try {
    parsed = JSON.parse(raw) as FileShape;
  } catch {
    return null;
  }
  if (parsed.version !== 1 || !parsed.userId || !parsed.wallet) return null;
  if (parsed.expiresAt != null && parsed.expiresAt <= Date.now()) return null;
  return parsed;
}

export async function getSessionToken(): Promise<string | null> {
  const session = await loadSession();
  if (!session) return null;
  try {
    return entry().getPassword();
  } catch {
    return null;
  }
}

export async function saveSession(session: Session, token: string): Promise<void> {
  const path = sessionPath();
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: 0o700 });

  await withLock(path, async () => {
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
}

export async function clearSession(): Promise<boolean> {
  const path = sessionPath();
  let cleared = false;
  try {
    if (entry().deletePassword()) cleared = true;
  } catch {}
  await withLock(path, async () => {
    try {
      await rm(path);
      cleared = true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  });
  return cleared;
}
