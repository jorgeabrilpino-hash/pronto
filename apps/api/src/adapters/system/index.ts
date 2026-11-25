import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { Clock, IdGenerator } from '../../application/ports';
import { generateCompanyCode } from '../../domain/values';

/** Wall clock. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Ids from node:crypto (CSPRNG). */
export class CryptoIdGenerator implements IdGenerator {
  uuid(): string {
    return randomUUID();
  }
  /** 32 random bytes as 64 hex characters; never derived from invoice data. */
  offerId(): string {
    return randomBytes(32).toString('hex');
  }
  /** `PR-` plus 6 characters of 23456789ABCDEFGHJKMNPQRSTUVWXYZ, uniform via randomInt. */
  companyCode(): string {
    return generateCompanyCode((n) => randomInt(n));
  }
  /** 24 random bytes as 48 hex characters: fits the 64 byte manageData value of a challenge. */
  token(): string {
    return randomBytes(24).toString('hex');
  }
}
