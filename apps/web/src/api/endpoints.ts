import {
  AttachmentSchema,
  AttachmentUrlResponseSchema,
  ChallengeResponseSchema,
  CompanyPageSchema,
  CompanySchema,
  type CreateInvoiceRequestSchema,
  type DisplayStatus,
  HealthSchema,
  InvoiceSchema,
  NetworkSummarySchema,
  OfferDraftResponseSchema,
  OfferProofSchema,
  OfferSchema,
  type PrepareOfferRequest,
  PublicCompanySchema,
  type RegisterCompanyRequestSchema,
  type ResendInvoiceRequest,
  type Role,
  type UpdateSettingsRequestSchema,
  type UploadUrlRequestSchema,
  UploadUrlResponseSchema,
  VerifyResponseSchema,
} from '@pronto/shared';
import { z } from 'zod';
import { request } from './client';

type Input<S extends z.ZodType> = z.input<S>;

export const api = {
  health: () => request('/health', { schema: HealthSchema, auth: false }),
  network: () => request('/public/network', { schema: NetworkSummarySchema, auth: false }),

  // Auth (public)
  challenge: (address: string) =>
    request('/auth/challenge', {
      method: 'POST',
      body: { address },
      schema: ChallengeResponseSchema,
      auth: false,
    }),
  verify: (address: string, signedXdr: string) =>
    request('/auth/verify', {
      method: 'POST',
      body: { address, signedXdr },
      schema: VerifyResponseSchema,
      auth: false,
    }),

  // Companies
  registerCompany: (body: Input<typeof RegisterCompanyRequestSchema>) =>
    request('/companies', { method: 'POST', body, schema: CompanySchema }),
  me: () => request('/me', { schema: CompanySchema }),
  updateSettings: (patch: Input<typeof UpdateSettingsRequestSchema>) =>
    request('/me/settings', { method: 'PATCH', body: patch, schema: CompanySchema }),
  lookup: (q: { code: string } | { ruc: string }) =>
    request('/companies/lookup', { query: q, schema: PublicCompanySchema }),
  contacts: (role: Role) =>
    request('/contacts', { query: { role }, schema: z.array(PublicCompanySchema) }),
  companyPage: (code: string) =>
    request(`/public/companies/${encodeURIComponent(code)}`, {
      schema: CompanyPageSchema,
      auth: false,
    }),

  // Attachments
  uploadUrl: (body: Input<typeof UploadUrlRequestSchema>) =>
    request('/attachments/upload-url', {
      method: 'POST',
      body,
      schema: UploadUrlResponseSchema,
    }),
  completeUpload: (id: string) =>
    request(`/attachments/${id}/complete`, { method: 'POST', schema: AttachmentSchema }),
  attachmentUrl: (id: string) =>
    request(`/attachments/${id}/url`, { schema: AttachmentUrlResponseSchema }),

  // Invoices
  sendInvoice: (body: Input<typeof CreateInvoiceRequestSchema>) =>
    request('/invoices', { method: 'POST', body, schema: InvoiceSchema }),
  invoices: (role: Role, status?: DisplayStatus) =>
    request('/invoices', {
      query: { role, status },
      schema: z.array(InvoiceSchema),
    }),
  invoice: (id: string) => request(`/invoices/${id}`, { schema: InvoiceSchema }),
  confirmInvoice: (id: string) =>
    request(`/invoices/${id}/confirm`, { method: 'POST', schema: InvoiceSchema }),
  rejectInvoice: (id: string, reason: string) =>
    request(`/invoices/${id}/reject`, { method: 'POST', body: { reason }, schema: InvoiceSchema }),
  cancelInvoice: (id: string) =>
    request(`/invoices/${id}/cancel`, { method: 'POST', schema: InvoiceSchema }),
  resendInvoice: (id: string, body: ResendInvoiceRequest) =>
    request(`/invoices/${id}`, { method: 'PATCH', body, schema: InvoiceSchema }),

  // Offers
  draftOffer: (invoiceId: string, body: PrepareOfferRequest) =>
    request(`/invoices/${invoiceId}/offers/draft`, {
      method: 'POST',
      body,
      schema: OfferDraftResponseSchema,
    }),
  reconcileOffer: (offerIdHex: string, txHash?: string) =>
    request(`/offers/${offerIdHex}/reconcile`, {
      method: 'POST',
      body: txHash ? { txHash } : {},
      schema: OfferSchema,
    }),
  offerProof: (offerIdHex: string) =>
    request(`/offers/${offerIdHex}`, { schema: OfferProofSchema }),
};
