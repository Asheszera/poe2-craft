/**
 * Result type used across every layer boundary that can fail for expected
 * reasons (parsing, network, provider errors).
 *
 * Rationale: throwing is reserved for programmer errors. Anything a user can
 * trigger — pasting garbage into the clipboard, an API key that expired — must
 * be representable in the type system so the UI is forced to handle it.
 */
export type Result<T, E = AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok;

/** Stable, machine-readable error codes. Never render these directly. */
export type AppErrorCode =
  | 'PARSE_NOT_AN_ITEM'
  | 'PARSE_MALFORMED'
  | 'PARSE_UNKNOWN_SECTION'
  | 'DATA_NOT_FOUND'
  | 'AI_PROVIDER_ERROR'
  | 'AI_NOT_CONFIGURED'
  | 'PRICE_SOURCE_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'UNKNOWN';

export interface AppError {
  readonly code: AppErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

export const appError = (
  code: AppErrorCode,
  message: string,
  extra?: { details?: Record<string, unknown>; cause?: unknown },
): AppError => ({
  code,
  message,
  ...(extra?.details ? { details: extra.details } : {}),
  ...(extra?.cause !== undefined ? { cause: extra.cause } : {}),
});
