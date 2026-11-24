import { jwtVerify, SignJWT } from 'jose';
import type { Clock, TokenClaims, TokenService } from '../../application/ports';

const ALG = 'HS256';
const ISSUER = 'pronto-api';
const AUDIENCE = 'pronto';
export const MIN_SECRET_BYTES = 32;
export const SESSION_TTL_SECONDS = 3600;

const systemClock: Clock = { now: () => new Date() };

/** Session tokens: JWT HS256 carrying the wallet address and company id (BACKEND_PLAN 9). */
export class JwtTokenService implements TokenService {
  private readonly key: Uint8Array;
  private readonly clock: Clock;

  constructor(secret: string, clock: Clock = systemClock) {
    const key = new TextEncoder().encode(secret);
    if (key.length < MIN_SECRET_BYTES) {
      throw new Error(`JWT_SECRET must be at least ${MIN_SECRET_BYTES} bytes`);
    }
    this.key = key;
    this.clock = clock;
  }

  /** Reads JWT_SECRET; throws when it is missing or too short. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env, clock?: Clock): JwtTokenService {
    const secret = env.JWT_SECRET;
    if (secret === undefined || secret === '') throw new Error('JWT_SECRET is not set');
    return new JwtTokenService(secret, clock);
  }

  async issue(
    claims: TokenClaims,
    ttlSeconds: number = SESSION_TTL_SECONDS,
  ): Promise<{ token: string; expiresAt: Date }> {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const exp = iat + ttlSeconds;
    const token = await new SignJWT({ address: claims.address, companyId: claims.companyId })
      .setProtectedHeader({ alg: ALG, typ: 'JWT' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject(claims.address)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(this.key);
    return { token, expiresAt: new Date(exp * 1000) };
  }

  async verify(token: string): Promise<TokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: [ALG],
        issuer: ISSUER,
        audience: AUDIENCE,
        currentDate: this.clock.now(),
        requiredClaims: ['exp', 'iat', 'sub'],
      });
      const { address, companyId, sub } = payload;
      if (typeof address !== 'string' || address === '' || address !== sub) return null;
      if (companyId !== null && typeof companyId !== 'string') return null;
      return { address, companyId };
    } catch {
      return null;
    }
  }
}
