import {
  AttachmentSchema,
  AttachmentUrlResponseSchema,
  ChallengeRequestSchema,
  ChallengeResponseSchema,
  CompanyPageSchema,
  CompanySchema,
  CreateInvoiceRequestSchema,
  DisplayStatusSchema,
  DomainError,
  HealthSchema,
  HTTP_STATUS,
  InvoiceSchema,
  IsoDateTimeSchema,
  ListContactsQuerySchema,
  LookupQuerySchema,
  NetworkSummarySchema,
  OfferDraftResponseSchema,
  OfferProofSchema,
  OfferSchema,
  PrepareOfferRequestSchema,
  PublicCompanySchema,
  ReconcileRequestSchema,
  RegisterCompanyRequestSchema,
  RejectInvoiceRequestSchema,
  ResendInvoiceRequestSchema,
  RoleSchema,
  UpdateSettingsRequestSchema,
  UploadUrlRequestSchema,
  UploadUrlResponseSchema,
  VerifyRequestSchema,
  VerifyResponseSchema,
} from '@pronto/shared';
import { delay, HttpResponse, http, type JsonBodyType } from 'msw';
import { z } from 'zod';
import { mockConfig } from './config';
import * as db from './db';

interface Ctx {
  address: string | null;
  params: Record<string, string>;
  url: URL;
  body: () => Promise<unknown>;
}

type Method = 'get' | 'post' | 'patch';

function addressOf(request: Request): string | null {
  const m = /^Bearer mock\.([A-Z2-7]+)\./.exec(request.headers.get('authorization') ?? '');
  return m?.[1] ?? null;
}

function errorResponse(e: unknown): Response {
  if (e instanceof DomainError) {
    return HttpResponse.json(
      { error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } },
      { status: HTTP_STATUS[e.code] },
    );
  }
  if (e instanceof z.ZodError) {
    return HttpResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } },
      { status: 400 },
    );
  }
  console.error('[mock api]', e);
  return HttpResponse.json(
    { error: { code: 'INTERNAL', message: 'Mock failure' } },
    { status: 500 },
  );
}

/** Registers one endpoint; the response is always validated with the shared schema. */
function route<S extends z.ZodType>(
  method: Method,
  path: string,
  schema: S,
  fn: (ctx: Ctx) => unknown,
  status = 200,
) {
  return http[method](`*/v1${path}`, async ({ request, params }) => {
    await delay(mockConfig.latencyMs);
    try {
      const ctx: Ctx = {
        address: addressOf(request),
        params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
        url: new URL(request.url),
        body: () => request.json().catch(() => ({})),
      };
      const data = schema.parse(await fn(ctx));
      return HttpResponse.json(data as JsonBodyType, { status });
    } catch (e) {
      return errorResponse(e);
    }
  });
}

const param = (ctx: Ctx, name: string) => ctx.params[name] ?? '';

export const handlers = [
  route('get', '/health', HealthSchema, () => ({
    status: 'ok' as const,
    time: IsoDateTimeSchema.parse(new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')),
  })),
  route('get', '/public/network', NetworkSummarySchema, () => db.networkSummary()),

  route('post', '/auth/challenge', ChallengeResponseSchema, async (c) =>
    db.requestChallenge(ChallengeRequestSchema.parse(await c.body()).address),
  ),
  route('post', '/auth/verify', VerifyResponseSchema, async (c) => {
    const b = VerifyRequestSchema.parse(await c.body());
    return db.verifyChallenge(b.address, b.signedXdr);
  }),

  route(
    'post',
    '/companies',
    CompanySchema,
    async (c) => db.registerCompany(c.address, RegisterCompanyRequestSchema.parse(await c.body())),
    201,
  ),
  route('get', '/me', CompanySchema, (c) => db.requireCompany(c.address)),
  route('patch', '/me/settings', CompanySchema, async (c) =>
    db.updateSettings(c.address, UpdateSettingsRequestSchema.parse(await c.body())),
  ),
  route('get', '/companies/lookup', PublicCompanySchema, (c) => {
    const q = LookupQuerySchema.parse({
      code: c.url.searchParams.get('code') ?? undefined,
      ruc: c.url.searchParams.get('ruc') ?? undefined,
    });
    return db.lookup(c.address, q);
  }),
  route('get', '/contacts', z.array(PublicCompanySchema), (c) =>
    db.contacts(
      c.address,
      ListContactsQuerySchema.parse({ role: c.url.searchParams.get('role') }).role,
    ),
  ),
  route('get', '/public/companies/:code', CompanyPageSchema, (c) =>
    db.companyPage(param(c, 'code')),
  ),

  route(
    'post',
    '/attachments/upload-url',
    UploadUrlResponseSchema,
    async (c) => db.requestUpload(c.address, UploadUrlRequestSchema.parse(await c.body())),
    201,
  ),
  route('post', '/attachments/:id/complete', AttachmentSchema, (c) =>
    db.completeUpload(c.address, param(c, 'id')),
  ),
  route('get', '/attachments/:id/url', AttachmentUrlResponseSchema, (c) =>
    db.attachmentUrl(c.address, param(c, 'id'), c.url.origin),
  ),

  route(
    'post',
    '/invoices',
    InvoiceSchema,
    async (c) => db.sendInvoice(c.address, CreateInvoiceRequestSchema.parse(await c.body())),
    201,
  ),
  route('get', '/invoices', z.array(InvoiceSchema), (c) => {
    const role = RoleSchema.parse(c.url.searchParams.get('role'));
    const raw = c.url.searchParams.get('status');
    return db.listInvoices(c.address, role, raw ? DisplayStatusSchema.parse(raw) : undefined);
  }),
  route('get', '/invoices/:id', InvoiceSchema, (c) => db.getInvoice(c.address, param(c, 'id'))),
  route('post', '/invoices/:id/confirm', InvoiceSchema, (c) =>
    db.transition(c.address, param(c, 'id'), 'confirm'),
  ),
  route('post', '/invoices/:id/reject', InvoiceSchema, async (c) =>
    db.transition(c.address, param(c, 'id'), 'reject', {
      reason: RejectInvoiceRequestSchema.parse(await c.body()).reason,
    }),
  ),
  route('post', '/invoices/:id/cancel', InvoiceSchema, (c) =>
    db.transition(c.address, param(c, 'id'), 'cancel'),
  ),
  route('patch', '/invoices/:id', InvoiceSchema, async (c) => {
    const patch = ResendInvoiceRequestSchema.parse(await c.body());
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    return db.transition(c.address, param(c, 'id'), 'resend', { resend: clean });
  }),

  route(
    'post',
    '/invoices/:id/offers/draft',
    OfferDraftResponseSchema,
    async (c) =>
      db.draftOffer(c.address, param(c, 'id'), PrepareOfferRequestSchema.parse(await c.body())),
    201,
  ),
  route('post', '/offers/:offerId/reconcile', OfferSchema, async (c) => {
    ReconcileRequestSchema.parse(await c.body());
    return db.reconcileOffer(c.address, param(c, 'offerId'));
  }),
  route('get', '/offers/:offerId', OfferProofSchema, (c) =>
    db.offerProof(c.address, param(c, 'offerId')),
  ),

  // Direct upload to "storage" (a signed URL in the real API).
  http.put('https://mock-storage.pronto.test/upload/:id', async () => {
    await delay(mockConfig.latencyMs);
    return new HttpResponse(null, { status: 200 });
  }),
];
