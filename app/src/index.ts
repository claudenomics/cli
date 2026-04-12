#!/usr/bin/env node
import { Command } from 'commander';
import { createLogger, setLevel } from '@claudenomics/logger';
import { BUILTIN_COMMANDS, passthroughCommand } from './commands.js';
import { CliError } from './errors.js';

const log = createLogger('claudenomics');

const program = new Command('claudenomics')
  .description('Transparent wrapper around claude-code and codex with token accounting.')
  .option('--verbose', 'enable debug logging', () => setLevel('debug'));

for (const spec of BUILTIN_COMMANDS) program.addCommand(passthroughCommand(spec));

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof CliError) {
    log.error(err.message);
    process.exit(err.exitCode);
  }
  log.error('unexpected error:', (err as Error).stack ?? String(err));
  process.exit(1);
});
