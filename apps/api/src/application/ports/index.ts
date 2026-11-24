import type { InvoiceStatus, Role } from '@pronto/shared';
import type { Amount, Attachment, ChainOffer, Company, Invoice, Offer } from '../../domain/types';

/**
 * Ports: the interfaces the core needs from the outside world (BACKEND_PLAN section 6).
 * Adapters (Postgres, Supabase Storage, Stellar RPC, JWT, AI) implement them in B3 and B6.
 * Use cases receive them by constructor; the core never imports an adapter.
 */

export type InvoicePatch = Partial<
  Pick<
    Invoice,
    | 'status'
    | 'rejectionReason'
    | 'series'
    | 'number'
    | 'faceAmount'
    | 'issueDate'
    | 'dueDate'
    | 'longerTermAgreed'
    | 'maxDiscountBps'
  >
>;

export type OfferPatch = Partial<
  Pick<Offer, 'chainStatus' | 'txCreate' | 'txAccept' | 'txReclaim' | 'lastCheckedAt'>
>;

export interface CompanyRepository {
  byId(id: string): Promise<Company | null>;
  byRuc(ruc: string): Promise<Company | null>;
  byCode(code: string): Promise<Company | null>;
  byWallet(address: string): Promise<Company | null>;
  insert(company: Company): Promise<void>;
  update(id: string, patch: Partial<Pick<Company, 'fichaPublica'>>): Promise<Company>;
}

export interface InvoiceRepository {
  insert(invoice: Invoice): Promise<void>;
  byId(id: string): Promise<Invoice | null>;
  listFor(companyId: string, role: Role, status?: InvoiceStatus): Promise<Invoice[]>;
  duplicateExists(supplierId: string, series: string, number: string): Promise<boolean>;
  /** Returns null when the stored version differs from `expectedVersion` (concurrent change). */
  update(id: string, expectedVersion: number, patch: InvoicePatch): Promise<Invoice | null>;
}

export interface OfferRepository {
  insertPending(offer: Offer): Promise<void>;
  byOfferId(offerIdHex: string): Promise<Offer | null>;
  byInvoice(invoiceId: string): Promise<Offer[]>;
  update(offerIdHex: string, patch: OfferPatch): Promise<Offer>;
  listFor(companyId: string): Promise<Offer[]>;
  /** (B2) Offers seen on chain (open, accepted or reclaimed) and accepted ones, network wide. */
  stats(): Promise<{ created: number; accepted: number }>;
  /** (B2) Latest confirmed contract operations, newest first. */
  recentOperations(limit: number): Promise<ChainOperation[]>;
}

/** (B2) One contract operation recorded on an offer. */
export interface ChainOperation {
  kind: 'create' | 'accept' | 'reclaim';
  txHash: string;
  at: Date;
}

export interface AttachmentRepository {
  insert(attachment: Attachment): Promise<void>;
  byId(id: string): Promise<Attachment | null>;
  /** (B2) `sha256` widened to accept null when the storage does not report a hash. */
  markReady(id: string, info: { sizeBytes: number; sha256: string | null }): Promise<Attachment>;
  linkToInvoice(ids: string[], invoiceId: string): Promise<void>;
  listByInvoice(invoiceId: string): Promise<Attachment[]>;
}

export interface FileStorage {
  createUploadUrl(
    path: string,
    mime: string,
    maxBytes: number,
    ttlSeconds: number,
  ): Promise<{ url: string; expiresAt: Date }>;
  createDownloadUrl(path: string, ttlSeconds: number): Promise<string>;
  /** Size and mime of the stored object, or null if it was never uploaded. */
  /** (B2) `sha256` is optional: reported only when the storage computes it. */
  head(path: string): Promise<{ sizeBytes: number; mime: string; sha256?: string } | null>;
}

export interface ChainReader {
  contractId(): string;
  /** Current state of the offer in the contract; null if it does not exist. */
  getOffer(offerIdHex: string): Promise<ChainOffer | null>;
  getTransaction(hash: string): Promise<{ status: 'SUCCESS' | 'FAILED' | 'NOT_FOUND' }>;
}

export interface ChallengeStore {
  create(address: string, ttlSeconds: number): Promise<{ nonce: string; expiresAt: Date }>;
  /** One use only. Returns the address the nonce was issued for, or null if expired or used. */
  consume(nonce: string): Promise<{ address: string } | null>;
}

export interface SignatureVerifier {
  /** Unsigned challenge transaction (sequence 0, never sent to the network) as XDR. */
  buildChallenge(address: string, nonce: string): string;
  verifyChallenge(signedXdr: string, address: string, nonce: string): Promise<boolean>;
  /** (B2) Nonce carried by a signed challenge (its data operation), or null if unreadable. */
  readNonce(signedXdr: string): string | null;
}

export interface TokenClaims {
  address: string;
  companyId: string | null;
}

export interface TokenService {
  issue(claims: TokenClaims, ttlSeconds: number): Promise<{ token: string; expiresAt: Date }>;
  verify(token: string): Promise<TokenClaims | null>;
}

/** Data the extractor proposes. The server revalidates it and the user confirms it. */
export interface ExtractedInvoice {
  source: 'xml' | 'ai';
  series?: string;
  number?: string;
  faceAmount?: string;
  issueDate?: string;
  dueDate?: string;
  buyerRuc?: string;
}

export interface InvoiceExtractor {
  extract(file: { bytes: Uint8Array; mime: string }): Promise<ExtractedInvoice>;
}

export interface RateLimiter {
  hit(
    key: string,
    windowSeconds: number,
    max: number,
  ): Promise<{ allowed: boolean; remaining: number }>;
}

export interface AuditEvent {
  kind: string;
  actorCompanyId: string | null;
  subject?: string;
  data?: Record<string, unknown>;
}

export interface AuditLog {
  record(event: AuditEvent): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  uuid(): string;
  /** 32 random bytes as 64 hex characters. */
  offerId(): string;
  /** `PR-` plus 6 characters of the unambiguous alphabet. */
  companyCode(): string;
  token(): string;
}

export type { Amount };
