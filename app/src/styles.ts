import chalk from 'chalk';

export const styles = {
  check: chalk.green('✓'),
  cross: chalk.red('✗'),
  bullet: chalk.gray('·'),
  success: (s: string): string => chalk.green(s),
  error: (s: string): string => chalk.red(s),
  warn: (s: string): string => chalk.yellow(s),
  muted: (s: string): string => chalk.gray(s),
  info: (s: string): string => chalk.cyan(s),
  accent: (s: string): string => chalk.white(s),
  cmd: (s: string): string => chalk.cyan(s),
};
