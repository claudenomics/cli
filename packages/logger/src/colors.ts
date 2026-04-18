import chalk from 'chalk';

export const accent = chalk.hex('#f59e0b');
export const accentDim = chalk.hex('#78502b');

export const brand = chalk.bold.white;
export const brandDim = chalk.hex('#5c5c5c');

export const primary = chalk.white;
export const secondary = chalk.hex('#d9d9d9');
export const muted = chalk.hex('#999999');
export const dim = chalk.hex('#4d4d4d');

export const ok = chalk.green;
export const warn = chalk.yellow;
export const err = chalk.red;

export const cmd = (s: string): string => chalk.bold(primary(s));
export const desc = (s: string): string => muted(s);
export const link = (s: string): string => muted(chalk.underline(s));
export const ver = (s: string): string => dim(s);
