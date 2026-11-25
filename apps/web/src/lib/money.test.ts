import { describe, expect, it } from 'vitest';
import {
  annualizedBps,
  ariaAmount,
  discountFromBps,
  formatAmount,
  formatUsdc,
  netFromBps,
  parseMoney,
  toMoneyString,
} from './money';

describe('money', () => {
  it('parses and prints without Number', () => {
    expect(parseMoney('1')).toBe(10_000_000n);
    expect(parseMoney('985.5')).toBe(9_855_000_000n);
    expect(parseMoney('0.0000001')).toBe(1n);
    expect(toMoneyString(9_855_000_000n)).toBe('985.5');
    expect(toMoneyString(10_000_000n)).toBe('1');
    expect(() => parseMoney('1.00000001')).toThrow(RangeError);
    expect(() => parseMoney('abc')).toThrow(RangeError);
  });

  it('keeps precision beyond 2^53', () => {
    const big = '9007199254740993.1234567';
    expect(toMoneyString(parseMoney(big))).toBe(big);
  });

  it('formats es-PE: thin space for thousands, comma decimals', () => {
    expect(formatAmount('1000')).toBe('1\u202f000');
    expect(formatAmount('985')).toBe('985');
    expect(formatAmount('985.5')).toBe('985,50');
    expect(formatAmount('2400.5')).toBe('2\u202f400,50');
    expect(formatUsdc('985')).toBe('985 USDC');
    expect(ariaAmount('1000')).toBe('1000 USDC');
  });

  it('matches the canonical case: 1000 at 1.5 % -> net 985, 18.5 % annual in 30 days', () => {
    const face = parseMoney('1000');
    const net = netFromBps(face, 150);
    expect(toMoneyString(net)).toBe('985');
    expect(toMoneyString(discountFromBps(face, 150))).toBe('15');
    expect(annualizedBps(face - net, net, 30)).toBe(1853);
  });
});
