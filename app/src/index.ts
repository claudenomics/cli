import chalk from 'chalk';
import { Command as ProgramCommand } from 'commander';
import { configureApi } from '@claudenomics/api';
import {
  AuthError,
  forceRefresh,
  getSessionToken,
  loadSession,
} from '@claudenomics/auth';
import { createLogger, setLevel } from '@claudenomics/logger';
import { BUILTIN_COMMANDS, passthroughCommand } from './commands.js';
import { applyConfigToEnv, resolveConfig } from './config.js';
import { CliError } from './errors.js';
import { formatIdentity } from './format.js';
import { printHome } from './home.js';
import { runLeaderboard } from './leaderboard.js';
import { runLogin } from './login-ui.js';
import { runLogout } from './logout-ui.js';
import { runProfileView } from './profile.js';
import { runWhoami } from './whoami-ui.js';
import { runStatus } from './status.js';
import { styles } from './styles.js';
import { text } from './text.js';
import { runUpdate } from './update-check.js';
import { runUsage } from './usage.js';

const config = resolveConfig();
applyConfigToEnv(config);
if (config.logLevel) setLevel(config.logLevel);
configureApi({
  tokenProvider: getSessionToken,
  onUnauthorized: forceRefresh,
});

{
  const args = process.argv.slice(2);
  const subCommand = args.find((a) => !a.startsWith('-'));
  const wantsHelp = args.includes('--help') || args.includes('-h');
  const wantsVersion = args.includes('--version') || args.includes('-v');
  if (!subCommand && !wantsHelp && !wantsVersion) {
    if (args.includes('--no-color')) chalk.level = 0;
    if (args.includes('--verbose')) setLevel('debug');
    await printHome();
    process.exit(0);
  }
}

const log = createLogger('claudenomics');

declare const __CLAUDENOMICS_VERSION__: string;

const program = new ProgramCommand('claudenomics')
  .description(text.help.program)
  .version(__CLAUDENOMICS_VERSION__, '-v, --version', text.help.version)
  .option('--verbose', text.help.verbose, () => setLevel('debug'))
  .option('--no-color', text.help.noColor);

program.hook('preAction', () => {
  if (program.opts().color === false) chalk.level = 0;
});

program
  .command('login')
  .description(text.help.login.summary)
  .option('--auth-url <url>', text.help.login.authUrlFlag)
  .action(async (opts: { authUrl?: string }) => {
    await runLogin(opts);
  });

program
  .command('whoami')
  .description(text.help.whoami)
  .action(async () => {
    await runWhoami();
  });

program
  .command('logout')
  .description(text.help.logout)
  .action(async () => {
    await runLogout();
  });

const parseIntOption = (v: string): number => Number.parseInt(v, 10);

program
  .command('usage')
  .description(text.help.usage)
  .option('--period <p>', text.help.usagePeriod, 'all')
  .action(runUsage);

program
  .command('profile [handle]')
  .description(text.help.profile)
  .option('--period <p>', text.help.profilePeriod, 'all')
  .action(runProfileView);

program
  .command('leaderboard')
  .description(text.help.leaderboard)
  .option('--view <v>', text.help.leaderboardView, 'builders')
  .option('--period <p>', text.help.leaderboardPeriod, 'all')
  .option('--league <slug>', text.help.leaderboardLeague)
  .option('--search <q>', text.help.leaderboardSearch)
  .option('--page <n>', text.help.leaderboardPage, parseIntOption, 1)
  .option('--page-size <n>', text.help.leaderboardPageSize, parseIntOption, 25)
  .action(runLeaderboard);

program
  .command('status')
  .description(text.help.status)
  .action(async () => {
    await runStatus();
  });

program
  .command('update')
  .description(text.help.update)
  .action(async () => {
    await runUpdate();
  });

for (const cmd of BUILTIN_COMMANDS) program.addCommand(passthroughCommand(cmd));

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
  log.error(text.errors.unexpected, debug ? (e.stack ?? String(e)) : e.message);
  process.exit(1);
});
