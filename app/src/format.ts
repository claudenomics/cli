import chalk from 'chalk';
import type { Session } from '@claudenomics/auth';

export function formatIdentity(s: Session): string {
  const parts = [s.email && chalk.white(s.email), chalk.cyan(shortAddr(s.wallet)), chalk.gray(s.userId)].filter(Boolean);
  return parts.join(chalk.gray(' · '));
}

function shortAddr(addr: string): string {
  return addr.length <= 12 ? addr : `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
