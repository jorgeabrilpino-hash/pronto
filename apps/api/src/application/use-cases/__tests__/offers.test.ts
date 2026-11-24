import {
  NetworkSummarySchema,
  OfferDraftResponseSchema,
  OfferProofSchema,
  OfferSchema,
} from '@pronto/shared';
import { describe, expect, it } from 'vitest';
import type { ChainOffer } from '../../../domain/types';
import { RECONCILE_RATE } from '../offers';
import { expectCode, makeKit, wallet } from './kit';

const TX = (c: string) => c.repeat(64);

async function prepared(maxDiscountBps?: number) {
  const k = makeKit();
  const parties = await k.confirmedInvoice(maxDiscountBps);
  const draft = await k.uc.prepareOffer.execute(parties.buyer.actor, parties.invoiceId, {
    discountBps: 150,
    validityDays: 7,
  });
  return { k, ...parties, draft };
}

describe('11 PrepareOffer', () => {
  it('canonical draft: net 985, random offer id, pending, annualized cost', async () => {
    const { k, draft, supplier, invoiceId } = await prepared();
    expect(OfferDraftResponseSchema.parse(draft)).toEqual(draft);
    expect(draft.netAmount).toBe('985.0000000');
    expect(draft.discountAmount).toBe('15.0000000');
    expect(draft.chainStatus).toBe('pending');
    expect(draft.offerIdHex).toMatch(/^[0-9a-f]{64}$/);
    expect(draft.offerIdHex).not.toContain(invoiceId.replace(/-/g, ''));
    expect(draft.supplierWallet).toBe(supplier.wallet);
    expect(draft.contractId).toBe(k.a.chain.contractId());
    expect(draft.warnings).toEqual([]);
    // 27 days from 2026-11-23 to 2026-12-20: 15/985 * 365/27 = 20.59 %.
    expect(draft.annualizedBps).toBe(2059);
    expect(draft.expiresAt).toBe('2026-11-30T15:00:00.000Z');
    expect(k.a.audit.kinds()).toContain('offer.prepared');
  });

  it('two drafts never share an offer id', async () => {
    const a = await prepared();
    const b = await prepared();
    expect(a.draft.offerIdHex).not.toBe(b.draft.offerIdHex);
  });

  it('discount above the supplier maximum is only a warning', async () => {
    const { draft } = await prepared(100);
    expect(draft.warnings).toEqual(['DISCOUNT_ABOVE_SUPPLIER_MAX']);
  });

  it('only the buyer, only confirmed, only one active offer', async () => {
    const { k, draft, supplier, buyer, invoiceId } = await prepared();
    const body = { discountBps: 150, validityDays: 7 };
    await expectCode(k.uc.prepareOffer.execute(supplier.actor, invoiceId, body), 'FORBIDDEN');
    const outsider = await k.company(50);
    await expectCode(k.uc.prepareOffer.execute(outsider.actor, invoiceId, body), 'FORBIDDEN');
    await expectCode(k.uc.prepareOffer.execute(buyer.actor, invoiceId, body), 'OFFER_EXISTS');
    await expectCode(
      k.uc.prepareOffer.execute(buyer.actor, invoiceId, { discountBps: 150, validityDays: 5 }),
      'VALIDATION_ERROR',
    );
    await expectCode(
      k.uc.prepareOffer.execute(buyer.actor, k.a.ids.uuid(), body),
      'INVOICE_NOT_FOUND',
    );
    expect(draft).toBeTruthy();

    const att = await k.readyAttachment(supplier.actor);
    const sent = await k.uc.sendInvoice.execute(supplier.actor, k.invoiceInput(buyer.id, att));
    await expectCode(k.uc.prepareOffer.execute(buyer.actor, sent.id, body), 'INVALID_STATE');
  });

  it('validity must end before the due date; an overdue invoice cannot be offered', async () => {
    const k = makeKit();
    const { buyer, invoiceId } = await k.confirmedInvoice();
    // Due 2026-12-20: on 2026-12-10, 15 days do not fit, 7 days do.
    k.a.clock.set(new Date('2026-12-10T15:00:00Z'));
    await expectCode(
      k.uc.prepareOffer.execute(buyer.actor, invoiceId, { discountBps: 100, validityDays: 15 }),
      'VALIDATION_ERROR',
    );
    k.a.clock.set(new Date('2026-12-21T15:00:00Z'));
    await expectCode(
      k.uc.prepareOffer.execute(buyer.actor, invoiceId, { discountBps: 100, validityDays: 3 }),
      'INVOICE_OVERDUE',
    );
  });

  it('a discount that rounds to zero is rejected', async () => {
    const k = makeKit();
    const supplier = await k.company(1);
    const buyer = await k.company(2);
    const att = await k.readyAttachment(supplier.actor);
    const inv = await k.uc.sendInvoice.execute(
      supplier.actor,
      k.invoiceInput(buyer.id, att, { faceAmount: '0.0000001' }),
    );
    await k.uc.confirmInvoice.execute(buyer.actor, inv.id);
    await expectCode(
      k.uc.prepareOffer.execute(buyer.actor, inv.id, { discountBps: 100, validityDays: 3 }),
      'VALIDATION_ERROR',
    );
  });
});

describe('12 ReconcileOffer', () => {
  it('pending -> open -> accepted, storing only confirmed tx hashes', async () => {
    const { k, draft, supplier, buyer, invoiceId } = await prepared();
    const id = draft.offerIdHex;
    k.a.chain.setOffer(id, await k.chainMatching(id, 'open'));
    k.a.chain.setTransaction(TX('a'), 'SUCCESS');
    const open = await k.uc.reconcileOffer.execute(buyer.actor, id, { txHash: TX('a') });
    expect(OfferSchema.parse(open)).toEqual(open);
    expect(open.chainStatus).toBe('open');
    expect(open.txCreate).toBe(TX('a'));
    expect((await k.uc.getInvoice.execute(supplier.actor, invoiceId)).displayStatus).toBe(
      'offer_open',
    );

    k.a.clock.advanceSeconds(20);
    k.a.chain.setOffer(id, await k.chainMatching(id, 'accepted'));
    // A hash the chain does not know is ignored as evidence.
    const accepted = await k.uc.reconcileOffer.execute(supplier.actor, id, { txHash: TX('b') });
    expect(accepted.chainStatus).toBe('accepted');
    expect(accepted.txAccept).toBeNull();
    expect((await k.uc.getInvoice.execute(buyer.actor, invoiceId)).displayStatus).toBe('collected');
    expect(k.a.audit.kinds().filter((x) => x === 'offer.reconciled')).toHaveLength(2);

    // Idempotent: a terminal offer is never re-read nor changed.
    const calls = k.a.chain.getOfferCalls;
    k.a.clock.advanceSeconds(60);
    expect(await k.uc.reconcileOffer.execute(buyer.actor, id)).toEqual(accepted);
    expect(k.a.chain.getOfferCalls).toBe(calls);
  });

  it('open -> expired display -> reclaimed brings the invoice back to confirmed', async () => {
    const { k, draft, buyer, invoiceId } = await prepared();
    const id = draft.offerIdHex;
    k.a.chain.setOffer(id, await k.chainMatching(id, 'open'));
    await k.uc.reconcileOffer.execute(buyer.actor, id);
    k.a.clock.set(new Date(draft.expiresAt));
    expect((await k.uc.getInvoice.execute(buyer.actor, invoiceId)).displayStatus).toBe(
      'offer_expired',
    );
    k.a.chain.setOffer(id, await k.chainMatching(id, 'reclaimed'));
    k.a.chain.setTransaction(TX('c'), 'SUCCESS');
    const r = await k.uc.reconcileOffer.execute(buyer.actor, id, { txHash: TX('c') });
    expect(r.chainStatus).toBe('reclaimed');
    expect(r.txReclaim).toBe(TX('c'));
    expect((await k.uc.getInvoice.execute(buyer.actor, invoiceId)).displayStatus).toBe('confirmed');
    // A new offer can be prepared after the reclaim (before the due date).
    k.a.clock.set(new Date('2026-12-01T15:00:00Z'));
    const again = await k.uc.prepareOffer.execute(buyer.actor, invoiceId, {
      discountBps: 100,
      validityDays: 3,
    });
    expect(again.offerIdHex).not.toBe(id);
  });

  it('each mismatch marks the offer failed, audits and throws CHAIN_MISMATCH', async () => {
    const cases: Array<[string, (c: ChainOffer) => ChainOffer]> = [
      ['buyer', (c) => ({ ...c, buyer: wallet(700) })],
      ['supplier', (c) => ({ ...c, supplier: wallet(701) })],
      ['amount', (c) => ({ ...c, amount: c.amount + 1n })],
      ['net', (c) => ({ ...c, net: c.net - 1n })],
      ['expiresAt', (c) => ({ ...c, expiresAt: new Date(c.expiresAt.getTime() + 1000) })],
    ];
    for (const [field, mutate] of cases) {
      const { k, draft, buyer } = await prepared();
      const id = draft.offerIdHex;
      const good = await k.chainMatching(id, 'open');
      k.a.chain.setOffer(id, mutate(good));
      const err = await expectCode(k.uc.reconcileOffer.execute(buyer.actor, id), 'CHAIN_MISMATCH');
      expect(err.details).toEqual({ fields: [field] });
      expect((await k.a.offers.byOfferId(id))?.chainStatus).toBe('failed');
      expect(k.a.audit.kinds()).toContain('offer.chain_mismatch');
      // Idempotent afterwards: stays failed, no error, no chain read.
      k.a.clock.advanceSeconds(30);
      expect((await k.uc.reconcileOffer.execute(buyer.actor, id)).chainStatus).toBe('failed');
    }
  });

  it('a different contract id is a mismatch, before reading the chain', async () => {
    const { k, draft, buyer } = await prepared();
    k.a.chain.setContractId('COTHERCONTRACT');
    await expectCode(k.uc.reconcileOffer.execute(buyer.actor, draft.offerIdHex), 'CHAIN_MISMATCH');
    expect(k.a.chain.getOfferCalls).toBe(0);
  });

  it('an open offer that disappears from the chain is a mismatch', async () => {
    const { k, draft, buyer } = await prepared();
    const id = draft.offerIdHex;
    k.a.chain.setOffer(id, await k.chainMatching(id, 'open'));
    await k.uc.reconcileOffer.execute(buyer.actor, id);
    k.a.chain.setOffer(id, null);
    k.a.clock.advanceSeconds(20);
    await expectCode(k.uc.reconcileOffer.execute(buyer.actor, id), 'CHAIN_MISMATCH');
  });

  it('pending not on chain stays pending before 10 minutes and fails after', async () => {
    const { k, draft, buyer } = await prepared();
    const id = draft.offerIdHex;
    k.a.clock.advanceSeconds(599);
    const still = await k.uc.reconcileOffer.execute(buyer.actor, id);
    expect(still.chainStatus).toBe('pending');
    k.a.clock.advanceSeconds(16);
    const failed = await k.uc.reconcileOffer.execute(buyer.actor, id);
    expect(failed.chainStatus).toBe('failed');
    expect(k.a.audit.kinds()).toContain('offer.pending_timeout');
    k.a.clock.advanceSeconds(60);
    expect(await k.uc.reconcileOffer.execute(buyer.actor, id)).toEqual(failed);
  });

  it('reads the chain at most once per 15 seconds per offer', async () => {
    const { k, draft, buyer } = await prepared();
    const id = draft.offerIdHex;
    await k.uc.reconcileOffer.execute(buyer.actor, id);
    await k.uc.reconcileOffer.execute(buyer.actor, id);
    k.a.clock.advanceSeconds(14);
    await k.uc.reconcileOffer.execute(buyer.actor, id);
    expect(k.a.chain.getOfferCalls).toBe(1);
    k.a.clock.advanceSeconds(1);
    await k.uc.reconcileOffer.execute(buyer.actor, id);
    expect(k.a.chain.getOfferCalls).toBe(2);
  });

  it('chain unavailable is CHAIN_UNAVAILABLE and changes nothing', async () => {
    const { k, draft, buyer } = await prepared();
    k.a.chain.unavailable = true;
    await expectCode(
      k.uc.reconcileOffer.execute(buyer.actor, draft.offerIdHex),
      'CHAIN_UNAVAILABLE',
    );
    const stored = await k.a.offers.byOfferId(draft.offerIdHex);
    expect(stored?.chainStatus).toBe('pending');
    expect(stored?.lastCheckedAt).toBeNull();
  });

  it('a failing getTransaction does not block the state update', async () => {
    const { k, draft, buyer } = await prepared();
    const id = draft.offerIdHex;
    const chain = k.a.chain;
    chain.setOffer(id, await k.chainMatching(id, 'open'));
    chain.getTransaction = async () => {
      throw new Error('down');
    };
    const r = await k.uc.reconcileOffer.execute(buyer.actor, id, { txHash: TX('d') });
    expect(r.chainStatus).toBe('open');
    expect(r.txCreate).toBeNull();
  });

  it('authorization, input and rate limit', async () => {
    const { k, draft, supplier, buyer } = await prepared();
    const outsider = await k.company(60);
    await expectCode(k.uc.reconcileOffer.execute(outsider.actor, draft.offerIdHex), 'FORBIDDEN');
    await expectCode(k.uc.reconcileOffer.execute(buyer.actor, 'nope'), 'VALIDATION_ERROR');
    await expectCode(k.uc.reconcileOffer.execute(buyer.actor, 'f'.repeat(64)), 'INVOICE_NOT_FOUND');
    await expectCode(
      k.uc.reconcileOffer.execute(buyer.actor, draft.offerIdHex, { txHash: 'XYZ' }),
      'VALIDATION_ERROR',
    );
    expect((await k.uc.reconcileOffer.execute(supplier.actor, draft.offerIdHex)).offerIdHex).toBe(
      draft.offerIdHex,
    );
    for (let i = 1; i < RECONCILE_RATE.max; i++) {
      await k.uc.reconcileOffer.execute(supplier.actor, draft.offerIdHex);
    }
    await expectCode(k.uc.reconcileOffer.execute(supplier.actor, draft.offerIdHex), 'RATE_LIMITED');
  });

  it('opening a list refreshes pending and open offers, swallowing chain errors', async () => {
    const { k, draft, buyer } = await prepared();
    const id = draft.offerIdHex;
    k.a.chain.setOffer(id, await k.chainMatching(id, 'open'));
    const list = await k.uc.listInvoices.execute(buyer.actor, { role: 'buyer' });
    expect(list[0]?.displayStatus).toBe('offer_open');
    k.a.chain.unavailable = true;
    k.a.clock.advanceSeconds(20);
    const again = await k.uc.listInvoices.execute(buyer.actor, {
      role: 'buyer',
      status: 'offer_open',
    });
    expect(again).toHaveLength(1);
    // Mismatches found while listing are recorded too.
    k.a.chain.unavailable = false;
    k.a.chain.setOffer(id, { ...(await k.chainMatching(id, 'open')), net: 1n });
    k.a.clock.advanceSeconds(20);
    const after = await k.uc.listInvoices.execute(buyer.actor, { role: 'buyer' });
    expect(after[0]?.offer?.chainStatus).toBe('failed');
  });

  it('refreshQuietly ignores unknown offers', async () => {
    const { k, buyer } = await prepared();
    await expect(
      k.uc.reconcileOffer.refreshQuietly('e'.repeat(64), buyer.actor),
    ).resolves.toBeUndefined();
  });

  it('refreshQuietly rethrows unexpected errors', async () => {
    const { k, draft, buyer } = await prepared();
    k.a.offers.byOfferId = async () => {
      throw new Error('boom');
    };
    await expect(k.uc.reconcileOffer.refreshQuietly(draft.offerIdHex, buyer.actor)).rejects.toThrow(
      'boom',
    );
  });
});

describe('13 GetOfferProof and 18 GetNetworkSummary', () => {
  it('proof for both parties only', async () => {
    const { k, draft, supplier, buyer } = await prepared();
    const proof = await k.uc.getOfferProof.execute(supplier.actor, draft.offerIdHex);
    expect(OfferProofSchema.parse(proof)).toEqual(proof);
    expect(proof.network).toBe('testnet');
    expect(proof.buyerWallet).toBe(buyer.wallet);
    expect(proof.faceAmount).toBe('1000.0000000');
    await k.uc.getOfferProof.execute(buyer.actor, draft.offerIdHex);
    const outsider = await k.company(70);
    await expectCode(k.uc.getOfferProof.execute(outsider.actor, draft.offerIdHex), 'FORBIDDEN');
  });

  it('network summary counts offers seen on chain and lists the latest operations', async () => {
    const { k, draft, supplier, buyer } = await prepared();
    const empty = await k.uc.getNetworkSummary.execute();
    expect(empty).toEqual({
      network: 'testnet',
      contractId: k.a.chain.contractId(),
      offersCreated: 0,
      offersAccepted: 0,
      lastOperations: [],
    });
    const id = draft.offerIdHex;
    k.a.chain.setOffer(id, await k.chainMatching(id, 'open'));
    k.a.chain.setTransaction(TX('1'), 'SUCCESS');
    await k.uc.reconcileOffer.execute(buyer.actor, id, { txHash: TX('1') });
    k.a.clock.advanceSeconds(30);
    k.a.chain.setOffer(id, await k.chainMatching(id, 'accepted'));
    k.a.chain.setTransaction(TX('2'), 'SUCCESS');
    await k.uc.reconcileOffer.execute(supplier.actor, id, { txHash: TX('2') });
    const s = await k.uc.getNetworkSummary.execute();
    expect(NetworkSummarySchema.parse(s)).toEqual(s);
    expect(s.offersCreated).toBe(1);
    expect(s.offersAccepted).toBe(1);
    expect(s.lastOperations.map((o) => o.kind)).toEqual(['accept', 'create']);
  });
});
