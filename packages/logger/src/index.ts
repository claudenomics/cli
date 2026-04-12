import chalk from 'chalk';

export type Level = 'debug' | 'info' | 'warn' | 'error';

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
let currentLevel: Level = (process.env.CLAUDENOMICS_LOG as Level) || 'info';

export function setLevel(level: Level): void {
  currentLevel = level;
  process.env.CLAUDENOMICS_LOG = level;
}

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export function createLogger(scope: string): Logger {
  const labels: Record<Level, string> = {
    debug: chalk.gray(`${scope}·debug`),
    info: chalk.cyan(scope),
    warn: chalk.yellow(`${scope}·warn`),
    error: chalk.red(`${scope}·error`),
  };

  const emit = (level: Level) =>
    (...args: unknown[]): void => {
      if (order[level] < order[currentLevel]) return;
      const body = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      process.stderr.write(`${labels[level]} ${body}\n`);
    };

  return {
    debug: emit('debug'),
    info: emit('info'),
    warn: emit('warn'),
    error: emit('error'),
  };
}
