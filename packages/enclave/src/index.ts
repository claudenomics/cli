import { startServer } from './server.js';

export { startServer } from './server.js';
export { createAttestor } from './attestor.js';
export type { Attestor, AttestorMode } from './attestor.js';
export { signReceipt, encodeReceipt } from './receipt.js';
export type { Receipt, SignedReceipt } from './receipt.js';
export { AuthError, HttpError } from './errors.js';

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((err) => {
    process.stderr.write(`fatal: ${(err as Error).message}\n`);
    process.exit(1);
  });
}
