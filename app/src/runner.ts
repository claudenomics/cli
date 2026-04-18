import { execFileSync, spawn } from 'node:child_process';
import { getSessionToken, loadSession } from '@claudenomics/auth';
import { createLogger } from '@claudenomics/logger';
import { startProxy, type ResponseHandler } from '@claudenomics/proxy';
import { addUsage, newUsage, type TokenUsage } from '@claudenomics/usage';
import { createRootAbortController } from './abort.js';
import { BinaryNotFoundError, CliError } from './errors.js';
import { createFileReceiptStore, type ReceiptStore } from './receipt-store.js';
import { persistAndSubmitReceipt, retryPendingReceipts } from './receipts.js';
import { styles } from './styles.js';
import { text } from './text.js';
import { getVendor } from './vendors.js';

const log = createLogger('claudenomics·runner');

const SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

const WALLET_HEADER = 'x-claudenomics-wallet';
const AUTH_HEADER = 'x-claudenomics-auth';
const VENDOR_HEADER = 'x-claudenomics-vendor';

interface EnclaveConfig {
  upstream: URL;
  buildHeaders: () => Promise<Record<string, string>>;
}

async function loadEnclaveConfig(vendorName: string): Promise<EnclaveConfig | null> {
  const url = process.env.CLAUDENOMICS_ENCLAVE_URL;
  if (!url) return null;
  const session = await loadSession();
  if (!session) {
    throw new CliError(text.session.enclaveSetNoSession);
  }
  return {
    upstream: new URL(url),
    buildHeaders: async () => {
      const token = await getSessionToken();
      if (!token) {
        throw new CliError(text.session.noTokenRelogin);
      }
      return {
        [WALLET_HEADER]: session.wallet,
        [AUTH_HEADER]: `Bearer ${token}`,
        [VENDOR_HEADER]: vendorName,
      };
    },
  };
}

export async function run(vendorName: string, binary: string, args: string[]): Promise<number> {
  const session = await loadSession();
  if (!session) {
    throw new CliError(text.session.notSignedIn(styles.cmd('claudenomics login')));
  }
  const vendor = getVendor(vendorName);
  const binaryPath = findBinary(binary);
  const totals: TokenUsage = newUsage();
  const enclave = await loadEnclaveConfig(vendorName);
  const root = createRootAbortController();

  let receiptStore: ReceiptStore | null = null;
  if (enclave) {
    receiptStore = createFileReceiptStore();
    retryPendingReceipts(receiptStore, root.signal).catch((err) => {
      log.debug('pending retry failed:', (err as Error).message);
    });
  }

  const countTokens: ResponseHandler = (response) => {
    addUsage(totals, vendor.extractor.extract(response));
  };

  const handlers: ResponseHandler[] = [countTokens];
  if (receiptStore) handlers.push(persistAndSubmitReceipt(receiptStore, root.signal));

  const proxy = await startProxy({
    upstream: enclave?.upstream ?? new URL(vendor.upstream),
    onResponse: handlers,
    ...(enclave ? { requestHeaders: enclave.buildHeaders } : {}),
  });

  try {
    const env = vendor.childEnv(proxy.url, process.env);
    const { exitCode } = await spawnChild(binaryPath, args, env);
    return exitCode;
  } finally {
    root.abort();
    await proxy.stop();
    const route = enclave ? `via ${enclave.upstream.host}` : 'direct';
    process.stderr.write(`${styles.info('claudenomics')} ${formatTotals(totals)} (${route})\n`);
  }
}

function formatTotals(t: TokenUsage): string {
  const parts = [`in=${t.inputTokens}`, `out=${t.outputTokens}`];
  if (t.cacheReadTokens > 0) parts.push(`cache_r=${t.cacheReadTokens}`);
  if (t.cacheCreateTokens > 0) parts.push(`cache_w=${t.cacheCreateTokens}`);
  if (t.webSearchRequests > 0) parts.push(`web=${t.webSearchRequests}`);
  return parts.join(' ');
}

function findBinary(name: string): string {
  try {
    const out = execFileSync('which', [name], { encoding: 'utf8' }).trim();
    if (!out) throw new BinaryNotFoundError(name);
    return out;
  } catch {
    throw new BinaryNotFoundError(name);
  }
}

function spawnChild(binary: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { env, stdio: 'inherit' });

    const handlers = SIGNALS.map((sig) => {
      const handler = () => {
        if (!child.killed) child.kill(sig);
      };
      process.on(sig, handler);
      return [sig, handler] as const;
    });
    const cleanup = () => {
      for (const [sig, handler] of handlers) process.off(sig, handler);
    };

    child.on('error', (err) => {
      cleanup();
      reject(err);
    });
    child.on('exit', (code, signal) => {
      cleanup();
      resolve({ exitCode: code ?? (signal ? 128 : 0) });
    });
  });
}
