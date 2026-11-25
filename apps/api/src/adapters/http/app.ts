import { createHash } from 'node:crypto';
import { OpenAPIHono } from '@hono/zod-openapi';
import { DomainError } from '@pronto/shared';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import type { Clock } from '../../application/ports';
import type { Actor, UseCases } from '../../application/use-cases';
import { errorResponse, toDomainError } from './errors';
import * as r from './routes';

/**
 * HTTP adapter (BACKEND_PLAN sections 7 and 12). Thin: it authenticates, validates with the
 * shared schemas, calls one use case and maps errors. Authorization lives in the use cases.
 */

export const MAX_BODY_BYTES = 1_048_576;
export const OPENAPI_PATH = '/openapi.json';

export interface HttpAppOptions {
  useCases: UseCases;
  clock: Clock;
  /** Exact origins allowed by CORS (scheme, host and port). */
  allowedOrigins: readonly string[];
  /** Receives one JSON line per request. Defaults to stdout. */
  log?: (line: string) => void;
  /** Socket address of the caller, used when there is no x-forwarded-for header. */
  socketIp?: (c: Context) => string | undefined;
}

export interface HttpEnv {
  Variables: { requestId: string; errorCode?: string };
}

type Ctx = Context<HttpEnv>;

const BEARER_RE = /^Bearer\s+(\S+)$/i;

/** First hop of x-forwarded-for, else the socket address; undefined when neither is known. */
export function callerIp(
  c: Context,
  socketIp?: (c: Context) => string | undefined,
): string | undefined {
  const forwarded = c.req.header('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first !== undefined && first !== '') return first;
  const socket = socketIp?.(c);
  return socket === undefined || socket === '' ? undefined : socket;
}

/** Opaque client id for rate limits: the IP is never stored or logged in clear. */
export function hashClientId(ip: string): string {
  return createHash('sha256').update(`pronto-client:${ip}`).digest('hex').slice(0, 32);
}

const defaultLog = (line: string) => {
  process.stdout.write(`${line}\n`);
};

export function createHttpApp(options: HttpAppOptions): OpenAPIHono<HttpEnv> {
  const uc = options.useCases;
  const log = options.log ?? defaultLog;
  const allowed = new Set(options.allowedOrigins);

  const onError = (err: Error, c: Ctx) => {
    c.set('errorCode', toDomainError(err).code);
    return errorResponse(c, err);
  };
  const defaultHook = (result: { success: boolean; error?: unknown }) => {
    if (result.success) return;
    const issues =
      result.error !== null &&
      typeof result.error === 'object' &&
      'issues' in result.error &&
      Array.isArray(result.error.issues)
        ? result.error.issues.map((i: { path?: PropertyKey[]; message?: string }) => ({
            path: (i.path ?? []).map(String).join('.'),
            message: i.message ?? '',
          }))
        : [];
    throw new DomainError('VALIDATION_ERROR', 'Invalid input', { issues });
  };

  const actorOf = async (c: Ctx): Promise<Actor> => {
    const match = BEARER_RE.exec(c.req.header('authorization') ?? '');
    return uc.authenticate.execute(match?.[1] ?? null);
  };

  const app = new OpenAPIHono<HttpEnv>({ defaultHook });

  // One JSON line per request: never tokens, bodies, query strings or secrets.
  app.use('*', async (c, next) => {
    const started = performance.now();
    await next();
    const entry: Record<string, unknown> = {
      level: c.res.status >= 500 ? 'error' : 'info',
      msg: 'request',
      requestId: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - started),
    };
    const code = c.get('errorCode');
    if (code !== undefined) entry.errorCode = code;
    log(JSON.stringify(entry));
  });
  app.use('*', requestId({ limitLength: 64 }));
  app.use(
    '*',
    cors({
      origin: (origin) => (allowed.has(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
      exposeHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );
  app.use('*', secureHeaders());
  app.use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });
  app.use(
    '*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => {
        c.set('errorCode', 'PAYLOAD_TOO_LARGE');
        return errorResponse(c, new DomainError('PAYLOAD_TOO_LARGE'));
      },
    }),
  );

  app.onError(onError);
  app.notFound((c) => {
    c.set('errorCode', 'NOT_FOUND');
    return errorResponse(c, new DomainError('NOT_FOUND'));
  });

  const health = (c: Ctx) =>
    c.json({ status: 'ok' as const, time: options.clock.now().toISOString() }, 200);
  app.openapi(r.healthRoute, health);

  const v1 = new OpenAPIHono<HttpEnv>({ defaultHook });
  v1.onError(onError);
  v1.openapi(r.healthRoute, health);

  // 01, 02
  v1.openapi(r.challengeRoute, async (c) => {
    const ip = callerIp(c, options.socketIp);
    const context = ip === undefined ? {} : { clientId: hashClientId(ip) };
    return c.json(await uc.requestChallenge.execute(c.req.valid('json'), context), 200);
  });
  v1.openapi(r.verifyRoute, async (c) =>
    c.json(await uc.verifyChallenge.execute(c.req.valid('json')), 200),
  );

  // 03, 04, 05, 14
  v1.openapi(r.registerCompanyRoute, async (c) => {
    const actor = await actorOf(c);
    return c.json(await uc.registerCompany.execute(actor, c.req.valid('json')), 201);
  });
  v1.openapi(r.meRoute, async (c) => c.json(await uc.getMe.execute(await actorOf(c)), 200));
  v1.openapi(r.settingsRoute, async (c) => {
    const actor = await actorOf(c);
    return c.json(await uc.updateSettings.execute(actor, c.req.valid('json')), 200);
  });
  v1.openapi(r.lookupRoute, async (c) => {
    const actor = await actorOf(c);
    return c.json(await uc.findCompany.execute(actor, c.req.valid('query')), 200);
  });
  v1.openapi(r.companyPageRoute, async (c) =>
    c.json(await uc.getCompanyPage.execute(c.req.valid('param').code), 200),
  );
  v1.openapi(r.contactsRoute, async (c) => {
    const actor = await actorOf(c);
    return c.json(await uc.listContacts.execute(actor, c.req.valid('query')), 200);
  });

  // 06
  v1.openapi(r.uploadUrlRoute, async (c) => {
    const actor = await actorOf(c);
    return c.json(await uc.requestUploadUrl.execute(actor, c.req.valid('json')), 201);
  });
  v1.openapi(r.completeUploadRoute, async (c) => {
    const actor = await actorOf(c);
    return c.json(await uc.completeUpload.execute(actor, c.req.valid('param').id), 200);
  });
  v1.openapi(r.attachmentUrlRoute, async (c) => {
    const actor = await actorOf(c);
    return c.json(await uc.getAttachmentUrl.execute(actor, c.req.valid('param').id), 200);
  });

  // 07 to 10
  v1.openapi(r.sendInvoiceRoute, async (c) => {
    const actor = await actorOf(c);
    return c.json(await uc.sendInvoice.execute(actor, c.req.valid('json')), 201);
  });
  v1.openapi(r.listInvoicesRoute, async (c) => {
    const actor = await actorOf(c);
    return c.json(await uc.listInvoices.execute(actor, c.req.valid('query')), 200);
  });
  v1.openapi(r.getInvoiceRoute, async (c) => {
    const actor = await actorOf(c);
    return c.json(await uc.getInvoice.execute(actor, c.req.valid('param').id), 200);
  });
  v1.openapi(r.confirmInvoiceRoute, async (c) => {
    const actor = await actorOf(c);
    return c.json(await uc.confirmInvoice.execute(actor, c.req.valid('param').id), 200);
  });
  v1.openapi(r.rejectInvoiceRoute, async (c) => {
    const actor = await actorOf(c);
    const { id } = c.req.valid('param');
    return c.json(await uc.rejectInvoice.execute(actor, id, c.req.valid('json')), 200);
  });
  v1.openapi(r.cancelInvoiceRoute, async (c) => {
    const actor = await actorOf(c);
    return c.json(await uc.cancelInvoice.execute(actor, c.req.valid('param').id), 200);
  });
  v1.openapi(r.resendInvoiceRoute, async (c) => {
    const actor = await actorOf(c);
    const { id } = c.req.valid('param');
    return c.json(await uc.editAndResend.execute(actor, id, c.req.valid('json')), 200);
  });

  // 11 to 13, 18
  v1.openapi(r.prepareOfferRoute, async (c) => {
    const actor = await actorOf(c);
    const { id } = c.req.valid('param');
    return c.json(await uc.prepareOffer.execute(actor, id, c.req.valid('json')), 201);
  });
  v1.openapi(r.reconcileOfferRoute, async (c) => {
    const actor = await actorOf(c);
    const { offerId } = c.req.valid('param');
    const input = (c.req.valid('json') as object | undefined) ?? {};
    return c.json(await uc.reconcileOffer.execute(actor, offerId, input), 200);
  });
  v1.openapi(r.offerProofRoute, async (c) => {
    const actor = await actorOf(c);
    return c.json(await uc.getOfferProof.execute(actor, c.req.valid('param').offerId), 200);
  });
  v1.openapi(r.networkRoute, async (c) => c.json(await uc.getNetworkSummary.execute(), 200));

  app.route('/v1', v1);

  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });
  app.doc(OPENAPI_PATH, {
    openapi: '3.0.3',
    info: {
      title: 'Pronto API',
      version: '1.0.0',
      description: 'Pronto backend on the Stellar TESTNET. Money is a decimal string.',
    },
  });

  return app;
}
