import { describe, expect, it } from 'vitest';
import {
  CompanyCodeSchema,
  CreateInvoiceRequestSchema,
  DomainError,
  ERROR_CODES,
  ErrorBodySchema,
  HTTP_STATUS,
  MESSAGES_ES,
  MoneySchema,
  PrepareOfferRequestSchema,
  RucSchema,
  StellarAddressSchema,
} from './index';

const UUID_A = '123e4567-e89b-42d3-a456-426614174000';
const UUID_B = '123e4567-e89b-42d3-a456-426614174001';

describe('error codes', () => {
  it('every code has an HTTP status and a Spanish message with an action', () => {
    for (const code of ERROR_CODES) {
      expect(HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
      expect(MESSAGES_ES[code].message.length).toBeGreaterThan(0);
      expect(MESSAGES_ES[code].action.length).toBeGreaterThan(0);
    }
  });

  it('DomainError keeps its stable code and details', () => {
    const e = new DomainError('INVOICE_DUPLICATE', undefined, { series: 'F001' });
    expect(e.code).toBe('INVOICE_DUPLICATE');
    expect(e.details).toEqual({ series: 'F001' });
  });

  it('the error body only accepts known codes', () => {
    const ok = { error: { code: 'RUC_INVALID', message: 'x' } };
    const bad = { error: { code: 'NOPE', message: 'x' } };
    expect(ErrorBodySchema.safeParse(ok).success).toBe(true);
    expect(ErrorBodySchema.safeParse(bad).success).toBe(false);
  });
});

describe('value schemas', () => {
  it('RUC needs exactly 11 digits', () => {
    expect(RucSchema.safeParse('20123456789').success).toBe(true);
    expect(RucSchema.safeParse('2012345678').success).toBe(false);
    expect(RucSchema.safeParse('2012345678a').success).toBe(false);
  });

  it('company code avoids look-alike characters', () => {
    expect(CompanyCodeSchema.safeParse('PR-7K4Q2M').success).toBe(true);
    expect(CompanyCodeSchema.safeParse('PR-0O1I2M').success).toBe(false);
  });

  it('Stellar address has the G form of 56 characters', () => {
    const ok = 'GABXMVQFX6R74OUC6TGL3YGO7TLGV7R34RVAGTJE42UUXCVA4IELCKU3';
    expect(StellarAddressSchema.safeParse(ok).success).toBe(true);
    expect(StellarAddressSchema.safeParse(ok.toLowerCase()).success).toBe(false);
  });

  it('money is a decimal string with at most 7 decimals', () => {
    for (const v of ['985.0000000', '1000', '0.0000001']) {
      expect(MoneySchema.safeParse(v).success).toBe(true);
    }
    for (const v of ['1,000', '1.00000001', '-1', 'abc', '', 985]) {
      expect(MoneySchema.safeParse(v).success).toBe(false);
    }
  });
});

describe('requests', () => {
  const invoice = {
    buyerCompanyId: UUID_A,
    series: 'F001',
    number: '123',
    faceAmount: '1000',
    currency: 'USDC',
    issueDate: '2026-11-01',
    dueDate: '2026-12-01',
    attachmentIds: [UUID_B],
  };

  it('accepts a valid invoice and defaults longerTermAgreed to false', () => {
    const r = CreateInvoiceRequestSchema.safeParse(invoice);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.longerTermAgreed).toBe(false);
  });

  it('rejects a due date that is not after the issue date', () => {
    const r = CreateInvoiceRequestSchema.safeParse({ ...invoice, dueDate: '2026-11-01' });
    expect(r.success).toBe(false);
  });

  it('rejects a zero amount', () => {
    expect(CreateInvoiceRequestSchema.safeParse({ ...invoice, faceAmount: '0' }).success).toBe(
      false,
    );
  });

  it('offer validity is 3, 7 or 15 days', () => {
    expect(PrepareOfferRequestSchema.safeParse({ discountBps: 150, validityDays: 7 }).success).toBe(
      true,
    );
    expect(PrepareOfferRequestSchema.safeParse({ discountBps: 150, validityDays: 5 }).success).toBe(
      false,
    );
  });
});
