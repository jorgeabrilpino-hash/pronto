import { type ErrorCode, MESSAGES_ES, type UserMessage } from '@pronto/shared';

/** Offline / unreachable server: not an API error code, so the copy lives here. */
export const NETWORK_MESSAGE: UserMessage = { message: 'La red no responde', action: 'Reintentar' };

export function messageFor(code: ErrorCode): UserMessage {
  return MESSAGES_ES[code];
}
