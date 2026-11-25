import { z } from 'zod';
import { ERROR_CODES } from './errors';

/**
 * Data contract between API and front end (BACKEND_PLAN sections 5 and 7).
 * Money is always a decimal string with up to 7 decimals, never a JS number.
 * RUC check digit and address checksum are validated by the domain, not here.
 */

// ---- Value schemas -------------------------------------------------------

export const RucSchema = z.string().regex(/^\d{11}$/, 'RUC must have 11 digits');
export const CompanyCodeSchema = z
  .string()
  .regex(/^PR-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/, 'Invalid company code');
export const StellarAddressSchema = z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar address');
export const MoneySchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,12})(?:\.\d{1,7})?$/, 'Invalid amount (max 7 decimals)');
export const PositiveMoneySchema = MoneySchema.refine((v) => /[1-9]/.test(v), 'Must be > 0');
export const BpsSchema = z.number().int().min(0).max(5000);
export const OfferIdHexSchema = z.string().regex(/^[0-9a-f]{64}$/, 'Invalid offer id');
export const IdSchema = z.uuid();
export const IsoDateSchema = z.iso.date();
export const IsoDateTimeSchema = z.iso.datetime();
export const InvoiceSeriesSchema = z.string().regex(/^[A-Z0-9]{4}$/);
/**
 * Invoice number: 1 to 8 digits. Leading zeros are stripped so "0123" and "123" are the
 * same invoice (the database checks `^[1-9][0-9]{0,7}$`); all zeros is rejected.
 */
export const InvoiceNumberSchema = z
  .string()
  .regex(/^\d{1,8}$/)
  .transform((v) => v.replace(/^0+/, ''))
  .refine((v) => v.length > 0, 'Invoice number cannot be zero');

export const InvoiceStatusSchema = z.enum(['sent', 'rejected', 'confirmed', 'cancelled']);
export const ChainStatusSchema = z.enum(['pending', 'open', 'accepted', 'reclaimed', 'failed']);
export const AttachmentKindSchema = z.enum(['pdf', 'image', 'xml']);
export const RoleSchema = z.enum(['supplier', 'buyer']);
/**
 * Company profile chosen at registration. It gates actions: sending, cancelling and resending
 * invoices need supplier or both; confirming, rejecting, preparing offers and reconciling as
 * buyer need buyer or both. Reading lists is allowed for every profile.
 */
export const ProfileSchema = z.enum(['supplier', 'buyer', 'both']);
/** Status the user sees: invoice status combined with the offer (computed, never stored). */
export const DisplayStatusSchema = z.enum([
  'sent',
  'rejected',
  'confirmed',
  'offer_open',
  'collected',
  'offer_expired',
  'cancelled',
]);

export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;
export type ChainStatus = z.infer<typeof ChainStatusSchema>;
export type AttachmentKind = z.infer<typeof AttachmentKindSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type DisplayStatus = z.infer<typeof DisplayStatusSchema>;

// ---- Errors --------------------------------------------------------------

export const ErrorBodySchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

// ---- Auth (use cases 01 and 02) -------------------------------------------

export const ChallengeRequestSchema = z.object({ address: StellarAddressSchema });
export const ChallengeResponseSchema = z.object({
  challengeXdr: z.string().min(1),
  nonce: z.string().min(1),
  expiresAt: IsoDateTimeSchema,
});
export const VerifyRequestSchema = z.object({
  address: StellarAddressSchema,
  signedXdr: z.string().min(1),
});

// ---- Companies (03, 04, 05, 14) -------------------------------------------

export const RegisterCompanyRequestSchema = z.object({
  ruc: RucSchema,
  legalName: z.string().trim().min(2).max(200),
  sector: z.string().trim().min(2).max(80),
  profile: ProfileSchema,
});
/** PATCH /me/settings: send at least one field. */
export const UpdateSettingsRequestSchema = z
  .object({ fichaPublica: z.boolean().optional(), profile: ProfileSchema.optional() })
  .refine((d) => d.fichaPublica !== undefined || d.profile !== undefined, {
    message: 'Send fichaPublica or profile',
  });

export const PublicCompanySchema = z.object({
  id: IdSchema,
  code: CompanyCodeSchema,
  legalName: z.string(),
  ruc: RucSchema,
});
export const CompanySchema = PublicCompanySchema.extend({
  sector: z.string(),
  wallet: StellarAddressSchema,
  fichaPublica: z.boolean(),
  profile: ProfileSchema,
  createdAt: IsoDateTimeSchema,
});

export const VerifyResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: IsoDateTimeSchema,
  company: CompanySchema.nullable(),
});

export const LookupQuerySchema = z
  .object({ code: CompanyCodeSchema.optional(), ruc: RucSchema.optional() })
  .refine((q) => (q.code === undefined) !== (q.ruc === undefined), {
    message: 'Send exactly one of code or ruc',
  });

// ---- Attachments (06) -------------------------------------------------------

export const MAX_ATTACHMENT_BYTES = 5_242_880;
export const ATTACHMENT_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/xml',
  'text/xml',
] as const;

export const UploadUrlRequestSchema = z.object({
  kind: AttachmentKindSchema,
  mime: z.enum(ATTACHMENT_MIMES),
  sizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
});
export const UploadUrlResponseSchema = z.object({
  attachmentId: IdSchema,
  uploadUrl: z.url(),
  expiresAt: IsoDateTimeSchema,
});
export const AttachmentSchema = z.object({
  id: IdSchema,
  kind: AttachmentKindSchema,
  mime: z.string(),
  sizeBytes: z.number().int().nonnegative(),
});

// ---- Offers (11, 12, 13) ----------------------------------------------------

export const OfferSchema = z.object({
  offerIdHex: OfferIdHexSchema,
  invoiceId: IdSchema,
  netAmount: MoneySchema,
  discountAmount: MoneySchema,
  discountBps: BpsSchema,
  expiresAt: IsoDateTimeSchema,
  chainStatus: ChainStatusSchema,
  txCreate: z.string().nullable(),
  txAccept: z.string().nullable(),
  txReclaim: z.string().nullable(),
  contractId: z.string().min(1),
  /** When the offer was prepared (activity history). */
  createdAt: IsoDateTimeSchema,
  /** First time an accept was recorded; null until then. */
  acceptedAt: IsoDateTimeSchema.nullable(),
});

export const OfferWarningSchema = z.enum(['DISCOUNT_ABOVE_SUPPLIER_MAX']);
export const PrepareOfferRequestSchema = z.object({
  discountBps: z.number().int().min(1).max(5000),
  validityDays: z.union([z.literal(3), z.literal(7), z.literal(15)]),
});
export const OfferDraftResponseSchema = OfferSchema.extend({
  annualizedBps: z.number().int().nonnegative(),
  supplierWallet: StellarAddressSchema,
  warnings: z.array(OfferWarningSchema),
});
export const ReconcileRequestSchema = z.object({
  txHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
});

// ---- Invoices (07 to 10) ----------------------------------------------------

export const CreateInvoiceRequestSchema = z
  .object({
    buyerCompanyId: IdSchema,
    series: InvoiceSeriesSchema,
    number: InvoiceNumberSchema,
    faceAmount: PositiveMoneySchema,
    currency: z.literal('USDC'),
    issueDate: IsoDateSchema,
    dueDate: IsoDateSchema,
    longerTermAgreed: z.boolean().default(false),
    maxDiscountBps: BpsSchema.optional(),
    attachmentIds: z.array(IdSchema).min(1).max(2),
  })
  .refine((d) => d.dueDate > d.issueDate, {
    message: 'dueDate must be after issueDate',
    path: ['dueDate'],
  });

export const RejectInvoiceRequestSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export const ListInvoicesQuerySchema = z.object({
  role: RoleSchema,
  status: DisplayStatusSchema.optional(),
});

export const InvoiceSchema = z.object({
  id: IdSchema,
  supplier: PublicCompanySchema,
  buyer: PublicCompanySchema,
  series: InvoiceSeriesSchema,
  number: InvoiceNumberSchema,
  faceAmount: MoneySchema,
  currency: z.literal('USDC'),
  issueDate: IsoDateSchema,
  dueDate: IsoDateSchema,
  longerTermAgreed: z.boolean(),
  maxDiscountBps: BpsSchema.nullable(),
  status: InvoiceStatusSchema,
  displayStatus: DisplayStatusSchema,
  rejectionReason: z.string().nullable(),
  attachments: z.array(AttachmentSchema),
  offer: OfferSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});

// ---- Public ---------------------------------------------------------------

export const HealthSchema = z.object({ status: z.literal('ok'), time: IsoDateTimeSchema });
export const NetworkSummarySchema = z.object({
  network: z.literal('testnet'),
  contractId: z.string(),
  offersCreated: z.number().int().nonnegative(),
  offersAccepted: z.number().int().nonnegative(),
  lastOperations: z.array(
    z.object({
      kind: z.enum(['create', 'accept', 'reclaim']),
      txHash: z.string(),
      at: IsoDateTimeSchema,
    }),
  ),
});

export type CreateInvoiceRequest = z.infer<typeof CreateInvoiceRequestSchema>;
export type PrepareOfferRequest = z.infer<typeof PrepareOfferRequestSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
export type Offer = z.infer<typeof OfferSchema>;
export type OfferDraftResponse = z.infer<typeof OfferDraftResponseSchema>;
export type Company = z.infer<typeof CompanySchema>;
export type PublicCompany = z.infer<typeof PublicCompanySchema>;

// ---- Additions from B2 (additive only) ---------------------------------------

/** PATCH /invoices/:id (use case 10): corrected fields; the invoice goes back to `sent`. */
export const ResendInvoiceRequestSchema = z.object({
  series: InvoiceSeriesSchema.optional(),
  number: InvoiceNumberSchema.optional(),
  faceAmount: PositiveMoneySchema.optional(),
  issueDate: IsoDateSchema.optional(),
  dueDate: IsoDateSchema.optional(),
  longerTermAgreed: z.boolean().optional(),
  maxDiscountBps: BpsSchema.nullable().optional(),
});

/** GET /attachments/:id/url (use case 06). */
export const AttachmentUrlResponseSchema = z.object({ url: z.url() });

/** GET /offers/:offerId (use case 13): data for "Ver en la red". */
export const OfferProofSchema = OfferSchema.extend({
  network: z.literal('testnet'),
  invoiceSeries: InvoiceSeriesSchema,
  invoiceNumber: InvoiceNumberSchema,
  faceAmount: MoneySchema,
  supplierWallet: StellarAddressSchema,
  buyerWallet: StellarAddressSchema,
});

/** GET /contacts?role= (use case 14): role is the caller's side of the invoices. */
export const ListContactsQuerySchema = z.object({ role: RoleSchema });

/** GET /public/companies/:code (use case 14): only when the company's ficha is public. */
export const CompanyPageSchema = z.object({
  code: CompanyCodeSchema,
  legalName: z.string(),
  ruc: RucSchema,
  sector: z.string(),
});

export type ResendInvoiceRequest = z.infer<typeof ResendInvoiceRequestSchema>;
export type OfferProof = z.infer<typeof OfferProofSchema>;
export type CompanyPage = z.infer<typeof CompanyPageSchema>;

/** Type-only re-export so consumers can type schema helpers without depending on zod. */
export type { z } from 'zod';
