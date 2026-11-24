import { ErrorBodySchema } from '@pronto/shared';
import type { z } from 'zod';
import { env } from '@/lib/env';
import { ApiError, NetworkError } from './errors';
import { sessionStore } from './session';

interface RequestOptions<S extends z.ZodType> {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  query?: Record<string, string | undefined>;
  /** Response schema from `@pronto/shared`: responses are always validated. */
  schema: S;
  auth?: boolean;
  signal?: AbortSignal | undefined;
}

function buildUrl(path: string, query?: Record<string, string | undefined>): string {
  const url = `${env.apiUrl}/v1${path}`;
  if (!query) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined) qs.set(k, v);
  const s = qs.toString();
  return s ? `${url}?${s}` : url;
}

export async function request<S extends z.ZodType>(
  path: string,
  opts: RequestOptions<S>,
): Promise<z.output<S>> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.auth !== false) {
    const token = sessionStore.get()?.token;
    if (token) headers.authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? null : JSON.stringify(opts.body),
      signal: opts.signal ?? null,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new NetworkError();
  }

  const json: unknown = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const parsed = ErrorBodySchema.safeParse(json);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      if (code === 'UNAUTHENTICATED') sessionStore.set(null);
      throw new ApiError(code, res.status, message, details);
    }
    throw new ApiError('INTERNAL', res.status);
  }

  const out = opts.schema.safeParse(json);
  if (!out.success) throw new ApiError('INTERNAL', res.status, 'Response does not match contract');
  return out.data;
}
