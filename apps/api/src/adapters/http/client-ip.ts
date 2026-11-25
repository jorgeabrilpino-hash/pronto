import { isIP } from 'node:net';
import type { Context } from 'hono';

/**
 * Caller IP for the per-client rate limit. Proxy trust is explicit: the composition root picks
 * one resolver. The raw leftmost x-forwarded-for hop is never honored, because any client can
 * write it. Every candidate must be a valid IP (node:net isIP); otherwise the socket address
 * is used, and when there is none the caller gets no client id (only the per-address limit).
 */

/** Socket address supplied by the server adapter (e.g. @hono/node-server getConnInfo). */
export type SocketIp = (c: Context) => string | undefined;
export type ClientIpResolver = (c: Context, socketIp?: SocketIp) => string | undefined;

/** The trimmed value when it is a valid IPv4 or IPv6 address, else undefined. */
export function validIp(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v !== undefined && isIP(v) !== 0 ? v : undefined;
}

function socket(c: Context, socketIp?: SocketIp): string | undefined {
  return validIp(socketIp?.(c));
}

/** Default: only the socket address; forwarding headers are ignored. */
export const socketOnly: ClientIpResolver = (c, socketIp) => socket(c, socketIp);

/**
 * Vercel: `x-vercel-forwarded-for` and `x-real-ip` are set by the platform edge, which
 * overwrites any value the client sends. Use only for the Vercel entry.
 */
export const vercel: ClientIpResolver = (c, socketIp) =>
  validIp(c.req.header('x-vercel-forwarded-for')?.split(',')[0]) ??
  validIp(c.req.header('x-real-ip')) ??
  socket(c, socketIp);

/**
 * Behind exactly `hops` trusted proxies that each append to x-forwarded-for: the address
 * `hops` positions from the RIGHT is the one the outermost trusted proxy saw.
 */
export function trustedHops(hops: number): ClientIpResolver {
  if (!Number.isInteger(hops) || hops < 1) throw new RangeError('hops must be a positive integer');
  return (c, socketIp) => {
    const parts = (c.req.header('x-forwarded-for') ?? '').split(',');
    const candidate = parts.length >= hops ? parts[parts.length - hops] : undefined;
    return validIp(candidate) ?? socket(c, socketIp);
  };
}
