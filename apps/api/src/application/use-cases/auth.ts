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
/**
 * Challenge rate limits (section 12). The address comes from the caller, so a limit keyed
 * only on it would let anyone lock a victim out. Two limits instead:
 * - per client (`challenge:client:<clientId>`, derived by the HTTP adapter from the caller
 *   IP): strict, stops one caller from hammering;
 * - per address (`challenge:addr:<address>`): much higher, only stops floods, so a third
 *   party cannot exhaust a victim's logins without a flood from many clients.
 * When no clientId is given only the per-address limit applies.
 */
export const CHALLENGE_CLIENT_RATE = { windowSeconds: 60, max: 10 } as const;
export const CHALLENGE_ADDRESS_RATE = { windowSeconds: 60, max: 100 } as const;
/** @deprecated Kept for compatibility; equals CHALLENGE_CLIENT_RATE. */
export const CHALLENGE_RATE = CHALLENGE_CLIENT_RATE;

/** Server-derived request context. Never read it from the request body. */
export interface ChallengeContext {
  /** Opaque caller id, e.g. a hash of the client IP. */
  clientId?: string;
}

/** 01 RequestChallenge: public. Creates a single-use nonce and the unsigned challenge. */
export class RequestChallenge {
  constructor(
    private readonly deps: {
      challenges: ChallengeStore;
      signatures: SignatureVerifier;
      rateLimiter: RateLimiter;
    },
  ) {}

  /**
   * `input` is the request body (only `address` is read; extra keys are dropped by the
   * schema). `context.clientId` must come from the HTTP adapter, never from the body.
   */
  async execute(
    input: unknown,
    context: ChallengeContext = {},
  ): Promise<z.output<typeof ChallengeResponseSchema>> {
    const { address } = parseInput(ChallengeRequestSchema, input);
    const clientId = context.clientId;
    if (clientId !== undefined && clientId !== '') {
      // Checked first so a throttled client does not consume the address budget.
      await enforceRateLimit(
        this.deps.rateLimiter,
        `challenge:client:${clientId}`,
        CHALLENGE_CLIENT_RATE.windowSeconds,
        CHALLENGE_CLIENT_RATE.max,
      );
    }
    await enforceRateLimit(
      this.deps.rateLimiter,
      `challenge:addr:${address}`,
      CHALLENGE_ADDRESS_RATE.windowSeconds,
      CHALLENGE_ADDRESS_RATE.max,
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
