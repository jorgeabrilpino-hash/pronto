/**
 * Stable error codes shared by API and front end.
 * VALIDATION_ERROR, UNAUTHENTICATED and INTERNAL are not in the business list of
 * BACKEND_PLAN section 4; they cover HTTP 400, 401 and 500. NOT_FOUND, PAYLOAD_TOO_LARGE and
 * FEATURE_UNAVAILABLE cover an unknown route, a body over 1 MB and a feature not built yet.
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'RUC_INVALID',
  'RUC_TAKEN',
  'WALLET_TAKEN',
  'COMPANY_NOT_FOUND',
  'SELF_INVOICE',
  'INVOICE_DUPLICATE',
  'INVOICE_OVERDUE',
  'INVOICE_NOT_FOUND',
  'INVALID_STATE',
  'OFFER_EXISTS',
  'ATTACHMENT_INVALID',
  'CHAIN_MISMATCH',
  'CHAIN_UNAVAILABLE',
  'CHALLENGE_EXPIRED',
  'SIGNATURE_INVALID',
  'RATE_LIMITED',
  'INTERNAL',
  // Additions from B4 (HTTP layer): unknown route, oversized body, feature not built yet.
  'NOT_FOUND',
  'PAYLOAD_TOO_LARGE',
  'FEATURE_UNAVAILABLE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  RUC_INVALID: 422,
  RUC_TAKEN: 409,
  WALLET_TAKEN: 409,
  COMPANY_NOT_FOUND: 404,
  SELF_INVOICE: 422,
  INVOICE_DUPLICATE: 409,
  INVOICE_OVERDUE: 422,
  INVOICE_NOT_FOUND: 404,
  INVALID_STATE: 409,
  OFFER_EXISTS: 409,
  ATTACHMENT_INVALID: 422,
  CHAIN_MISMATCH: 409,
  CHAIN_UNAVAILABLE: 502,
  CHALLENGE_EXPIRED: 401,
  SIGNATURE_INVALID: 401,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  FEATURE_UNAVAILABLE: 503,
};

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message ?? code);
    this.name = 'DomainError';
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}
