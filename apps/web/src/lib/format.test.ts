import { describe, expect, it } from 'vitest';
import { daysBetween, formatAnnual, formatBps, formatDate, formatInvoiceRef } from './format';
import { isValidRuc, rucFrom } from './ruc';

describe('format', () => {
  it('formats percentages with a comma', () => {
    expect(formatBps(100)).toBe('1\u00a0%');
    expect(formatBps(150)).toBe('1,5\u00a0%');
    expect(formatBps(200)).toBe('2\u00a0%');
    expect(formatAnnual(1853)).toBe('18,5\u00a0%');
  });

  it('formats calendar dates in UTC', () => {
    expect(formatDate('2026-12-01')).toContain('2026');
    expect(formatDate('2026-12-01')).toMatch(/^1 dic/);
    expect(formatInvoiceRef('F001', '123')).toBe('F001-123');
    expect(daysBetween('2026-11-01', '2026-12-01')).toBe(30);
  });

  it('validates RUC check digit', () => {
    expect(isValidRuc(rucFrom('2060123456'))).toBe(true);
    expect(isValidRuc('20601234560')).toBe(false);
    expect(isValidRuc('2060123')).toBe(false);
  });
});
