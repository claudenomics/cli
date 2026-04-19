import { ApiError } from '@claudenomics/api';
import { CliError } from './errors.js';
import { unauthorizedError } from './session-check.js';

export interface ApiErrorHandlers {
  byCode?: Partial<Record<string, string>>;
  byStatus?: Partial<Record<number, string>>;
  fallback: (code: string) => string;
}

export function handleApiError(err: unknown, handlers: ApiErrorHandlers): never {
  if (!(err instanceof ApiError)) throw err;
  if (err.status === 401) throw unauthorizedError();
  const msg = handlers.byCode?.[err.code] ?? handlers.byStatus?.[err.status];
  throw new CliError(msg ?? handlers.fallback(err.code));
}
