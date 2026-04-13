import { execFileSync, spawn } from 'node:child_process';
import chalk from 'chalk';
import { getSessionToken, loadSession } from '@claudenomics/auth';
import { createLogger } from '@claudenomics/logger';
import { startProxy, type ResponseHandler } from '@claudenomics/proxy';
import type { TokenUsage } from '@claudenomics/usage';
import { getVendor } from './vendors.js';
import { BinaryNotFoundError, CliError } from './errors.js';
import { createFileReceiptStore, type ReceiptStore } from './receipt-store.js';
import { persistAndSubmitReceipt, retryPendingReceipts } from './receipts.js';

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
    throw new CliError(
      'CLAUDENOMICS_ENCLAVE_URL is set but no session — run `claudenomics login` first',
    );
  }
  return {
    upstream: new URL(url),
    buildHeaders: async () => {
      const token = await getSessionToken();
      if (!token) {
        throw new CliError('session has no token in keychain — run `claudenomics login` again');
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
    throw new CliError(`not signed in — run ${chalk.cyan('claudenomics login')}`);
  }
  const vendor = getVendor(vendorName);
  const binaryPath = findBinary(binary);
  const totals: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  const enclave = await loadEnclaveConfig(vendorName);

  let receiptStore: ReceiptStore | null = null;
  if (enclave) {
    receiptStore = createFileReceiptStore();
    retryPendingReceipts(receiptStore).catch((err) => {
      log.debug('pending retry failed:', (err as Error).message);
    });
  }

  const countTokens: ResponseHandler = (response) => {
    const usage = vendor.extractor.extract(response);
    totals.inputTokens += usage.inputTokens;
    totals.outputTokens += usage.outputTokens;
  };

  const handlers: ResponseHandler[] = [countTokens];
  if (receiptStore) handlers.push(persistAndSubmitReceipt(receiptStore));

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
    await proxy.stop();
    const route = enclave ? `via ${enclave.upstream.host}` : 'direct';
    process.stderr.write(
      `${chalk.cyan('claudenomics')} in=${totals.inputTokens} out=${totals.outputTokens} (${route})\n`,
    );
  }
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
