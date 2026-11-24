import { DomainError } from '@pronto/shared';
import { describe, expect, it } from 'vitest';
import {
  addMoney,
  addSeconds,
  annualizedBps,
  assertDifferentParties,
  assertInvoiceDates,
  COMPANY_CODE_ALPHABET,
  currentOffer,
  daysBetween,
  discount,
  displayStatus,
  formatInvoiceRef,
  formatMoney,
  generateCompanyCode,
  isActiveOffer,
  isOverdue,
  isStellarAddress,
  isValidRuc,
  mulBpsFloor,
  netFromDiscount,
  nextStatus,
  type Offer,
  offerExpiry,
  offerWarnings,
  parseCompanyCode,
  parseInvoiceRef,
  parseMoney,
  parseRuc,
  parseStellarAddress,
  rucCheckDigit,
  startOfDayLima,
  subMoney,
  TRANSITIONS,
  todayIso,
  truncateToSeconds,
} from './index';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
  return 'NO_ERROR';
}

// 10:00 in Lima on 2026-11-23.
const NOW = new Date('2026-11-23T15:00:00Z');

describe('Ruc', () => {
  it('accepts real RUCs with a valid module 11 check digit', () => {
    expect(isValidRuc('20100070970')).toBe(true);
    expect(isValidRuc('20131312955')).toBe(true);
    expect(parseRuc('20100070970')).toBe('20100070970');
    expect(rucCheckDigit('2010007097')).toBe(0);
  });

  it('rejects a wrong check digit or shape with RUC_INVALID', () => {
    expect(isValidRuc('20100070971')).toBe(false);
    expect(isValidRuc('2010007097')).toBe(false);
    expect(isValidRuc('2010007097a')).toBe(false);
    expect(codeOf(() => parseRuc('20100070971'))).toBe('RUC_INVALID');
  });
});

describe('CompanyCode', () => {
  it('generates PR- plus 6 characters of the unambiguous alphabet', () => {
    let i = 0;
    const code = generateCompanyCode(() => i++ % COMPANY_CODE_ALPHABET.length);
    expect(code).toBe('PR-234567');
    expect(parseCompanyCode(code)).toBe(code);
  });

  it('rejects an out-of-range random source', () => {
    expect(() => generateCompanyCode(() => 99)).toThrow(RangeError);
  });

  it('parses lower case and rejects look-alike characters', () => {
    expect(parseCompanyCode(' pr-7k4q2m ')).toBe('PR-7K4Q2M');
    expect(codeOf(() => parseCompanyCode('PR-0O1I2M'))).toBe('VALIDATION_ERROR');
  });
});

describe('Money', () => {
  it('parses and formats with 7 decimals without Number', () => {
    expect(parseMoney('1000')).toBe(10_000_000_000n);
    expect(parseMoney('985.5')).toBe(9_855_000_000n);
    expect(parseMoney('0.0000001')).toBe(1n);
    expect(formatMoney(9_850_000_000n)).toBe('985.0000000');
    expect(formatMoney(-15n)).toBe('-0.0000015');
    expect(formatMoney(parseMoney('9999999999999.9999999'))).toBe('9999999999999.9999999');
  });

  it('rejects invalid amounts', () => {
    for (const v of ['1,000', '1.00000001', '-1', 'abc', '', '01']) {
      expect(codeOf(() => parseMoney(v))).toBe('VALIDATION_ERROR');
    }
  });

  it('does arithmetic on bigint', () => {
    expect(addMoney(1n, 2n)).toBe(3n);
    expect(subMoney(5n, 2n)).toBe(3n);
    expect(mulBpsFloor(10_000_000_000n, 150)).toBe(150_000_000n);
    expect(mulBpsFloor(1n, 150)).toBe(0n);
    expect(() => mulBpsFloor(1n, 1.5)).toThrow(RangeError);
  });
});

describe('InvoiceRef and StellarAddress', () => {
  it('normalizes and formats the invoice reference', () => {
    const ref = parseInvoiceRef('f001', ' 123 ');
    expect(ref).toEqual({ series: 'F001', number: '123' });
    expect(formatInvoiceRef(ref)).toBe('F001-123');
    expect(codeOf(() => parseInvoiceRef('F01', '1'))).toBe('VALIDATION_ERROR');
    expect(codeOf(() => parseInvoiceRef('F001', '123456789'))).toBe('VALIDATION_ERROR');
  });

  it('checks the G address shape', () => {
    const ok = 'GABXMVQFX6R74OUC6TGL3YGO7TLGV7R34RVAGTJE42UUXCVA4IELCKU3';
    expect(isStellarAddress(ok)).toBe(true);
    expect(parseStellarAddress(ok)).toBe(ok);
    expect(codeOf(() => parseStellarAddress(ok.toLowerCase()))).toBe('VALIDATION_ERROR');
  });
});

describe('finance', () => {
  it('canonical case: face 1000, 150 bps, 30 days -> net 985 and 1853 bps', () => {
    const face = parseMoney('1000');
    const net = netFromDiscount(face, 150);
    expect(formatMoney(net)).toBe('985.0000000');
    const d = discount(face, net);
    expect(formatMoney(d)).toBe('15.0000000');
    expect(annualizedBps(d, net, 30)).toBe(1853);
  });

  it('rounds the discount down so the net never goes below the exact value', () => {
    // 0.0000003 * 150 bps = 0.0000000045 -> discount 0, net equals face.
    expect(netFromDiscount(3n, 150)).toBe(3n);
    expect(netFromDiscount(1_000_001n, 5000)).toBe(500_001n);
  });

  it('rounds the annualized cost half up', () => {
    // 1/100 * 365/73 = 0.05 exactly = 500 bps; 1/200 * 365/1 = 1.825 -> 18250 bps.
    expect(annualizedBps(1n, 100n, 73)).toBe(500);
    expect(annualizedBps(1n, 200n, 1)).toBe(18_250);
    // 1/3 * 365 * 10000 = 1216666.67 -> 1216667.
    expect(annualizedBps(1n, 3n, 1)).toBe(1_216_667);
  });

  it('rejects impossible inputs', () => {
    expect(() => netFromDiscount(0n, 100)).toThrow(RangeError);
    expect(() => netFromDiscount(1n, 10_001)).toThrow(RangeError);
    expect(() => annualizedBps(1n, 0n, 30)).toThrow(RangeError);
    expect(() => annualizedBps(1n, 1n, 0)).toThrow(RangeError);
    expect(() => annualizedBps(-1n, 1n, 1)).toThrow(RangeError);
  });
});

describe('dates', () => {
  it('uses Lima time for today', () => {
    expect(todayIso(new Date('2026-11-24T04:59:59Z'))).toBe('2026-11-23');
    expect(todayIso(new Date('2026-11-24T05:00:00Z'))).toBe('2026-11-24');
  });

  it('counts days and day starts', () => {
    expect(daysBetween('2026-11-01', '2026-12-01')).toBe(30);
    expect(daysBetween('2026-12-01', '2026-11-01')).toBe(-30);
    expect(startOfDayLima('2026-12-01').toISOString()).toBe('2026-12-01T05:00:00.000Z');
    expect(truncateToSeconds(new Date('2026-01-01T00:00:00.999Z')).toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    expect(addSeconds(NOW, 60).getTime() - NOW.getTime()).toBe(60_000);
    expect(() => daysBetween('2026-13-45', '2026-01-01')).toThrow(RangeError);
    expect(() => daysBetween('nope', '2026-01-01')).toThrow(RangeError);
  });
});

describe('invoice state machine', () => {
  it('has exactly the transitions of section 4', () => {
    expect(TRANSITIONS.map((t) => `${t.from}>${t.to}:${t.actor}`).sort()).toEqual(
      [
        'sent>confirmed:buyer',
        'sent>rejected:buyer',
        'sent>cancelled:supplier',
        'rejected>sent:supplier',
        'rejected>cancelled:supplier',
        'confirmed>cancelled:supplier',
      ].sort(),
    );
  });

  it('applies allowed transitions', () => {
    expect(nextStatus('sent', 'confirm', 'buyer', false)).toBe('confirmed');
    expect(nextStatus('sent', 'reject', 'buyer', false)).toBe('rejected');
    expect(nextStatus('sent', 'cancel', 'supplier', false)).toBe('cancelled');
    expect(nextStatus('rejected', 'resend', 'supplier', false)).toBe('sent');
    expect(nextStatus('rejected', 'cancel', 'supplier', false)).toBe('cancelled');
    expect(nextStatus('confirmed', 'cancel', 'supplier', false)).toBe('cancelled');
  });

  it('wrong role is FORBIDDEN, missing transition is INVALID_STATE', () => {
    expect(codeOf(() => nextStatus('sent', 'confirm', 'supplier', false))).toBe('FORBIDDEN');
    expect(codeOf(() => nextStatus('sent', 'cancel', 'buyer', false))).toBe('FORBIDDEN');
    expect(codeOf(() => nextStatus('confirmed', 'confirm', 'buyer', false))).toBe('INVALID_STATE');
    expect(codeOf(() => nextStatus('cancelled', 'cancel', 'supplier', false))).toBe(
      'INVALID_STATE',
    );
    expect(codeOf(() => nextStatus('sent', 'resend', 'supplier', false))).toBe('INVALID_STATE');
  });

  it('cancel with an active offer is OFFER_EXISTS', () => {
    expect(codeOf(() => nextStatus('confirmed', 'cancel', 'supplier', true))).toBe('OFFER_EXISTS');
  });
});

function offer(partial: Partial<Offer>): Offer {
  return {
    id: 'o',
    invoiceId: 'i',
    offerIdHex: 'a'.repeat(64),
    netAmount: 1n,
    discountAmount: 1n,
    discountBps: 100,
    expiresAt: new Date('2026-11-30T15:00:00Z'),
    chainStatus: 'pending',
    txCreate: null,
    txAccept: null,
    txReclaim: null,
    contractId: 'C',
    lastCheckedAt: null,
    createdAt: NOW,
    ...partial,
  };
}

describe('business rules', () => {
  const ok = { issueDate: '2026-11-20', dueDate: '2026-12-15', longerTermAgreed: false };

  it('accepts a valid invoice', () => {
    expect(() => assertInvoiceDates(ok, NOW)).not.toThrow();
    expect(() => assertInvoiceDates({ ...ok, dueDate: '2026-11-23' }, NOW)).not.toThrow();
  });

  it('rejects overdue, future issue, bad order and unagreed long terms', () => {
    expect(
      codeOf(() =>
        assertInvoiceDates(
          { ...ok, issueDate: '2026-10-01', dueDate: '2026-11-22', longerTermAgreed: true },
          NOW,
        ),
      ),
    ).toBe('INVOICE_OVERDUE');
    expect(codeOf(() => assertInvoiceDates({ ...ok, issueDate: '2026-11-24' }, NOW))).toBe(
      'VALIDATION_ERROR',
    );
    expect(codeOf(() => assertInvoiceDates({ ...ok, dueDate: '2026-11-20' }, NOW))).toBe(
      'VALIDATION_ERROR',
    );
    const long = { issueDate: '2026-11-20', dueDate: '2026-12-21', longerTermAgreed: false };
    expect(codeOf(() => assertInvoiceDates(long, NOW))).toBe('VALIDATION_ERROR');
    expect(() => assertInvoiceDates({ ...long, longerTermAgreed: true }, NOW)).not.toThrow();
    expect(() =>
      assertInvoiceDates({ ...long, dueDate: '2026-12-20', longerTermAgreed: false }, NOW),
    ).not.toThrow();
  });

  it('isOverdue: due today is not overdue', () => {
    expect(isOverdue('2026-11-23', NOW)).toBe(false);
    expect(isOverdue('2026-11-22', NOW)).toBe(true);
  });

  it('buyer must differ from supplier', () => {
    expect(codeOf(() => assertDifferentParties('a', 'a'))).toBe('SELF_INVOICE');
    expect(() => assertDifferentParties('a', 'b')).not.toThrow();
  });

  it('offer validity is 3, 7 or 15 days and ends before the due date', () => {
    const exp = offerExpiry(7, '2026-12-15', new Date('2026-11-23T15:00:00.500Z'));
    expect(exp.toISOString()).toBe('2026-11-30T15:00:00.000Z');
    expect(codeOf(() => offerExpiry(5, '2026-12-15', NOW))).toBe('VALIDATION_ERROR');
    expect(codeOf(() => offerExpiry(15, '2026-12-08', NOW))).toBe('VALIDATION_ERROR');
    expect(codeOf(() => offerExpiry(3, '2026-11-23', NOW))).toBe('INVOICE_OVERDUE');
    expect(() => offerExpiry(15, '2026-12-09', NOW)).not.toThrow();
  });

  it('discount above the supplier maximum is a warning, not an error', () => {
    expect(offerWarnings(200, 150)).toEqual(['DISCOUNT_ABOVE_SUPPLIER_MAX']);
    expect(offerWarnings(150, 150)).toEqual([]);
    expect(offerWarnings(5000, null)).toEqual([]);
  });
});

describe('offers and display status', () => {
  it('active offers are pending, open or accepted', () => {
    expect(isActiveOffer({ chainStatus: 'pending' })).toBe(true);
    expect(isActiveOffer({ chainStatus: 'open' })).toBe(true);
    expect(isActiveOffer({ chainStatus: 'accepted' })).toBe(true);
    expect(isActiveOffer({ chainStatus: 'reclaimed' })).toBe(false);
    expect(isActiveOffer({ chainStatus: 'failed' })).toBe(false);
  });

  it('current offer is the active one, else the most recent', () => {
    const old = offer({ chainStatus: 'failed', createdAt: new Date('2026-11-01T00:00:00Z') });
    const recent = offer({ chainStatus: 'reclaimed', createdAt: new Date('2026-11-10T00:00:00Z') });
    const open = offer({ chainStatus: 'open', createdAt: new Date('2026-11-05T00:00:00Z') });
    expect(currentOffer([])).toBeNull();
    expect(currentOffer([old, recent])).toBe(recent);
    expect(currentOffer([recent, old])).toBe(recent);
    expect(currentOffer([old, open, recent])).toBe(open);
  });

  it('combines invoice and offer into the seven display statuses', () => {
    const exp = new Date('2026-11-30T15:00:00Z');
    const after = new Date('2026-11-30T15:00:00Z');
    expect(displayStatus({ status: 'sent' }, null, NOW)).toBe('sent');
    expect(displayStatus({ status: 'rejected' }, null, NOW)).toBe('rejected');
    expect(displayStatus({ status: 'cancelled' }, null, NOW)).toBe('cancelled');
    expect(displayStatus({ status: 'confirmed' }, null, NOW)).toBe('confirmed');
    const s = (chainStatus: Offer['chainStatus'], at: Date) =>
      displayStatus({ status: 'confirmed' }, { chainStatus, expiresAt: exp }, at);
    expect(s('pending', NOW)).toBe('confirmed');
    expect(s('open', NOW)).toBe('offer_open');
    expect(s('open', after)).toBe('offer_expired');
    expect(s('accepted', after)).toBe('collected');
    expect(s('reclaimed', NOW)).toBe('confirmed');
    expect(s('failed', NOW)).toBe('confirmed');
  });
});
