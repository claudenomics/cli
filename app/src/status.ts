import chalk from 'chalk';
import { getApiBaseUrl } from '@claudenomics/api';
import { getSessionToken, loadSession, type Session } from '@claudenomics/auth';
import { formatIdentity } from './format.js';
import { createFileReceiptStore } from './receipt-store.js';

interface CheckResult {
  ok: boolean;
  detail: string;
}

interface ProbeResult {
  ok: boolean;
  url: string;
  detail?: string;
  error?: string;
}

function ok(detail: string): CheckResult {
  return { ok: true, detail };
}

function fail(detail: string): CheckResult {
  return { ok: false, detail };
}

function mark(result: CheckResult): string {
  return result.ok ? chalk.green('✓') : chalk.red('✗');
}

function formatDuration(ms: number): string {
  if (ms < 0) return 'expired';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

async function probe(rawUrl: string, path: string, parseOk?: (body: unknown) => string | null): Promise<ProbeResult> {
  let url: URL;
  try {
    url = new URL(path, rawUrl);
  } catch {
    return { ok: false, url: rawUrl, error: 'invalid URL' };
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, url: rawUrl, error: `HTTP ${res.status}` };
    let detail: string | undefined;
    if (parseOk) {
      try {
        const body = await res.json();
        const parsed = parseOk(body);
        if (parsed === null) return { ok: false, url: rawUrl, error: 'health check rejected' };
        detail = parsed;
      } catch {
        return { ok: false, url: rawUrl, error: 'response not JSON' };
      }
    }
    return { ok: true, url: rawUrl, ...(detail ? { detail } : {}) };
  } catch (err) {
    return { ok: false, url: rawUrl, error: (err as Error).message };
  }
}

function sessionLine(session: Session | null): CheckResult {
  if (!session) return fail(`not signed in — run ${chalk.cyan('claudenomics login')}`);
  return ok(`Logged in as ${formatIdentity(session)}`);
}

function sessionExpiryLine(session: Session | null): CheckResult | null {
  if (!session || session.expiresAt === undefined) return null;
  const remaining = session.expiresAt - Date.now();
  if (remaining > 0) return ok(`Session valid (expires in ${formatDuration(remaining)})`);
  return fail(`Session expired — run ${chalk.cyan('claudenomics login')}`);
}

function tokenLine(sessionPresent: boolean, tokenPresent: boolean): CheckResult | null {
  if (!sessionPresent) return null;
  return tokenPresent ? null : fail('Session token missing from keychain');
}

function enclaveLine(probe: ProbeResult | null): CheckResult {
  if (probe === null) return fail('CLAUDENOMICS_ENCLAVE_URL not set');
  if (!probe.ok) return fail(`Enclave unreachable: ${probe.error}`);
  const host = new URL(probe.url).host;
  return ok(`Enclave reachable (${host}${probe.detail ? ` · ${probe.detail}` : ''})`);
}

function apiLine(probe: ProbeResult): CheckResult {
  if (!probe.ok) return fail(`API unreachable: ${probe.error}`);
  return ok(`API reachable (${new URL(probe.url).host})`);
}

export async function runStatus(): Promise<void> {
  const session = await loadSession();
  const token = session ? await getSessionToken() : null;

  const enclaveUrl = process.env.CLAUDENOMICS_ENCLAVE_URL;

  const [enclaveProbe, apiProbe] = await Promise.all([
    enclaveUrl
      ? probe(enclaveUrl, '/health', (body) => {
          const b = body as { ok?: boolean; mode?: string; vendors?: string[] };
          if (!b.ok) return null;
          return [b.mode, b.vendors?.join('+')].filter(Boolean).join(' · ');
        })
      : Promise.resolve(null),
    probe(getApiBaseUrl().toString(), '/.well-known/jwks.json'),
  ]);

  const store = createFileReceiptStore();
  const pending = await store.listPending();

  const lines: CheckResult[] = [
    sessionLine(session),
    sessionExpiryLine(session),
    tokenLine(session !== null, token !== null),
    enclaveLine(enclaveProbe),
    apiLine(apiProbe),
  ].filter((x): x is CheckResult => x !== null);

  for (const line of lines) {
    process.stdout.write(`${mark(line)} ${line.detail}\n`);
  }
  process.stdout.write(`  ${chalk.gray('Pending receipts:')} ${pending.length}\n`);
}
