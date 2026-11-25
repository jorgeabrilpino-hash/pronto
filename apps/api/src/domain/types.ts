import type { AttachmentKind, ChainStatus, InvoiceStatus, Profile } from '@pronto/shared';

/**
 * B0 creates only the type shapes the ports need. From B2 on, this folder belongs to the
 * domain session (value objects, finance functions, state machine).
 */

/** Money with 7 decimals as an integer: 1.0000000 = 10_000_000n. Never `number`. */
export type Amount = bigint;

export interface Company {
  id: string;
  ruc: string;
  legalName: string;
  sector: string;
  wallet: string;
  code: string;
  fichaPublica: boolean;
  /** Chosen at registration; gates which actions the company may take. */
  profile: Profile;
  createdAt: Date;
}

export interface Invoice {
  id: string;
  supplierId: string;
  buyerId: string;
  series: string;
  number: string;
  faceAmount: Amount;
  currency: 'USDC';
  /** ISO date, YYYY-MM-DD */
  issueDate: string;
  /** ISO date, YYYY-MM-DD */
  dueDate: string;
  longerTermAgreed: boolean;
  maxDiscountBps: number | null;
  status: InvoiceStatus;
  rejectionReason: string | null;
  /** Optimistic lock: every change must present the version it read. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Offer {
  id: string;
  invoiceId: string;
  /** 32 random bytes as 64 hex characters. Never derived from the invoice. */
  offerIdHex: string;
  netAmount: Amount;
  discountAmount: Amount;
  discountBps: number;
  expiresAt: Date;
  chainStatus: ChainStatus;
  txCreate: string | null;
  txAccept: string | null;
  txReclaim: string | null;
  contractId: string;
  lastCheckedAt: Date | null;
  /** When the draft was stored (B2): drives the 10 minute pending timeout. */
  createdAt: Date;
  /** Stamped by the repository the first time a `txAccept` is recorded; never overwritten. */
  acceptedAt: Date | null;
}

export interface Attachment {
  id: string;
  invoiceId: string | null;
  ownerCompanyId: string;
  kind: AttachmentKind;
  storagePath: string;
  mime: string;
  sizeBytes: number;
  sha256: string | null;
  status: 'pending' | 'ready';
}

/** Offer state as read from the contract (source of truth). */
export interface ChainOffer {
  buyer: string;
  supplier: string;
  amount: Amount;
  net: Amount;
  expiresAt: Date;
  status: 'open' | 'accepted' | 'reclaimed';
}
