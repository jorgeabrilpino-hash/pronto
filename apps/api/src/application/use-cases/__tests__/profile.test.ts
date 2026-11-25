import { CompanySchema, OfferSchema, type Profile } from '@pronto/shared';
import { describe, expect, it } from 'vitest';
import type { ChainInvocation } from '../../ports';
import { profileAllows } from '../shared';
import { expectCode, type Kit, makeKit, ruc, wallet } from './kit';

const TX = (c: string) => c.repeat(64);

function inv(k: Kit, offerIdHex: string, fn: ChainInvocation['fn']): ChainInvocation {
  return { contractId: k.a.chain.contractId(), fn, offerIdHex };
}

async function setProfile(
  k: Kit,
  actor: { address: string; companyId: string | null },
  p: Profile,
) {
  return k.uc.updateSettings.execute(actor, { profile: p });
}

/** A `sent` invoice between two `both` companies. */
async function sentInvoice(k: Kit) {
  const supplier = await k.company(100);
  const buyer = await k.company(101);
  const att = await k.readyAttachment(supplier.actor);
  const invoice = await k.uc.sendInvoice.execute(supplier.actor, k.invoiceInput(buyer.id, att));
  return { supplier, buyer, invoiceId: invoice.id };
}

describe('company profile: registration and settings', () => {
  it.each(['supplier', 'buyer', 'both'] as const)('registers with profile %s', async (p) => {
    const k = makeKit();
    const c = await k.uc.registerCompany.execute(
      { address: wallet(1), companyId: null },
      { ruc: ruc(1), legalName: 'Empresa SAC', sector: 'Imprenta', profile: p },
    );
    expect(CompanySchema.parse(c).profile).toBe(p);
    expect((await k.a.companies.byId(c.id))?.profile).toBe(p);
    expect((await k.uc.getMe.execute({ address: wallet(1), companyId: c.id })).profile).toBe(p);
  });

  it('profile is required and must be one of the three values', async () => {
    const k = makeKit();
    const actor = { address: wallet(1), companyId: null };
    const base = { ruc: ruc(1), legalName: 'Empresa SAC', sector: 'Imprenta' };
    await expectCode(k.uc.registerCompany.execute(actor, base), 'VALIDATION_ERROR');
    await expectCode(
      k.uc.registerCompany.execute(actor, { ...base, profile: 'seller' }),
      'VALIDATION_ERROR',
    );
  });

  it('settings change the profile alone, the ficha alone, or both; empty is invalid', async () => {
    const k = makeKit();
    const me = await k.company(1, undefined, 'supplier');
    const p = await setProfile(k, me.actor, 'buyer');
    expect(p.profile).toBe('buyer');
    expect(p.fichaPublica).toBe(true);
    const f = await k.uc.updateSettings.execute(me.actor, { fichaPublica: false });
    expect(f.profile).toBe('buyer');
    expect(f.fichaPublica).toBe(false);
    const both = await k.uc.updateSettings.execute(me.actor, {
      fichaPublica: true,
      profile: 'both',
    });
    expect([both.profile, both.fichaPublica]).toEqual(['both', true]);
    await expectCode(k.uc.updateSettings.execute(me.actor, {}), 'VALIDATION_ERROR');
    await expectCode(
      k.uc.updateSettings.execute(me.actor, { profile: 'seller' }),
      'VALIDATION_ERROR',
    );
    expect((await k.uc.getMe.execute(me.actor)).profile).toBe('both');
  });

  it('profileAllows: both covers every side, a single profile only its own', () => {
    expect(profileAllows('both', 'supplier')).toBe(true);
    expect(profileAllows('both', 'buyer')).toBe(true);
    expect(profileAllows('supplier', 'supplier')).toBe(true);
    expect(profileAllows('supplier', 'buyer')).toBe(false);
    expect(profileAllows('buyer', 'buyer')).toBe(true);
    expect(profileAllows('buyer', 'supplier')).toBe(false);
  });
});

describe('company profile gates actions', () => {
  it('SendInvoice needs supplier or both', async () => {
    const k = makeKit();
    const buyer = await k.company(2, undefined, 'buyer');
    const onlyBuyer = await k.company(3, undefined, 'buyer');
    const att = await k.readyAttachment(onlyBuyer.actor);
    const e = await expectCode(
      k.uc.sendInvoice.execute(onlyBuyer.actor, k.invoiceInput(buyer.id, att)),
      'FORBIDDEN',
    );
    expect(e.details).toEqual({ profile: 'buyer', required: 'supplier' });
    for (const [n, p] of [
      [4, 'supplier'],
      [5, 'both'],
    ] as const) {
      const s = await k.company(n, undefined, p);
      const a = await k.readyAttachment(s.actor);
      const sent = await k.uc.sendInvoice.execute(s.actor, k.invoiceInput(buyer.id, a));
      expect(sent.status).toBe('sent');
    }
  });

  it('ConfirmInvoice and RejectInvoice need buyer or both', async () => {
    const k = makeKit();
    const { buyer, invoiceId } = await sentInvoice(k);
    await setProfile(k, buyer.actor, 'supplier');
    await expectCode(k.uc.confirmInvoice.execute(buyer.actor, invoiceId), 'FORBIDDEN');
    await expectCode(
      k.uc.rejectInvoice.execute(buyer.actor, invoiceId, { reason: 'No coincide' }),
      'FORBIDDEN',
    );
    expect((await k.a.invoices.byId(invoiceId))?.status).toBe('sent');
    await setProfile(k, buyer.actor, 'buyer');
    expect((await k.uc.confirmInvoice.execute(buyer.actor, invoiceId)).status).toBe('confirmed');

    const k2 = makeKit();
    const other = await sentInvoice(k2);
    await setProfile(k2, other.buyer.actor, 'buyer');
    const rejected = await k2.uc.rejectInvoice.execute(other.buyer.actor, other.invoiceId, {
      reason: 'No coincide',
    });
    expect(rejected.status).toBe('rejected');
  });

  it('CancelInvoice and EditAndResend follow the supplier rule', async () => {
    const k = makeKit();
    const { supplier, buyer, invoiceId } = await sentInvoice(k);
    await setProfile(k, supplier.actor, 'buyer');
    await expectCode(k.uc.cancelInvoice.execute(supplier.actor, invoiceId), 'FORBIDDEN');
    await k.uc.rejectInvoice.execute(buyer.actor, invoiceId, { reason: 'No coincide' });
    await expectCode(
      k.uc.editAndResend.execute(supplier.actor, invoiceId, { faceAmount: '900' }),
      'FORBIDDEN',
    );
    await setProfile(k, supplier.actor, 'supplier');
    const resent = await k.uc.editAndResend.execute(supplier.actor, invoiceId, {
      faceAmount: '900',
    });
    expect(resent.status).toBe('sent');
    expect((await k.uc.cancelInvoice.execute(supplier.actor, invoiceId)).status).toBe('cancelled');
  });

  it('PrepareOffer needs buyer or both', async () => {
    const k = makeKit();
    const { buyer, invoiceId } = await k.confirmedInvoice();
    await setProfile(k, buyer.actor, 'supplier');
    await expectCode(
      k.uc.prepareOffer.execute(buyer.actor, invoiceId, { discountBps: 150, validityDays: 7 }),
      'FORBIDDEN',
    );
    expect(await k.a.offers.byInvoice(invoiceId)).toEqual([]);
    await setProfile(k, buyer.actor, 'buyer');
    const draft = await k.uc.prepareOffer.execute(buyer.actor, invoiceId, {
      discountBps: 150,
      validityDays: 7,
    });
    expect(draft.chainStatus).toBe('pending');
  });

  it('ReconcileOffer as buyer needs buyer or both; the supplier side is not gated', async () => {
    const k = makeKit();
    const { supplier, buyer, invoiceId } = await k.confirmedInvoice();
    const draft = await k.uc.prepareOffer.execute(buyer.actor, invoiceId, {
      discountBps: 150,
      validityDays: 7,
    });
    const id = draft.offerIdHex;
    k.a.chain.setOffer(id, await k.chainMatching(id, 'open'));
    await setProfile(k, buyer.actor, 'supplier');
    await expectCode(k.uc.reconcileOffer.execute(buyer.actor, id), 'FORBIDDEN');
    expect((await k.a.offers.byOfferId(id))?.chainStatus).toBe('pending');
    // The supplier collects even when its profile changed to buyer.
    await setProfile(k, supplier.actor, 'buyer');
    expect((await k.uc.reconcileOffer.execute(supplier.actor, id)).chainStatus).toBe('open');
  });

  it('reading lists is allowed for every profile', async () => {
    const k = makeKit();
    const { supplier, buyer } = await k.confirmedInvoice();
    await setProfile(k, supplier.actor, 'buyer');
    await setProfile(k, buyer.actor, 'supplier');
    expect(await k.uc.listInvoices.execute(supplier.actor, { role: 'supplier' })).toHaveLength(1);
    expect(await k.uc.listInvoices.execute(buyer.actor, { role: 'buyer' })).toHaveLength(1);
    expect(await k.uc.listContacts.execute(buyer.actor, { role: 'buyer' })).toHaveLength(1);
    expect(await k.uc.listContacts.execute(supplier.actor, { role: 'supplier' })).toHaveLength(1);
  });
});

describe('offer dates for the activity history', () => {
  it('createdAt is the draft time; acceptedAt is set once when the accept is recorded', async () => {
    const k = makeKit();
    const { supplier, buyer, invoiceId } = await k.confirmedInvoice();
    const prepAt = k.a.clock.now().toISOString();
    const draft = await k.uc.prepareOffer.execute(buyer.actor, invoiceId, {
      discountBps: 150,
      validityDays: 7,
    });
    expect(draft.createdAt).toBe(prepAt);
    expect(draft.acceptedAt).toBeNull();
    const id = draft.offerIdHex;

    k.a.chain.setOffer(id, await k.chainMatching(id, 'open'));
    const open = await k.uc.reconcileOffer.execute(buyer.actor, id);
    expect(OfferSchema.parse(open).acceptedAt).toBeNull();

    k.a.clock.advanceSeconds(60);
    const acceptAt = k.a.clock.now().toISOString();
    k.a.chain.setOffer(id, await k.chainMatching(id, 'accepted'));
    k.a.chain.setTransaction(TX('b'), 'SUCCESS', inv(k, id, 'accept'));
    const accepted = await k.uc.reconcileOffer.execute(supplier.actor, id, { txHash: TX('b') });
    expect(accepted.txAccept).toBe(TX('b'));
    expect(accepted.acceptedAt).toBe(acceptAt);
    expect(accepted.createdAt).toBe(prepAt);

    k.a.clock.advanceSeconds(60);
    const view = await k.uc.getInvoice.execute(buyer.actor, invoiceId);
    expect(view.offer?.acceptedAt).toBe(acceptAt);
    expect((await k.uc.getOfferProof.execute(supplier.actor, id)).acceptedAt).toBe(acceptAt);
  });
});
