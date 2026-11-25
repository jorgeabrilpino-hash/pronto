import type { ErrorCode } from '@pronto/shared';
import { CHAIN_MESSAGES, messageFor, NETWORK_MESSAGE, WALLET_MESSAGES } from '@/lib/messages';
import { WalletError } from '@/wallet/types';

/** Error with a stable code. The screen shows `MESSAGES_ES[code]`, never the server text. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ErrorCode,
    status: number,
    message?: string,
    details?: Record<string, unknown>,
  ) {
    super(message ?? code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** The request never reached the server (offline, DNS, CORS). */
export class NetworkError extends Error {
  constructor() {
    super('NETWORK');
    this.name = 'NetworkError';
  }
}

/** One sentence and one button label for any thrown value. */
export function userMessage(error: unknown): { message: string; action: string } {
  if (error instanceof ApiError) return messageFor(error.code);
  if (error instanceof NetworkError) return NETWORK_MESSAGE;
  if (error instanceof Error && error.name === 'ChallengeError')
    return messageFor('SIGNATURE_INVALID');
  if (error instanceof Error && error.name === 'ChainError') {
    return CHAIN_MESSAGES[(error as Error & { kind: 'failed' | 'timeout' }).kind];
  }
  if (error instanceof WalletError) return WALLET_MESSAGES[error.kind];
  return messageFor('INTERNAL');
}

export function isApiError(error: unknown, code?: ErrorCode): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}
