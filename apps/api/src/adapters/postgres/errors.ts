import { DomainError, type ErrorCode } from '@pronto/shared';

/**
 * Maps Postgres constraint violations to domain errors. Only constraint names we own are mapped;
 * anything else is rethrown untouched so a real failure is never disguised as a business error.
 */

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

const BY_CONSTRAINT: Record<string, { code: ErrorCode; message?: string }> = {
  invoices_supplier_series_number_key: { code: 'INVOICE_DUPLICATE' },
  invoices_supplier_not_buyer: { code: 'SELF_INVOICE' },
  invoices_number_format: { code: 'VALIDATION_ERROR', message: 'Invoice number must be canonical' },
  offers_one_live_per_invoice: { code: 'OFFER_EXISTS' },
  offers_offer_id_hex_key: { code: 'INTERNAL', message: 'Offer id reused' },
  companies_ruc_key: { code: 'RUC_TAKEN' },
  companies_wallet_key: { code: 'WALLET_TAKEN' },
  companies_code_key: { code: 'INTERNAL', message: 'Company code collision' },
};

interface PgError {
  code?: string;
  constraint?: string;
}

export function mapDbError(err: unknown): unknown {
  if (typeof err !== 'object' || err === null) return err;
  const { code, constraint } = err as PgError;
  if ((code !== UNIQUE_VIOLATION && code !== CHECK_VIOLATION) || constraint === undefined) {
    return err;
  }
  const mapped = BY_CONSTRAINT[constraint];
  if (mapped === undefined) return err;
  return new DomainError(mapped.code, mapped.message, { constraint });
}

/** Runs `fn` and rethrows a mapped domain error when a known constraint fails. */
export async function mapped<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw mapDbError(err);
  }
}
