import { DomainError } from '@pronto/shared';
import { describe, expect, it } from 'vitest';
import type { Company, Invoice, Offer } from '../../domain/types';
import { createMemoryAdapters, FakeInvoiceExtractor, RandomIdGenerator } from './index';

const NOW = new Date('2026-11-23T15:00:00Z');

function company(id: string, n: string): Company {
  return {
    id,
    ruc: `2010007097${n}`,
    legalName: 'X',
    sector: 'Y',
    wallet: `G${n.repeat(55)}`,
    code: `PR-22222${n}`,
    fichaPublica: true,
    createdAt: NOW,
  };
}

function invoice(id: string, extra: Partial<Invoice> = {}): Invoice {
  return {
    id,
    supplierId: 's',
    buyerId: 'b',
    series: 'F001',
    // Canonical digits only (the repository mirrors the DB check).
    number: id.replace(/\D/g, '') || '9',
    faceAmount: 1n,
    currency: 'USDC',
    issueDate: '2026-11-20',
    dueDate: '2026-12-20',
    longerTermAgreed: false,
    maxDiscountBps: null,
    status: 'sent',
    rejectionReason: null,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

function offer(hex: string, invoiceId: string): Offer {
  return {
    id: hex,
    invoiceId,
    offerIdHex: hex,
    netAmount: 1n,
    discountAmount: 1n,
    discountBps: 1,
    expiresAt: NOW,
    chainStatus: 'pending',
    txCreate: null,
    txAccept: null,
    txReclaim: null,
    contractId: 'C',
    lastCheckedAt: null,
    createdAt: NOW,
  };
}

describe('memory adapters', () => {
  it('companies enforce unique RUC, wallet and code and hand out copies', async () => {
    const a = createMemoryAdapters(NOW);
    await a.companies.insert(company('1', '2'));
    const got = await a.companies.byId('1');
    if (got !== null) got.legalName = 'mutated';
    expect((await a.companies.byId('1'))?.legalName).toBe('X');
    await expect(a.companies.insert({ ...company('2', '3'), ruc: '20100070972' })).rejects.toThrow(
      DomainError,
    );
    await expect(
      a.companies.insert({ ...company('2', '3'), wallet: `G${'2'.repeat(55)}` }),
    ).rejects.toThrow(DomainError);
    await expect(a.companies.insert({ ...company('2', '3'), code: 'PR-222222' })).rejects.toThrow(
      DomainError,
    );
    await expect(a.companies.update('nope', { fichaPublica: false })).rejects.toThrow(DomainError);
    expect(await a.companies.byId('nope')).toBeNull();
  });

  it('invoices check versions, duplicates and filter by role and status', async () => {
    const a = createMemoryAdapters(NOW);
    await a.invoices.insert(invoice('1'));
    await expect(a.invoices.insert(invoice('2', { number: '1' }))).rejects.toThrow(DomainError);
    expect(await a.invoices.update('1', 2, { status: 'confirmed' })).toBeNull();
    expect(await a.invoices.update('missing', 1, {})).toBeNull();
    a.clock.advanceSeconds(5);
    const up = await a.invoices.update('1', 1, { status: 'confirmed' });
    expect(up?.version).toBe(2);
    expect(up?.updatedAt.getTime()).toBe(NOW.getTime() + 5000);
    expect(await a.invoices.listFor('b', 'buyer', 'confirmed')).toHaveLength(1);
    expect(await a.invoices.listFor('b', 'buyer', 'sent')).toHaveLength(0);
    expect(await a.invoices.listFor('s', 'buyer')).toHaveLength(0);
    expect(await a.invoices.byId('x')).toBeNull();
  });

  it('offers keep one active per invoice, unique ids, operations and stats', async () => {
    const a = createMemoryAdapters(NOW);
    await a.invoices.insert(invoice('i1'));
    await a.offers.insertPending(offer('a', 'i1'));
    await expect(a.offers.insertPending(offer('a', 'i2'))).rejects.toThrow(DomainError);
    await expect(a.offers.insertPending(offer('b', 'i1'))).rejects.toThrow(DomainError);
    await expect(a.offers.update('zz', {})).rejects.toThrow(DomainError);
    await a.offers.update('a', { chainStatus: 'open', txCreate: 't1' });
    await a.offers.update('a', { chainStatus: 'open', txCreate: 't1' });
    expect(await a.offers.recentOperations(5)).toHaveLength(1);
    expect(await a.offers.stats()).toEqual({ created: 1, accepted: 0 });
    expect((await a.offers.listFor('s')).map((o) => o.offerIdHex)).toEqual(['a']);
    expect(await a.offers.listFor('nobody')).toEqual([]);
    expect(await a.offers.byOfferId('none')).toBeNull();
  });

  it('attachments, storage and challenge store', async () => {
    const a = createMemoryAdapters(NOW);
    await expect(a.attachments.markReady('none', { sizeBytes: 1, sha256: null })).rejects.toThrow(
      DomainError,
    );
    await a.attachments.linkToInvoice(['none'], 'i');
    expect(await a.storage.head('nothing')).toBeNull();
    expect(await a.storage.createDownloadUrl('p/q', 60)).toContain('p%2Fq');
    const ch = await a.challenges.create('G', 10);
    expect(await a.challenges.consume(ch.nonce)).toEqual({ address: 'G' });
    expect(await a.challenges.consume(ch.nonce)).toBeNull();
    expect(a.signatures.readNonce('signed:G:')).toBeNull();
  });

  it('ids, chain fake and extractor', async () => {
    const ids = new RandomIdGenerator();
    expect(ids.companyCode()).toMatch(/^PR-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    expect(ids.offerId()).toMatch(/^[0-9a-f]{64}$/);
    const a = createMemoryAdapters();
    a.chain.setOffer('x', null);
    expect(await a.chain.getOffer('x')).toBeNull();
    expect(await a.chain.getTransaction('h')).toEqual({ status: 'NOT_FOUND' });
    a.chain.unavailable = true;
    await expect(a.chain.getTransaction('h')).rejects.toThrow();
    const ex = new FakeInvoiceExtractor();
    ex.setResult({ source: 'xml', series: 'F001' });
    expect(await ex.extract({ bytes: new Uint8Array(), mime: 'text/xml' })).toEqual({
      source: 'xml',
      series: 'F001',
    });
  });
});
