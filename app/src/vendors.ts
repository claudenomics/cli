import { anthropic, openai, type VendorConfig } from '@claudenomics/usage';

const VENDORS: Record<string, VendorConfig> = {
  [anthropic.name]: anthropic,
  [openai.name]: openai,
};

export function getVendor(name: string): VendorConfig {
  const v = VENDORS[name];
  if (!v) {
    const known = Object.keys(VENDORS).join(', ') || '(none)';
    throw new Error(`Unknown vendor '${name}'. Registered: ${known}.`);
  }
  return v;
}

export function vendorNames(): string[] {
  return Object.keys(VENDORS);
}
