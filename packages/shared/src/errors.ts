/**
 * Stable error codes shared by API and front end.
 * VALIDATION_ERROR, UNAUTHENTICATED and INTERNAL are not in the business list of
 * BACKEND_PLAN section 4; they cover HTTP 400, 401 and 500.
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
