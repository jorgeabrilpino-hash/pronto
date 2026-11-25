import {
  DomainError,
  type ErrorBody,
  type ErrorCode,
  HTTP_STATUS,
  MESSAGES_ES,
} from '@pronto/shared';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Maps anything thrown by a handler to the error body of BACKEND_PLAN section 7:
 * `{ error: { code, message, details? } }` with HTTP_STATUS[code].
 *  - DomainError keeps its code and details; the message is the neutral Spanish sentence.
 *  - Hono HTTP exceptions (malformed JSON, a body that is not JSON, oversized body) become
 *    VALIDATION_ERROR or PAYLOAD_TOO_LARGE.
 *  - Anything else is INTERNAL with no stack, message or secret in the body.
 */

export function errorBody(code: ErrorCode, details?: Record<string, unknown>): ErrorBody {
  const body: ErrorBody = { error: { code, message: MESSAGES_ES[code].message } };
  if (details !== undefined) body.error.details = details;
  return body;
}

/**
 * True for Hono's HTTPException. Checked by shape as well, because a dependency may load the
 * CommonJS build of hono, whose class is not the one this module imports.
 */
function isHttpException(err: unknown): err is { status: number } {
  if (err instanceof HTTPException) return true;
  return (
    err instanceof Error &&
    typeof (err as { getResponse?: unknown }).getResponse === 'function' &&
    typeof (err as { status?: unknown }).status === 'number'
  );
}

export function toDomainError(err: unknown): DomainError {
  if (err instanceof DomainError) return err;
  if (isHttpException(err)) {
    if (err.status === 413) return new DomainError('PAYLOAD_TOO_LARGE');
    if (err.status === 415) {
      return new DomainError('VALIDATION_ERROR', 'Unsupported media type', {
        contentType: 'application/json',
      });
    }
    if (err.status === 400) return new DomainError('VALIDATION_ERROR', 'Malformed request');
  }
  return new DomainError('INTERNAL');
}

export function errorResponse(c: Context, err: unknown): Response {
  const e = toDomainError(err);
  const status = HTTP_STATUS[e.code] as ContentfulStatusCode;
  return c.json(errorBody(e.code, e.details), status);
}
