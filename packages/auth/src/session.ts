import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface Session {
  version: 1;
  token: string;
  userId: string;
  wallet: string;
  email?: string;
  createdAt: number;
}

function sessionPath(): string {
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(base, 'claudenomics', 'session.json');
}

export async function loadSession(): Promise<Session | null> {
  try {
    const parsed = JSON.parse(await readFile(sessionPath(), 'utf8')) as Session;
    return parsed.version === 1 && parsed.token && parsed.userId && parsed.wallet ? parsed : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    if (err instanceof SyntaxError) return null;
    throw err;
  }
}

export async function saveSession(session: Session): Promise<void> {
  const path = sessionPath();
  const tmp = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(tmp, JSON.stringify(session, null, 2), { mode: 0o600 });
  await rename(tmp, path);
}

export async function clearSession(): Promise<boolean> {
  try {
    await rm(sessionPath());
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}
