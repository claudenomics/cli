import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Attestor } from './attestor.js';
import { writeJson } from './http.js';
import type { ProxyService } from './proxy-service.js';
import { vendorNames, type Vendor, type VendorRegistry } from './vendor.js';

export interface Routes {
  health(res: ServerResponse): void;
  attestation(res: ServerResponse): Promise<void>;
  proxy(req: IncomingMessage, res: ServerResponse): Promise<void>;
}

export function createRoutes(
  attestor: Attestor,
  vendors: VendorRegistry,
  defaultVendor: Vendor | null,
  proxy: ProxyService,
): Routes {
  return {
    health(res) {
      writeJson(res, 200, {
        ok: true,
        mode: attestor.mode,
        vendors: vendorNames(vendors),
        default_vendor: defaultVendor,
      });
    },
    async attestation(res) {
      const quote = await attestor.quote();
      writeJson(res, 200, {
        mode: attestor.mode,
        pubkey: Buffer.from(attestor.publicKey).toString('hex'),
        compose_hash: attestor.composeHash(),
        quote: Buffer.from(quote).toString('hex'),
      });
    },
    proxy(req, res) {
      return proxy.handle(req, res);
    },
  };
}
