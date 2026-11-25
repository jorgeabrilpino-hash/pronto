import { describe, expect, it } from 'vitest';
import { CryptoIdGenerator, SystemClock } from './index';

describe('SystemClock', () => {
  it('returns the current wall time', () => {
    const before = Date.now();
    const t = new SystemClock().now().getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(Date.now());
  });
});

describe('CryptoIdGenerator', () => {
  const ids = new CryptoIdGenerator();

  it('makes uuid v4 ids', () => {
    expect(ids.uuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('makes 64 hex char offer ids that do not repeat', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = ids.offerId();
      expect(id).toMatch(/^[0-9a-f]{64}$/);
      seen.add(id);
    }
    expect(seen.size).toBe(200);
  });

  it('makes PR- company codes over the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      expect(ids.companyCode()).toMatch(/^PR-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    }
  });

  it('makes 48 hex char tokens', () => {
    expect(ids.token()).toMatch(/^[0-9a-f]{48}$/);
    expect(ids.token()).not.toBe(ids.token());
  });
});
