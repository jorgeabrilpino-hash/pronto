import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { ADDR, loginAs, logout } from '@/test/helpers';
import { applyChainOperation } from './db';
import { resetMockApi, server } from './server';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => resetMockApi());
afterEach(() => {
  logout();
  server.resetHandlers();
});
afterAll(() => server.close());

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e.code;
    throw e;
  }
  return 'NO_ERROR';
}

describe('mock API: auth and companies', () => {
  it('rejects requests without a token', async () => {
    expect(await codeOf(api.me())).toBe('UNAUTHENTICATED');
  });

  it('logs in a registered wallet and reports no company for a new one', async () => {
    expect((await loginAs(ADDR.supplier)).company?.code).toBe('PR-7K4Q2M');
    expect((await loginAs(ADDR.fresh)).company).toBeNull();
  });

  it('registers a company with a valid RUC and rejects bad or repeated ones', async () => {
    await loginAs(ADDR.fresh);
    expect(
      await codeOf(
        api.registerCompany({
          ruc: '20601234560',
          legalName: 'Nueva SAC',
          sector: 'Servicios',
          profile: 'both',
        }),
      ),
    ).toBe('RUC_INVALID');
    expect(
      await codeOf(
        api.registerCompany({
          ruc: '20601234565',
          legalName: 'Nueva SAC',
          sector: 'Servicios',
          profile: 'both',
        }),
      ),
    ).toBe('RUC_TAKEN');
    const c = await api.registerCompany({
      ruc: '20100070970',
      legalName: 'Nueva SAC',
      sector: 'Servicios',
      profile: 'both',
    });
    expect(c.code).toMatch(/^PR-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    expect(
      await codeOf(
        api.registerCompany({
          ruc: '20100070970',
          legalName: 'Otra',
          sector: 'Servicios',
          profile: 'both',
        }),
      ),
    ).toBe('WALLET_TAKEN');
  });

  it('finds companies by exact code or RUC only', async () => {
    await loginAs(ADDR.supplier);
    expect((await api.lookup({ code: 'PR-4N8WTD' })).legalName).toContain('Yanahuara');
    expect(await codeOf(api.lookup({ code: 'PR-ZZZZZZ' }))).toBe('COMPANY_NOT_FOUND');
  });
});

describe('mock API: invoices', () => {
  it('lists by role and hides rejected invoices from the buyer', async () => {
    await loginAs(ADDR.supplier);
    const mine = await api.invoices('supplier');
    expect(mine.map((i) => i.displayStatus)).toEqual(
      expect.arrayContaining([
        'confirmed',
        'sent',
        'offer_open',
        'collected',
        'offer_expired',
        'rejected',
      ]),
    );
    await loginAs(ADDR.buyer);
    const theirs = await api.invoices('buyer');
    expect(theirs.some((i) => i.status === 'rejected')).toBe(false);
  });

  it('enforces self invoice, duplicates and overdue dates', async () => {
    await loginAs(ADDR.supplier);
    const me = (await api.me()).id;
    const base = {
      series: 'F001',
      number: '900',
      faceAmount: '500',
      currency: 'USDC' as const,
      issueDate: '2026-11-10',
      dueDate: '2026-12-10',
      longerTermAgreed: false,
      attachmentIds: [] as string[],
    };
    const up = await api.uploadUrl({ kind: 'pdf', mime: 'application/pdf', sizeBytes: 1000 });
    await api.completeUpload(up.attachmentId);
    const body = { ...base, buyerCompanyId: me, attachmentIds: [up.attachmentId] };
    expect(await codeOf(api.sendInvoice(body))).toBe('SELF_INVOICE');
    const buyer = await api.lookup({ code: 'PR-4N8WTD' });
    expect(
      await codeOf(api.sendInvoice({ ...body, buyerCompanyId: buyer.id, number: '123' })),
    ).toBe('INVOICE_DUPLICATE');
    expect(
      await codeOf(
        api.sendInvoice({
          ...body,
          buyerCompanyId: buyer.id,
          dueDate: '2026-11-12',
          issueDate: '2026-11-01',
        }),
      ),
    ).toBe('INVOICE_OVERDUE');
  });
});

describe('mock API: offer lifecycle', () => {
  it('draft -> create -> reconcile -> accept -> reconcile marks the invoice as collected', async () => {
    await loginAs(ADDR.buyer);
    const target = (await api.invoices('buyer')).find((i) => i.number === '123');
    if (!target) throw new Error('seed missing');
    const draft = await api.draftOffer(target.id, { discountBps: 150, validityDays: 7 });
    expect(draft.netAmount).toBe('985');
    expect(draft.chainStatus).toBe('pending');
    expect(draft.warnings).toEqual([]);

    applyChainOperation('create', draft.offerIdHex);
    expect((await api.reconcileOffer(draft.offerIdHex)).chainStatus).toBe('open');
    expect((await api.invoice(target.id)).displayStatus).toBe('offer_open');
    expect(await codeOf(api.draftOffer(target.id, { discountBps: 100, validityDays: 3 }))).toBe(
      'OFFER_EXISTS',
    );

    await loginAs(ADDR.supplier);
    applyChainOperation('accept', draft.offerIdHex);
    expect((await api.reconcileOffer(draft.offerIdHex)).chainStatus).toBe('accepted');
    expect((await api.invoice(target.id)).displayStatus).toBe('collected');
    expect((await api.offerProof(draft.offerIdHex)).network).toBe('testnet');
  });

  it('gates actions by company profile', async () => {
    await loginAs(ADDR.buyer);
    const target = (await api.invoices('buyer')).find((i) => i.number === '123');
    if (!target) throw new Error('seed missing');
    await api.updateSettings({ profile: 'supplier' });
    const offer = { discountBps: 150, validityDays: 7 as const };
    expect(await codeOf(api.draftOffer(target.id, offer))).toBe('FORBIDDEN');
    await api.updateSettings({ profile: 'both' });
    expect((await api.draftOffer(target.id, offer)).createdAt).toBeTruthy();
  });

  it('warns without blocking when the discount is above the supplier maximum', async () => {
    await loginAs(ADDR.buyer);
    const target = (await api.invoices('buyer')).find((i) => i.number === '123');
    if (!target) throw new Error('seed missing');
    const draft = await api.draftOffer(target.id, { discountBps: 250, validityDays: 3 });
    expect(draft.warnings).toEqual(['DISCOUNT_ABOVE_SUPPLIER_MAX']);
  });

  it('reclaim returns the invoice to confirmed', async () => {
    await loginAs(ADDR.buyer);
    const expired = (await api.invoices('buyer')).find((i) => i.displayStatus === 'offer_expired');
    if (!expired?.offer) throw new Error('seed missing');
    applyChainOperation('reclaim', expired.offer.offerIdHex);
    await api.reconcileOffer(expired.offer.offerIdHex);
    expect((await api.invoice(expired.id)).displayStatus).toBe('confirmed');
  });
});
