import type { Session } from '@claudenomics/auth';
import { styles } from './styles.js';

export function formatIdentity(s: Session): string {
  const parts = [
    s.email && styles.accent(s.email),
    styles.info(shortAddr(s.wallet)),
    styles.muted(s.userId),
  ].filter(Boolean);
  return parts.join(` ${styles.bullet} `);
}

export function shortAddr(addr: string): string {
  return addr.length <= 12 ? addr : `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
}
