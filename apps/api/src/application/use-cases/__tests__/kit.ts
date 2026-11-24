import { DomainError } from '@pronto/shared';
import { expect } from 'vitest';
import { createMemoryAdapters, type MemoryAdapters } from '../../../adapters/memory';
import type { ChainOffer } from '../../../domain/types';
import { parseMoney, rucCheckDigit } from '../../../domain/values';
import { type Actor, createUseCases, type UseCases } from '../index';

/** 10:00 in Lima on Monday 2026-11-23. */
export const START = new Date('2026-11-23T15:00:00Z');

export function wallet(n: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  return `G${'A'.repeat(53)}${alphabet.charAt(Math.floor(n / 32) % 32)}${alphabet.charAt(n % 32)}`;
}

export function ruc(n: number): string {
  const first10 = `20${String(n).padStart(8, '0')}`;
  return `${first10}${rucCheckDigit(first10)}`;
}

export async function expectCode(p: Promise<unknown>, code: string): Promise<DomainError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    expect((e as DomainError).code).toBe(code);
    return e as DomainError;
  }
  throw new Error(`Expected ${code} but the call succeeded`);
}

export interface Kit {
  a: MemoryAdapters;
  uc: UseCases;
  /** Registers a company for a fresh wallet; returns its actor (token issued before registration). */
  company(n: number, name?: string): Promise<{ actor: Actor; id: string; wallet: string }>;
  readyAttachment(actor: Actor, kind?: 'pdf' | 'image' | 'xml'): Promise<string>;
  invoiceInput(buyerId: string, attachmentId: string, extra?: Record<string, unknown>): object;
  /** Supplier and buyer with a confirmed invoice for 1000. */
  confirmedInvoice(maxDiscountBps?: number): Promise<{
    supplier: { actor: Actor; id: string; wallet: string };
    buyer: { actor: Actor; id: string; wallet: string };
    invoiceId: string;
  }>;
  /** Contract state that matches a prepared offer. */
  chainMatching(offerIdHex: string, status?: ChainOffer['status']): Promise<ChainOffer>;
}

export function makeKit(): Kit {
  const a = createMemoryAdapters(START);
  const uc = createUseCases(a);
  let seq = 0;

  const kit: Kit = {
    a,
    uc,
    async company(n, name = `Empresa ${n} SAC`) {
      const actor: Actor = { address: wallet(n), companyId: null };
      const c = await uc.registerCompany.execute(actor, {
        ruc: ruc(n),
        legalName: name,
        sector: 'Imprenta',
      });
      return { actor, id: c.id, wallet: c.wallet };
    },
    async readyAttachment(actor, kind = 'pdf') {
      const mime = kind === 'pdf' ? 'application/pdf' : kind === 'image' ? 'image/png' : 'text/xml';
      const { attachmentId } = await uc.requestUploadUrl.execute(actor, {
        kind,
        mime,
        sizeBytes: 1000,
      });
      const att = await a.attachments.byId(attachmentId);
      if (att === null) throw new Error('attachment missing');
      a.storage.put(att.storagePath, { sizeBytes: 1000, mime, sha256: 'f'.repeat(64) });
      await uc.completeUpload.execute(actor, attachmentId);
      return attachmentId;
    },
    invoiceInput(buyerId, attachmentId, extra = {}) {
      seq++;
      return {
        buyerCompanyId: buyerId,
        series: 'F001',
        number: String(seq),
        faceAmount: '1000',
        currency: 'USDC',
        issueDate: '2026-11-20',
        dueDate: '2026-12-20',
        attachmentIds: [attachmentId],
        ...extra,
      };
    },
    async confirmedInvoice(maxDiscountBps) {
      const supplier = await kit.company(900 + seq * 2);
      const buyer = await kit.company(901 + seq * 2);
      const att = await kit.readyAttachment(supplier.actor);
      const extra = maxDiscountBps === undefined ? {} : { maxDiscountBps };
      const inv = await uc.sendInvoice.execute(
        supplier.actor,
        kit.invoiceInput(buyer.id, att, extra),
      );
      await uc.confirmInvoice.execute(buyer.actor, inv.id);
      return { supplier, buyer, invoiceId: inv.id };
    },
    async chainMatching(offerIdHex, status = 'open') {
      const offer = await a.offers.byOfferId(offerIdHex);
      if (offer === null) throw new Error('offer missing');
      const invoice = await a.invoices.byId(offer.invoiceId);
      if (invoice === null) throw new Error('invoice missing');
      const supplier = await a.companies.byId(invoice.supplierId);
      const buyer = await a.companies.byId(invoice.buyerId);
      if (supplier === null || buyer === null) throw new Error('company missing');
      return {
        buyer: buyer.wallet,
        supplier: supplier.wallet,
        amount: parseMoney('1000'),
        net: offer.netAmount,
        expiresAt: offer.expiresAt,
        status,
      };
    },
  };
  return kit;
}
