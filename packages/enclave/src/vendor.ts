import { anthropic, openai, type VendorConfig } from '@claudenomics/usage';

export type Vendor = 'anthropic' | 'openai';

export interface SelectedVendor {
  name: Vendor;
  config: VendorConfig;
}

export type VendorRegistry = Record<Vendor, SelectedVendor>;

export interface ResponseMeta {
  response_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
}

const REGISTRY: Record<Vendor, VendorConfig> = { anthropic, openai };

const ID_RE = /"id"\s*:\s*"([^"]+)"/;
const MODEL_RE = /"model"\s*:\s*"([^"]+)"/;

function isVendor(name: string): name is Vendor {
  return name in REGISTRY;
}

export function loadDefaultVendor(): Vendor | null {
  const raw = process.env.DEFAULT_UPSTREAM ?? process.env.UPSTREAM;
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!isVendor(lower)) {
    throw new Error(
      `DEFAULT_UPSTREAM must be one of: ${Object.keys(REGISTRY).join(', ')}; got '${raw}'`,
    );
  }
  return lower;
}

export function buildVendorRegistry(): VendorRegistry {
  const out: Partial<VendorRegistry> = {};
  for (const [name, config] of Object.entries(REGISTRY)) {
    out[name as Vendor] = { name: name as Vendor, config };
  }
  return out as VendorRegistry;
}

export function resolveVendor(
  registry: VendorRegistry,
  requested: string | undefined,
  defaultVendor: Vendor | null,
): SelectedVendor | null {
  if (requested) {
    const lower = requested.toLowerCase();
    return isVendor(lower) ? registry[lower] : null;
  }
  return defaultVendor ? registry[defaultVendor] : null;
}

export function vendorNames(registry: VendorRegistry): Vendor[] {
  return Object.keys(registry) as Vendor[];
}

export function extractMeta(
  vendor: VendorConfig,
  responseBody: Buffer,
  contentType: string | undefined,
): ResponseMeta {
  const text = responseBody.toString('utf8');
  const tokens = vendor.extractor.extract({
    method: 'POST',
    url: vendor.upstream,
    status: 200,
    requestBody: Buffer.alloc(0),
    responseBody,
    contentType,
  });
  return {
    response_id: ID_RE.exec(text)?.[1] ?? '',
    model: MODEL_RE.exec(text)?.[1] ?? '',
    input_tokens: tokens.inputTokens,
    output_tokens: tokens.outputTokens,
  };
}
