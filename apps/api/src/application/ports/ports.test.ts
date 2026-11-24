import { randomBytes } from 'node:crypto';
import { DomainError, HTTP_STATUS } from '@pronto/shared';
import { describe, expect, it } from 'vitest';
import type { Clock, IdGenerator, RateLimiter } from './index';

class FixedClock implements Clock {
  private readonly at: Date;
  constructor(at: Date) {
    this.at = at;
  }
  now(): Date {
    return this.at;
  }
}

class CountingLimiter implements RateLimiter {
  private readonly hits = new Map<string, number>();
  async hit(key: string, _windowSeconds: number, max: number) {
    const n = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, n);
    return { allowed: n <= max, remaining: Math.max(0, max - n) };
  }
}

class RandomIds implements IdGenerator {
  uuid(): string {
    return crypto.randomUUID();
  }
  offerId(): string {
    return randomBytes(32).toString('hex');
  }
  companyCode(): string {
    return 'PR-7K4Q2M';
  }
  token(): string {
    return randomBytes(16).toString('hex');
  }
}

describe('ports (compile-time contract plus fake behavior)', () => {
  it('a fixed clock satisfies the Clock port', () => {
    const at = new Date('2026-11-23T12:00:00Z');
    expect(new FixedClock(at).now()).toEqual(at);
  });

  it('a rate limiter fake blocks after the maximum', async () => {
    const limiter = new CountingLimiter();
    expect((await limiter.hit('k', 60, 2)).allowed).toBe(true);
    expect((await limiter.hit('k', 60, 2)).allowed).toBe(true);
    expect((await limiter.hit('k', 60, 2)).allowed).toBe(false);
  });

  it('offer ids are 64 hex characters and random, never derived from the invoice', () => {
    const ids = new RandomIds();
    const a = ids.offerId();
    const b = ids.offerId();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('domain errors keep a stable code that maps to an HTTP status', () => {
    const e = new DomainError('RATE_LIMITED');
    expect(HTTP_STATUS[e.code]).toBe(429);
  });
});
