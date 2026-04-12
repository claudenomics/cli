#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { AuthError, clearSession, loadSession, login } from '@claudenomics/auth';
import { createLogger, setLevel } from '@claudenomics/logger';
import { BUILTIN_COMMANDS, passthroughCommand } from './commands.js';
import { CliError } from './errors.js';
import { formatIdentity } from './format.js';

const log = createLogger('claudenomics');

const program = new Command('claudenomics')
  .description('Transparent wrapper around claude-code and codex with token accounting.')
  .option('--verbose', 'enable debug logging', () => setLevel('debug'));

program
  .command('login')
  .description('Sign in and create (or attach) your Solana wallet via Privy.')
  .action(async () => {
    const s = await login();
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
  .description('Clear the local session.')
  .action(async () => {
    const cleared = await clearSession();
    process.stdout.write(cleared ? `${chalk.green('✓')} logged out\n` : 'already logged out\n');
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
  log.error('unexpected error:', (err as Error).stack ?? String(err));
  process.exit(1);
});
