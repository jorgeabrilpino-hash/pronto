import { createRoute, z } from '@hono/zod-openapi';
import {
  AttachmentSchema,
  AttachmentUrlResponseSchema,
  ChallengeRequestSchema,
  ChallengeResponseSchema,
  CompanyPageSchema,
  CompanySchema,
  CreateInvoiceRequestSchema,
  ErrorBodySchema,
  HealthSchema,
  IdSchema,
  InvoiceSchema,
  ListContactsQuerySchema,
  ListInvoicesQuerySchema,
  LookupQuerySchema,
  NetworkSummarySchema,
  OfferDraftResponseSchema,
  OfferIdHexSchema,
  OfferProofSchema,
  OfferSchema,
  PrepareOfferRequestSchema,
  PublicCompanySchema,
  ReconcileRequestSchema,
  RegisterCompanyRequestSchema,
  RejectInvoiceRequestSchema,
  ResendInvoiceRequestSchema,
  UpdateSettingsRequestSchema,
  UploadUrlRequestSchema,
  UploadUrlResponseSchema,
  VerifyRequestSchema,
  VerifyResponseSchema,
} from '@pronto/shared';

/**
 * OpenAPI route definitions (BACKEND_PLAN section 7). Request and response schemas are the
 * shared contract; paths are relative to `/v1` except `health`. Errors share one body shape.
 */

const json = <S extends z.ZodType>(schema: S, description: string) => ({
  content: { 'application/json': { schema } },
  description,
});

const errorResponses = {
  400: json(ErrorBodySchema, 'VALIDATION_ERROR'),
  401: json(ErrorBodySchema, 'UNAUTHENTICATED, CHALLENGE_EXPIRED or SIGNATURE_INVALID'),
  403: json(ErrorBodySchema, 'FORBIDDEN'),
  404: json(ErrorBodySchema, 'Not found'),
  409: json(ErrorBodySchema, 'Conflict with the current state'),
  422: json(ErrorBodySchema, 'Business rule violated'),
  429: json(ErrorBodySchema, 'RATE_LIMITED'),
  500: json(ErrorBodySchema, 'INTERNAL'),
  502: json(ErrorBodySchema, 'CHAIN_UNAVAILABLE'),
} as const;

const body = <S extends z.ZodType>(schema: S, required = true) => ({
  body: { content: { 'application/json': { schema } }, required },
});

const secured = [{ bearerAuth: [] }];

const InvoiceIdParams = z.object({ id: IdSchema });
const AttachmentIdParams = z.object({ id: IdSchema });
const OfferIdParams = z.object({ offerId: OfferIdHexSchema });
const CompanyCodeParams = z.object({ code: z.string().min(1).max(20) });

export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['public'],
  summary: 'Liveness check',
  responses: { 200: json(HealthSchema, 'Alive') },
});

// ---- 01, 02 auth --------------------------------------------------------------

export const challengeRoute = createRoute({
  method: 'post',
  path: '/auth/challenge',
  tags: ['auth'],
  summary: '01 Request a single-use sign-in challenge',
  request: body(ChallengeRequestSchema),
  responses: { 200: json(ChallengeResponseSchema, 'Unsigned challenge'), ...errorResponses },
});

export const verifyRoute = createRoute({
  method: 'post',
  path: '/auth/verify',
  tags: ['auth'],
  summary: '02 Verify the signed challenge and issue a session token',
  request: body(VerifyRequestSchema),
  responses: { 200: json(VerifyResponseSchema, 'Session'), ...errorResponses },
});

// ---- 03, 04, 05, 14 companies -------------------------------------------------------

export const registerCompanyRoute = createRoute({
  method: 'post',
  path: '/companies',
  tags: ['companies'],
  summary: '03 Register the company of the signed wallet',
  security: secured,
  request: body(RegisterCompanyRequestSchema),
  responses: { 201: json(CompanySchema, 'Registered'), ...errorResponses },
});

export const meRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['companies'],
  summary: '04 The caller company',
  security: secured,
  responses: { 200: json(CompanySchema, 'Company'), ...errorResponses },
});

export const settingsRoute = createRoute({
  method: 'patch',
  path: '/me/settings',
  tags: ['companies'],
  summary: '04 Update settings',
  security: secured,
  request: body(UpdateSettingsRequestSchema),
  responses: { 200: json(CompanySchema, 'Company'), ...errorResponses },
});

export const lookupRoute = createRoute({
  method: 'get',
  path: '/companies/lookup',
  tags: ['companies'],
  summary: '05 Find a company by exact code or RUC',
  security: secured,
  request: { query: LookupQuerySchema },
  responses: { 200: json(PublicCompanySchema, 'Company'), ...errorResponses },
});

export const companyPageRoute = createRoute({
  method: 'get',
  path: '/public/companies/{code}',
  tags: ['public'],
  summary: '14 Public company page (only when the ficha is public)',
  request: { params: CompanyCodeParams },
  responses: { 200: json(CompanyPageSchema, 'Public page'), ...errorResponses },
});

export const contactsRoute = createRoute({
  method: 'get',
  path: '/contacts',
  tags: ['companies'],
  summary: '14 Companies on the other side of my invoices',
  security: secured,
  request: { query: ListContactsQuerySchema },
  responses: { 200: json(z.array(PublicCompanySchema), 'Contacts'), ...errorResponses },
});

// ---- 06 attachments ---------------------------------------------------------------

export const uploadUrlRoute = createRoute({
  method: 'post',
  path: '/attachments/upload-url',
  tags: ['attachments'],
  summary: '06 Signed upload URL (the file goes straight to storage)',
  security: secured,
  request: body(UploadUrlRequestSchema),
  responses: { 201: json(UploadUrlResponseSchema, 'Upload URL'), ...errorResponses },
});

export const completeUploadRoute = createRoute({
  method: 'post',
  path: '/attachments/{id}/complete',
  tags: ['attachments'],
  summary: '06 Mark an uploaded file as ready',
  security: secured,
  request: { params: AttachmentIdParams },
  responses: { 200: json(AttachmentSchema, 'Ready'), ...errorResponses },
});

export const attachmentUrlRoute = createRoute({
  method: 'get',
  path: '/attachments/{id}/url',
  tags: ['attachments'],
  summary: '06 Short-lived download URL',
  security: secured,
  request: { params: AttachmentIdParams },
  responses: { 200: json(AttachmentUrlResponseSchema, 'Download URL'), ...errorResponses },
});

// ---- 07 to 10 invoices --------------------------------------------------------------

export const sendInvoiceRoute = createRoute({
  method: 'post',
  path: '/invoices',
  tags: ['invoices'],
  summary: '07 Send an invoice to a buyer',
  security: secured,
  request: body(CreateInvoiceRequestSchema),
  responses: { 201: json(InvoiceSchema, 'Sent'), ...errorResponses },
});

export const listInvoicesRoute = createRoute({
  method: 'get',
  path: '/invoices',
  tags: ['invoices'],
  summary: '08 My invoices as supplier or buyer',
  security: secured,
  request: { query: ListInvoicesQuerySchema },
  responses: { 200: json(z.array(InvoiceSchema), 'Invoices'), ...errorResponses },
});

export const getInvoiceRoute = createRoute({
  method: 'get',
  path: '/invoices/{id}',
  tags: ['invoices'],
  summary: '08 One invoice (supplier and buyer only)',
  security: secured,
  request: { params: InvoiceIdParams },
  responses: { 200: json(InvoiceSchema, 'Invoice'), ...errorResponses },
});

export const confirmInvoiceRoute = createRoute({
  method: 'post',
  path: '/invoices/{id}/confirm',
  tags: ['invoices'],
  summary: '09 Buyer confirms the invoice',
  security: secured,
  request: { params: InvoiceIdParams },
  responses: { 200: json(InvoiceSchema, 'Confirmed'), ...errorResponses },
});

export const rejectInvoiceRoute = createRoute({
  method: 'post',
  path: '/invoices/{id}/reject',
  tags: ['invoices'],
  summary: '09 Buyer rejects the invoice with a reason',
  security: secured,
  request: { params: InvoiceIdParams, ...body(RejectInvoiceRequestSchema) },
  responses: { 200: json(InvoiceSchema, 'Rejected'), ...errorResponses },
});

export const cancelInvoiceRoute = createRoute({
  method: 'post',
  path: '/invoices/{id}/cancel',
  tags: ['invoices'],
  summary: '10 Supplier cancels the invoice (no active offer)',
  security: secured,
  request: { params: InvoiceIdParams },
  responses: { 200: json(InvoiceSchema, 'Cancelled'), ...errorResponses },
});

export const resendInvoiceRoute = createRoute({
  method: 'patch',
  path: '/invoices/{id}',
  tags: ['invoices'],
  summary: '10 Supplier corrects and resends the invoice',
  security: secured,
  request: { params: InvoiceIdParams, ...body(ResendInvoiceRequestSchema) },
  responses: { 200: json(InvoiceSchema, 'Resent'), ...errorResponses },
});

// ---- 11 to 13, 18 offers ------------------------------------------------------------

export const prepareOfferRoute = createRoute({
  method: 'post',
  path: '/invoices/{id}/offers/draft',
  tags: ['offers'],
  summary: '11 Buyer prepares an offer (pending until seen on chain)',
  security: secured,
  request: { params: InvoiceIdParams, ...body(PrepareOfferRequestSchema) },
  responses: { 201: json(OfferDraftResponseSchema, 'Draft'), ...errorResponses },
});

export const reconcileOfferRoute = createRoute({
  method: 'post',
  path: '/offers/{offerId}/reconcile',
  tags: ['offers'],
  summary: '12 Re-read the offer from the network and update the mirror',
  security: secured,
  request: { params: OfferIdParams, ...body(ReconcileRequestSchema, false) },
  responses: { 200: json(OfferSchema, 'Offer'), ...errorResponses },
});

export const offerProofRoute = createRoute({
  method: 'get',
  path: '/offers/{offerId}',
  tags: ['offers'],
  summary: '13 Data for "Ver en la red"',
  security: secured,
  request: { params: OfferIdParams },
  responses: { 200: json(OfferProofSchema, 'Proof'), ...errorResponses },
});

export const networkRoute = createRoute({
  method: 'get',
  path: '/public/network',
  tags: ['public'],
  summary: '18 Public network summary',
  responses: { 200: json(NetworkSummarySchema, 'Summary'), ...errorResponses },
});
