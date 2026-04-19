import {
  api,
  type ProfileMeResponse,
  type ProfileResponse,
  type UsageResponse,
} from '@claudenomics/api';

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

export async function fetchMe(): Promise<ProfileMeResponse | null> {
  return Promise.race<ProfileMeResponse | null>([
    api.getMe().catch(() => null),
    sleep(TIMEOUT_MS).then(() => null),
  ]);
}

export async function fetchUsage(wallet: string): Promise<UsageResponse | null> {
  return Promise.race<UsageResponse | null>([
    api.getUsage(wallet).catch(() => null),
    sleep(TIMEOUT_MS).then(() => null),
  ]);
}
