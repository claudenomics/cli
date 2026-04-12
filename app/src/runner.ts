import { execFileSync, spawn } from 'node:child_process';
import chalk from 'chalk';
import { startProxy, type ResponseHandler } from '@claudenomics/proxy';
import type { TokenUsage } from '@claudenomics/usage';
import { getVendor } from './vendors.js';
import { BinaryNotFoundError } from './errors.js';

const SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

export async function run(vendorName: string, binary: string, args: string[]): Promise<number> {
  const vendor = getVendor(vendorName);
  const binaryPath = findBinary(binary);
  const totals: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  const countTokens: ResponseHandler = (response) => {
    const usage = vendor.extractor.extract(response);
    totals.inputTokens += usage.inputTokens;
    totals.outputTokens += usage.outputTokens;
  };

  const proxy = await startProxy({
    upstream: new URL(vendor.upstream),
    onResponse: [countTokens],
  });

  try {
    const env = vendor.childEnv(proxy.url, process.env);
    const { exitCode } = await spawnChild(binaryPath, args, env);
    return exitCode;
  } finally {
    await proxy.stop();
    process.stderr.write(
      `${chalk.cyan('claudenomics')} in=${totals.inputTokens} out=${totals.outputTokens}\n`,
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
