import { InvoiceSchema } from '@pronto/shared';
import { describe, expect, it } from 'vitest';
import { expectCode, makeKit } from './kit';

async function setup() {
  const k = makeKit();
  const supplier = await k.company(1);
  const buyer = await k.company(2);
  const outsider = await k.company(3);
  return { k, supplier, buyer, outsider };
}

describe('07 SendInvoice', () => {
  it('happy path: a sent invoice visible to the buyer, with its documents', async () => {
    const { k, supplier, buyer } = await setup();
    const pdf = await k.readyAttachment(supplier.actor);
    const xml = await k.readyAttachment(supplier.actor, 'xml');
    const inv = await k.uc.sendInvoice.execute(
      supplier.actor,
      k.invoiceInput(buyer.id, pdf, {
        attachmentIds: [pdf, xml],
        series: 'F001',
        maxDiscountBps: 150,
      }),
    );
    expect(InvoiceSchema.parse(inv)).toEqual(inv);
    expect(inv.status).toBe('sent');
    expect(inv.displayStatus).toBe('sent');
    expect(inv.series).toBe('F001');
    expect(inv.faceAmount).toBe('1000.0000000');
    expect(inv.maxDiscountBps).toBe(150);
    expect(inv.attachments.map((a) => a.id).sort()).toEqual([pdf, xml].sort());
    expect(inv.offer).toBeNull();
    expect((await k.a.invoices.byId(inv.id))?.version).toBe(1);
    expect(k.a.audit.kinds()).toContain('invoice.sent');
    const list = await k.uc.listInvoices.execute(buyer.actor, { role: 'buyer' });
    expect(list.map((i) => i.id)).toEqual([inv.id]);
  });

  it('COMPANY_NOT_FOUND, SELF_INVOICE, INVOICE_DUPLICATE, INVOICE_OVERDUE, VALIDATION_ERROR', async () => {
    const { k, supplier, buyer } = await setup();
    const att = await k.readyAttachment(supplier.actor);
    const send = (extra: Record<string, unknown>, buyerId = buyer.id) =>
      k.uc.sendInvoice.execute(supplier.actor, k.invoiceInput(buyerId, att, extra));
    await expectCode(send({}, k.a.ids.uuid()), 'COMPANY_NOT_FOUND');
    await expectCode(send({}, supplier.id), 'SELF_INVOICE');
    await expectCode(
      send({ issueDate: '2026-10-01', dueDate: '2026-11-22', longerTermAgreed: true }),
      'INVOICE_OVERDUE',
    );
    await expectCode(send({ issueDate: '2026-11-24', dueDate: '2026-12-01' }), 'VALIDATION_ERROR');
    await expectCode(send({ dueDate: '2026-12-21' }), 'VALIDATION_ERROR');
    await expectCode(send({ faceAmount: 1000 }), 'VALIDATION_ERROR');
    await send({ number: '77' });
    const att2 = await k.readyAttachment(supplier.actor);
    await expectCode(
      k.uc.sendInvoice.execute(supplier.actor, k.invoiceInput(buyer.id, att2, { number: '77' })),
      'INVOICE_DUPLICATE',
    );
    // A longer term is allowed when agreed in writing.
    const att3 = await k.readyAttachment(supplier.actor);
    const long = await k.uc.sendInvoice.execute(
      supplier.actor,
      k.invoiceInput(buyer.id, att3, { dueDate: '2027-01-30', longerTermAgreed: true }),
    );
    expect(long.longerTermAgreed).toBe(true);
  });

  it('attachments must be ready, own, unused and one document plus an optional XML', async () => {
    const { k, supplier, buyer, outsider } = await setup();
    const send = (ids: string[]) =>
      k.uc.sendInvoice.execute(
        supplier.actor,
        k.invoiceInput(buyer.id, ids[0] ?? '', { attachmentIds: ids }),
      );
    const foreign = await k.readyAttachment(outsider.actor);
    await expectCode(send([foreign]), 'ATTACHMENT_INVALID');
    const pending = (
      await k.uc.requestUploadUrl.execute(supplier.actor, {
        kind: 'pdf',
        mime: 'application/pdf',
        sizeBytes: 10,
      })
    ).attachmentId;
    await expectCode(send([pending]), 'ATTACHMENT_INVALID');
    const a = await k.readyAttachment(supplier.actor);
    const b = await k.readyAttachment(supplier.actor, 'image');
    await expectCode(send([a, b]), 'ATTACHMENT_INVALID');
    await expectCode(send([a, a]), 'ATTACHMENT_INVALID');
    const x1 = await k.readyAttachment(supplier.actor, 'xml');
    const x2 = await k.readyAttachment(supplier.actor, 'xml');
    await expectCode(send([x1, x2]), 'ATTACHMENT_INVALID');
    await send([a]);
    await expectCode(send([a]), 'ATTACHMENT_INVALID');
  });
});

describe('08 ListInvoices and GetInvoice', () => {
  it('lists by role, filters by display status and hides rejected and cancelled from buyers', async () => {
    const { k, supplier, buyer } = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const att = await k.readyAttachment(supplier.actor);
      ids.push((await k.uc.sendInvoice.execute(supplier.actor, k.invoiceInput(buyer.id, att))).id);
    }
    const [i0, i1, i2] = ids as [string, string, string];
    await k.uc.confirmInvoice.execute(buyer.actor, i0);
    await k.uc.rejectInvoice.execute(buyer.actor, i1, { reason: 'Monto distinto' });
    await k.uc.cancelInvoice.execute(supplier.actor, i2);

    const supplierAll = await k.uc.listInvoices.execute(supplier.actor, { role: 'supplier' });
    expect(supplierAll.map((i) => i.displayStatus).sort()).toEqual(
      ['cancelled', 'confirmed', 'rejected'].sort(),
    );
    const buyerAll = await k.uc.listInvoices.execute(buyer.actor, { role: 'buyer' });
    expect(buyerAll.map((i) => i.id)).toEqual([i0]);
    const rejected = await k.uc.listInvoices.execute(supplier.actor, {
      role: 'supplier',
      status: 'rejected',
    });
    expect(rejected.map((i) => i.rejectionReason)).toEqual(['Monto distinto']);
    expect(await k.uc.listInvoices.execute(supplier.actor, { role: 'buyer' })).toEqual([]);
    await expectCode(
      k.uc.listInvoices.execute(supplier.actor, { role: 'boss' }),
      'VALIDATION_ERROR',
    );
  });

  it('only the supplier and the buyer can read an invoice', async () => {
    const { k, supplier, buyer, outsider } = await setup();
    const att = await k.readyAttachment(supplier.actor);
    const inv = await k.uc.sendInvoice.execute(supplier.actor, k.invoiceInput(buyer.id, att));
    expect((await k.uc.getInvoice.execute(supplier.actor, inv.id)).id).toBe(inv.id);
    expect((await k.uc.getInvoice.execute(buyer.actor, inv.id)).id).toBe(inv.id);
    await expectCode(k.uc.getInvoice.execute(outsider.actor, inv.id), 'FORBIDDEN');
    await expectCode(k.uc.getInvoice.execute(buyer.actor, k.a.ids.uuid()), 'INVOICE_NOT_FOUND');
  });
});

describe('09 ConfirmInvoice and RejectInvoice', () => {
  it('only the buyer confirms or rejects, only from sent', async () => {
    const { k, supplier, buyer, outsider } = await setup();
    const att = await k.readyAttachment(supplier.actor);
    const inv = await k.uc.sendInvoice.execute(supplier.actor, k.invoiceInput(buyer.id, att));
    await expectCode(k.uc.confirmInvoice.execute(supplier.actor, inv.id), 'FORBIDDEN');
    await expectCode(k.uc.confirmInvoice.execute(outsider.actor, inv.id), 'FORBIDDEN');
    await expectCode(
      k.uc.rejectInvoice.execute(supplier.actor, inv.id, { reason: 'no' + 'pe' }),
      'FORBIDDEN',
    );
    await expectCode(
      k.uc.rejectInvoice.execute(buyer.actor, inv.id, { reason: 'x' }),
      'VALIDATION_ERROR',
    );
    const done = await k.uc.confirmInvoice.execute(buyer.actor, inv.id);
    expect(done.status).toBe('confirmed');
    expect((await k.a.invoices.byId(inv.id))?.version).toBe(2);
    await expectCode(k.uc.confirmInvoice.execute(buyer.actor, inv.id), 'INVALID_STATE');
    await expectCode(
      k.uc.rejectInvoice.execute(buyer.actor, inv.id, { reason: 'Tarde' }),
      'INVALID_STATE',
    );
    expect(k.a.audit.kinds()).toContain('invoice.confirmed');
  });

  it('two concurrent confirmations: the second fails with INVALID_STATE', async () => {
    const { k, supplier, buyer } = await setup();
    const att = await k.readyAttachment(supplier.actor);
    const inv = await k.uc.sendInvoice.execute(supplier.actor, k.invoiceInput(buyer.id, att));
    const results = await Promise.allSettled([
      k.uc.confirmInvoice.execute(buyer.actor, inv.id),
      k.uc.confirmInvoice.execute(buyer.actor, inv.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected');
    expect(failed?.status === 'rejected' && failed.reason.code).toBe('INVALID_STATE');
    expect((await k.a.invoices.byId(inv.id))?.version).toBe(2);
  });

  it('concurrent confirm and reject: only one transition applies', async () => {
    const { k, supplier, buyer } = await setup();
    const att = await k.readyAttachment(supplier.actor);
    const inv = await k.uc.sendInvoice.execute(supplier.actor, k.invoiceInput(buyer.id, att));
    const results = await Promise.allSettled([
      k.uc.confirmInvoice.execute(buyer.actor, inv.id),
      k.uc.rejectInvoice.execute(buyer.actor, inv.id, { reason: 'No coincide' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
  });
});

describe('10 EditAndResend and CancelInvoice', () => {
  it('the supplier corrects a rejected invoice and resends it', async () => {
    const { k, supplier, buyer } = await setup();
    const att = await k.readyAttachment(supplier.actor);
    const inv = await k.uc.sendInvoice.execute(supplier.actor, k.invoiceInput(buyer.id, att));
    await expectCode(k.uc.editAndResend.execute(supplier.actor, inv.id, {}), 'INVALID_STATE');
    await k.uc.rejectInvoice.execute(buyer.actor, inv.id, { reason: 'Monto distinto' });
    await expectCode(
      k.uc.editAndResend.execute(buyer.actor, inv.id, { faceAmount: '900' }),
      'FORBIDDEN',
    );
    await expectCode(
      k.uc.editAndResend.execute(supplier.actor, inv.id, { dueDate: '2026-11-01' }),
      'VALIDATION_ERROR',
    );
    await expectCode(
      k.uc.editAndResend.execute(supplier.actor, inv.id, { faceAmount: '-1' }),
      'VALIDATION_ERROR',
    );
    const resent = await k.uc.editAndResend.execute(supplier.actor, inv.id, {
      faceAmount: '900.5',
      number: '999',
      maxDiscountBps: null,
    });
    expect(resent.status).toBe('sent');
    expect(resent.faceAmount).toBe('900.5000000');
    expect(resent.number).toBe('999');
    expect(resent.rejectionReason).toBeNull();
    expect(k.a.audit.kinds()).toContain('invoice.resent');
  });

  it('resending with a reference already used is INVOICE_DUPLICATE', async () => {
    const { k, supplier, buyer } = await setup();
    const a1 = await k.readyAttachment(supplier.actor);
    const a2 = await k.readyAttachment(supplier.actor);
    const first = await k.uc.sendInvoice.execute(supplier.actor, k.invoiceInput(buyer.id, a1));
    const second = await k.uc.sendInvoice.execute(supplier.actor, k.invoiceInput(buyer.id, a2));
    await k.uc.rejectInvoice.execute(buyer.actor, second.id, { reason: 'Serie mal' });
    await expectCode(
      k.uc.editAndResend.execute(supplier.actor, second.id, { number: first.number }),
      'INVOICE_DUPLICATE',
    );
  });

  it('only the supplier cancels, never with an active offer', async () => {
    const k = makeKit();
    const { supplier, buyer, invoiceId } = await k.confirmedInvoice();
    await expectCode(k.uc.cancelInvoice.execute(buyer.actor, invoiceId), 'FORBIDDEN');
    const draft = await k.uc.prepareOffer.execute(buyer.actor, invoiceId, {
      discountBps: 150,
      validityDays: 7,
    });
    await expectCode(k.uc.cancelInvoice.execute(supplier.actor, invoiceId), 'OFFER_EXISTS');
    // Once the pending draft fails, cancelling is allowed again.
    k.a.clock.advanceSeconds(601);
    await k.uc.reconcileOffer.execute(buyer.actor, draft.offerIdHex);
    const cancelled = await k.uc.cancelInvoice.execute(supplier.actor, invoiceId);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.displayStatus).toBe('cancelled');
    await expectCode(k.uc.cancelInvoice.execute(supplier.actor, invoiceId), 'INVALID_STATE');
  });
});
