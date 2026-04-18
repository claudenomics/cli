import { getApiBaseUrl } from '@claudenomics/api';
import { loadSession, type Session } from '@claudenomics/auth';
import { formatIdentity } from './format.js';
import { createFileReceiptStore } from './receipt-store.js';
import { styles } from './styles.js';
import { text } from './text.js';

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
  return result.ok ? styles.check : styles.cross;
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
  if (!session) return fail(text.session.notSignedIn(styles.cmd('claudenomics login')));
  return ok(text.status.loggedInAs(formatIdentity(session)));
}

function sessionExpiryLine(session: Session | null): CheckResult | null {
  if (!session) return null;
  const access = session.expiresAt - Date.now();
  const refresh = session.refreshExpiresAt - Date.now();
  if (refresh <= 0) return fail(text.status.sessionExpired(styles.cmd('claudenomics login')));
  const accessDetail = access > 0 ? formatDuration(access) : text.status.accessExpired;
  return ok(text.status.accessLine(accessDetail, formatDuration(refresh)));
}

function enclaveLine(probe: ProbeResult | null): CheckResult {
  if (probe === null) return fail(text.status.enclaveNotSet);
  if (!probe.ok) return fail(text.status.enclaveUnreachable(probe.error ?? ''));
  const host = new URL(probe.url).host;
  return ok(text.status.enclaveReachable(host, probe.detail));
}

function apiLine(probe: ProbeResult): CheckResult {
  if (!probe.ok) return fail(text.status.apiUnreachable(probe.error ?? ''));
  return ok(text.status.apiReachable(new URL(probe.url).host));
}

export async function runStatus(): Promise<void> {
  const session = await loadSession();

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
    enclaveLine(enclaveProbe),
    apiLine(apiProbe),
  ].filter((x): x is CheckResult => x !== null);

  for (const line of lines) {
    process.stdout.write(`${mark(line)} ${line.detail}\n`);
  }
  process.stdout.write(`  ${styles.muted(text.status.pendingReceipts)} ${pending.length}\n`);
}
