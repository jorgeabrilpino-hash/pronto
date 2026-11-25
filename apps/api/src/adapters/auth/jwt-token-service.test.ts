import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { MutableClock } from '../memory';
import { JwtTokenService } from './jwt-token-service';

// Throwaway test secret (not a real credential).
const SECRET = 'test-secret-for-unit-tests-0123456789abcdef';
const ADDRESS = 'GABXMVQFX6R74OUC6TGL3YGO7TLGV7R34RVAGTJE42UUXCVA4IELCKU3';

describe('JwtTokenService', () => {
  it('rejects a secret shorter than 32 bytes and a missing JWT_SECRET', () => {
    expect(() => new JwtTokenService('x'.repeat(31))).toThrow(/at least 32 bytes/);
    expect(() => JwtTokenService.fromEnv({})).toThrow(/not set/);
    expect(JwtTokenService.fromEnv({ JWT_SECRET: SECRET })).toBeInstanceOf(JwtTokenService);
  });

  it('issues a 1 hour HS256 token whose claims verify back', async () => {
    const clock = new MutableClock(new Date('2026-11-23T15:00:00Z'));
    const svc = new JwtTokenService(SECRET, clock);
    const { token, expiresAt } = await svc.issue({ address: ADDRESS, companyId: 'c-1' }, 3600);
    expect(expiresAt.toISOString()).toBe('2026-11-23T16:00:00.000Z');
    const header = JSON.parse(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString());
    expect(header.alg).toBe('HS256');
    expect(await svc.verify(token)).toEqual({ address: ADDRESS, companyId: 'c-1' });
  });

  it('keeps a null companyId (signed in, no company yet)', async () => {
    const svc = new JwtTokenService(SECRET);
    const { token } = await svc.issue({ address: ADDRESS, companyId: null }, 3600);
    expect(await svc.verify(token)).toEqual({ address: ADDRESS, companyId: null });
  });

  it('returns null for expired, tampered, foreign-key and garbage tokens', async () => {
    const clock = new MutableClock(new Date('2026-11-23T15:00:00Z'));
    const svc = new JwtTokenService(SECRET, clock);
    const { token } = await svc.issue({ address: ADDRESS, companyId: 'c-1' }, 3600);
    clock.advanceSeconds(3601);
    expect(await svc.verify(token)).toBeNull();
    clock.advanceSeconds(-3601);
    const [h, p, s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ address: 'GOTHER', companyId: 'c-2' })).toString(
      'base64url',
    );
    expect(await svc.verify(`${h}.${forged}.${s}`)).toBeNull();
    expect(await svc.verify(`${h}.${p}.AAAA`)).toBeNull();
    const other = new JwtTokenService('another-secret-that-is-long-enough-0000', clock);
    expect(await other.verify(token)).toBeNull();
    expect(await svc.verify('not.a.jwt')).toBeNull();
  });

  it('returns null for a validly signed token with wrong claim shapes', async () => {
    const clock = new MutableClock(new Date('2026-11-23T15:00:00Z'));
    const svc = new JwtTokenService(SECRET, clock);
    const key = new TextEncoder().encode(SECRET);
    const make = (claims: Record<string, unknown>, sub: string) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('pronto-api')
        .setAudience('pronto')
        .setSubject(sub)
        .setIssuedAt(Math.floor(clock.now().getTime() / 1000))
        .setExpirationTime(Math.floor(clock.now().getTime() / 1000) + 60)
        .sign(key);
    expect(await svc.verify(await make({ address: ADDRESS, companyId: 7 }, ADDRESS))).toBeNull();
    expect(
      await svc.verify(await make({ address: ADDRESS, companyId: null }, 'GOTHER')),
    ).toBeNull();
    expect(await svc.verify(await make({ companyId: null }, ADDRESS))).toBeNull();
  });
});
