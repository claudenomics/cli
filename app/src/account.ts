import { api, type ProfileResponse, type UsageResponse } from '@claudenomics/api';

const TIMEOUT_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchProfile(wallet: string): Promise<ProfileResponse | null> {
  return Promise.race<ProfileResponse | null>([
    api.getProfile(wallet).catch(() => null),
    sleep(TIMEOUT_MS).then(() => null),
  ]);
}

export async function fetchUsage(wallet: string): Promise<UsageResponse | null> {
  return Promise.race<UsageResponse | null>([
    api.getUsage(wallet).catch(() => null),
    sleep(TIMEOUT_MS).then(() => null),
  ]);
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
