import { ChallengeResponseSchema, VerifyResponseSchema } from '@pronto/shared';
import { describe, expect, it } from 'vitest';
import { FakeSignatureVerifier } from '../../../adapters/memory';
import { CHALLENGE_RATE, CHALLENGE_TTL_SECONDS, SESSION_TTL_SECONDS } from '../auth';
import { expectCode, makeKit, wallet } from './kit';

describe('01 RequestChallenge and 02 VerifyChallenge', () => {
  it('happy path: challenge, signature, token without company, then with company', async () => {
    const { uc, a } = makeKit();
    const address = wallet(1);
    const ch = await uc.requestChallenge.execute({ address });
    expect(ChallengeResponseSchema.parse(ch)).toEqual(ch);
    expect(new Date(ch.expiresAt).getTime() - a.clock.now().getTime()).toBe(
      CHALLENGE_TTL_SECONDS * 1000,
    );

    const res = await uc.verifyChallenge.execute({
      address,
      signedXdr: FakeSignatureVerifier.sign(address, ch.nonce),
    });
    expect(VerifyResponseSchema.parse(res)).toEqual(res);
    expect(res.company).toBeNull();
    expect(new Date(res.expiresAt).getTime() - a.clock.now().getTime()).toBe(
      SESSION_TTL_SECONDS * 1000,
    );
    const claims = await uc.authenticate.execute(res.token);
    expect(claims).toEqual({ address, companyId: null });

    const c = await uc.registerCompany.execute(claims, {
      ruc: '20100070970',
      legalName: 'Imprenta Sur SAC',
      sector: 'Imprenta',
    });
    const ch2 = await uc.requestChallenge.execute({ address });
    const res2 = await uc.verifyChallenge.execute({
      address,
      signedXdr: FakeSignatureVerifier.sign(address, ch2.nonce),
    });
    expect(res2.company?.id).toBe(c.id);
    expect(await uc.authenticate.execute(res2.token)).toEqual({ address, companyId: c.id });
    expect(a.audit.kinds()).toContain('auth.login');
  });

  it('a nonce is single use: replay gives CHALLENGE_EXPIRED', async () => {
    const { uc } = makeKit();
    const address = wallet(1);
    const ch = await uc.requestChallenge.execute({ address });
    const signedXdr = FakeSignatureVerifier.sign(address, ch.nonce);
    await uc.verifyChallenge.execute({ address, signedXdr });
    await expectCode(uc.verifyChallenge.execute({ address, signedXdr }), 'CHALLENGE_EXPIRED');
  });

  it('an expired challenge gives CHALLENGE_EXPIRED', async () => {
    const { uc, a } = makeKit();
    const address = wallet(1);
    const ch = await uc.requestChallenge.execute({ address });
    a.clock.advanceSeconds(CHALLENGE_TTL_SECONDS);
    await expectCode(
      uc.verifyChallenge.execute({
        address,
        signedXdr: FakeSignatureVerifier.sign(address, ch.nonce),
      }),
      'CHALLENGE_EXPIRED',
    );
  });

  it('bad signatures give SIGNATURE_INVALID and burn the nonce', async () => {
    const { uc } = makeKit();
    const address = wallet(1);
    await expectCode(
      uc.verifyChallenge.execute({ address, signedXdr: 'garbage' }),
      'SIGNATURE_INVALID',
    );
    // Nonce issued for another address.
    const other = await uc.requestChallenge.execute({ address: wallet(2) });
    await expectCode(
      uc.verifyChallenge.execute({
        address,
        signedXdr: FakeSignatureVerifier.sign(wallet(2), other.nonce).replace(wallet(2), address),
      }),
      'SIGNATURE_INVALID',
    );
    // Right nonce, wrong signature.
    const ch = await uc.requestChallenge.execute({ address });
    await expectCode(
      uc.verifyChallenge.execute({ address, signedXdr: `signed:${wallet(3)}:${ch.nonce}` }),
      'SIGNATURE_INVALID',
    );
    await expectCode(
      uc.verifyChallenge.execute({
        address,
        signedXdr: FakeSignatureVerifier.sign(address, ch.nonce),
      }),
      'CHALLENGE_EXPIRED',
    );
  });

  it('challenges are rate limited per address', async () => {
    const { uc, a } = makeKit();
    const address = wallet(1);
    for (let i = 0; i < CHALLENGE_RATE.max; i++) await uc.requestChallenge.execute({ address });
    await expectCode(uc.requestChallenge.execute({ address }), 'RATE_LIMITED');
    await uc.requestChallenge.execute({ address: wallet(2) });
    a.clock.advanceSeconds(CHALLENGE_RATE.windowSeconds);
    await uc.requestChallenge.execute({ address });
  });

  it('invalid input is VALIDATION_ERROR; missing or expired token is UNAUTHENTICATED', async () => {
    const { uc, a } = makeKit();
    await expectCode(uc.requestChallenge.execute({ address: 'nope' }), 'VALIDATION_ERROR');
    await expectCode(uc.authenticate.execute(undefined), 'UNAUTHENTICATED');
    await expectCode(uc.authenticate.execute(''), 'UNAUTHENTICATED');
    await expectCode(uc.authenticate.execute('unknown'), 'UNAUTHENTICATED');
    const { token } = await a.tokens.issue({ address: wallet(1), companyId: null }, 10);
    a.clock.advanceSeconds(10);
    await expectCode(uc.authenticate.execute(token), 'UNAUTHENTICATED');
  });
});
