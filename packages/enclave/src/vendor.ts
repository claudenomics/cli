import { anthropic, openai, type VendorConfig } from '@claudenomics/usage';

export type Vendor = 'anthropic' | 'openai';

export interface SelectedVendor {
  name: Vendor;
  config: VendorConfig;
}

export interface ResponseMeta {
  response_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
}

const REGISTRY: Record<Vendor, VendorConfig> = { anthropic, openai };

const ID_RE = /"id"\s*:\s*"([^"]+)"/;
const MODEL_RE = /"model"\s*:\s*"([^"]+)"/;

export function loadVendorName(): Vendor {
  const raw = (process.env.UPSTREAM ?? 'anthropic').toLowerCase();
  if (!(raw in REGISTRY)) {
    throw new Error(`UPSTREAM must be one of: ${Object.keys(REGISTRY).join(', ')}; got '${raw}'`);
  }
  return raw as Vendor;
}

export function selectVendor(name: Vendor): SelectedVendor {
  return { name, config: REGISTRY[name] };
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
