import chalk from 'chalk';
import { api, ApiError } from '@claudenomics/api';
import { getSessionToken, loadSession } from '@claudenomics/auth';
import { CliError } from './errors.js';
import { formatIdentity } from './format.js';
import { createFileReceiptStore } from './receipt-store.js';
import { retryPendingReceipts } from './receipts.js';

export async function runUsage(): Promise<void> {
  const session = await loadSession();
  if (!session) {
    throw new CliError(`not signed in — run ${chalk.cyan('claudenomics login')}`);
  }
  const token = await getSessionToken();
  if (!token) {
    throw new CliError(`session has no token in keychain — run ${chalk.cyan('claudenomics login')}`);
  }

  const store = createFileReceiptStore();
  await retryPendingReceipts(store);

  let totals;
  try {
    totals = await api.getUsage(session.wallet);
  } catch (err) {
    if (err instanceof ApiError) throw new CliError(`usage request failed: ${err.code}`);
    throw err;
  }

  const pending = await store.listPending();

  const lines: string[] = [];
  lines.push(formatIdentity(session));
  lines.push(`${chalk.gray('input  tokens')} : ${totals.inputTokens.toLocaleString()}`);
  lines.push(`${chalk.gray('output tokens')} : ${totals.outputTokens.toLocaleString()}`);
  if (totals.lastUpdated > 0) {
    lines.push(`${chalk.gray('last update  ')} : ${new Date(totals.lastUpdated).toISOString()}`);
  }
  if (pending.length > 0) {
    lines.push(chalk.yellow(`${pending.length} receipt(s) pending submission`));
  }
  process.stdout.write(lines.join('\n') + '\n');
}
