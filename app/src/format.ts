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

function shortAddr(addr: string): string {
  return addr.length <= 12 ? addr : `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
