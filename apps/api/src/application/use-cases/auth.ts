import {
  ChallengeRequestSchema,
  ChallengeResponseSchema,
  DomainError,
  VerifyRequestSchema,
  VerifyResponseSchema,
  type z,
} from '@pronto/shared';
import type {
  AuditLog,
  ChallengeStore,
  CompanyRepository,
  RateLimiter,
  SignatureVerifier,
  TokenClaims,
  TokenService,
} from '../ports';
import { enforceRateLimit, parseInput, parseOutput, toCompanyDto } from './shared';

/** Challenge lifetime (section 9): 5 minutes, single use. */
export const CHALLENGE_TTL_SECONDS = 300;
/** Session lifetime (section 9): 1 hour. */
export const SESSION_TTL_SECONDS = 3600;
/** Rate limit for challenges (section 12): per address. */
export const CHALLENGE_RATE = { windowSeconds: 60, max: 5 } as const;

/** 01 RequestChallenge: public. Creates a single-use nonce and the unsigned challenge. */
export class RequestChallenge {
  constructor(
    private readonly deps: {
      challenges: ChallengeStore;
      signatures: SignatureVerifier;
      rateLimiter: RateLimiter;
    },
  ) {}

  async execute(input: unknown): Promise<z.output<typeof ChallengeResponseSchema>> {
    const { address } = parseInput(ChallengeRequestSchema, input);
    await enforceRateLimit(
      this.deps.rateLimiter,
      `challenge:${address}`,
      CHALLENGE_RATE.windowSeconds,
      CHALLENGE_RATE.max,
    );
    const { nonce, expiresAt } = await this.deps.challenges.create(address, CHALLENGE_TTL_SECONDS);
    return parseOutput(ChallengeResponseSchema, {
      challengeXdr: this.deps.signatures.buildChallenge(address, nonce),
      nonce,
      expiresAt: expiresAt.toISOString(),
    });
  }
}

/**
 * 02 VerifyChallenge: public. The nonce is consumed before the signature is checked, so a
 * signed challenge can never be replayed, valid or not.
 */
export class VerifyChallenge {
  constructor(
    private readonly deps: {
      challenges: ChallengeStore;
      signatures: SignatureVerifier;
      tokens: TokenService;
      companies: CompanyRepository;
      audit: AuditLog;
    },
  ) {}

  async execute(input: unknown): Promise<z.output<typeof VerifyResponseSchema>> {
    const { address, signedXdr } = parseInput(VerifyRequestSchema, input);
    const nonce = this.deps.signatures.readNonce(signedXdr);
    if (nonce === null) throw new DomainError('SIGNATURE_INVALID');
    const issued = await this.deps.challenges.consume(nonce);
    if (issued === null) throw new DomainError('CHALLENGE_EXPIRED');
    if (issued.address !== address) throw new DomainError('SIGNATURE_INVALID');
    const ok = await this.deps.signatures.verifyChallenge(signedXdr, address, nonce);
    if (!ok) throw new DomainError('SIGNATURE_INVALID');

    const company = await this.deps.companies.byWallet(address);
    const { token, expiresAt } = await this.deps.tokens.issue(
      { address, companyId: company?.id ?? null },
      SESSION_TTL_SECONDS,
    );
    await this.deps.audit.record({
      kind: 'auth.login',
      actorCompanyId: company?.id ?? null,
      subject: address,
    });
    return parseOutput(VerifyResponseSchema, {
      token,
      expiresAt: expiresAt.toISOString(),
      company: company === null ? null : toCompanyDto(company),
    });
  }
}

/** Decodes a bearer token into the caller; invalid or expired -> UNAUTHENTICATED. */
export class Authenticate {
  constructor(private readonly deps: { tokens: TokenService }) {}

  async execute(token: string | null | undefined): Promise<TokenClaims> {
    if (token === null || token === undefined || token === '') {
      throw new DomainError('UNAUTHENTICATED');
    }
    const claims = await this.deps.tokens.verify(token);
    if (claims === null) throw new DomainError('UNAUTHENTICATED');
    return claims;
  }
}
