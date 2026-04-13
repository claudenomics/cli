import { Command } from 'commander';
import chalk from 'chalk';
import { configureApi } from '@claudenomics/api';
import {
  AuthError,
  forceRefresh,
  getSessionToken,
  loadSession,
  login,
  logout,
} from '@claudenomics/auth';
import { createLogger, setLevel } from '@claudenomics/logger';
import { BUILTIN_COMMANDS, passthroughCommand } from './commands.js';
import { applyEmbeddedDefaults } from './defaults.js';
import { CliError } from './errors.js';
import { formatIdentity } from './format.js';
import { runStatus } from './status.js';
import { runUsage } from './usage.js';

applyEmbeddedDefaults();
configureApi({
  tokenProvider: getSessionToken,
  onUnauthorized: forceRefresh,
});

const log = createLogger('claudenomics');

const program = new Command('claudenomics')
  .description('Transparent wrapper around claude-code and codex with token accounting.')
  .option('--verbose', 'enable debug logging', () => setLevel('debug'));

program
  .command('login')
  .description('Sign in and create (or attach) your Solana wallet via Privy.')
  .option('--auth-url <url>', 'override the default auth URL (dev only)')
  .action(async (opts: { authUrl?: string }) => {
    const s = await login({ authUrl: opts.authUrl });
    process.stdout.write(`${chalk.green('✓')} ${formatIdentity(s)}\n`);
  });

program
  .command('whoami')
  .description('Show your email, wallet, and session status.')
  .action(async () => {
    const s = await loadSession();
    process.stdout.write(s ? `${formatIdentity(s)}\n` : `not signed in — run ${chalk.cyan('claudenomics login')}\n`);
  });

program
  .command('logout')
  .description('Revoke the session on the server and clear local state.')
  .action(async () => {
    const cleared = await logout();
    process.stdout.write(cleared ? `${chalk.green('✓')} logged out\n` : 'already logged out\n');
  });

program
  .command('usage')
  .description('Show your accumulated token usage from the backend.')
  .action(async () => {
    await runUsage();
  });

program
  .command('status')
  .description('Check session, enclave, backend reachability, and pending receipts.')
  .action(async () => {
    await runStatus();
  });

for (const spec of BUILTIN_COMMANDS) program.addCommand(passthroughCommand(spec));

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof CliError) {
    log.error(err.message);
    process.exit(err.exitCode);
  }
  if (err instanceof AuthError) {
    log.error(err.message);
    process.exit(1);
  }
  const e = err as Error;
  const debug = process.env.CLAUDENOMICS_LOG === 'debug';
  log.error('unexpected error:', debug ? (e.stack ?? String(e)) : e.message);
  process.exit(1);
});
