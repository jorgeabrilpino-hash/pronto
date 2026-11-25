import { CreateInvoiceRequestSchema, InvoiceNumberSchema } from '@pronto/shared';
import { describe, expect, it } from 'vitest';
import { createMemoryAdapters } from '../../../adapters/memory';
import type { Invoice } from '../../../domain/types';
import { canonicalInvoiceNumber, parseInvoiceRef } from '../../../domain/values';
import { expectCode, makeKit } from './kit';

describe('canonical invoice numbers', () => {
  it('the shared schema strips leading zeros and rejects all zeros', () => {
    expect(InvoiceNumberSchema.parse('0123')).toBe('123');
    expect(InvoiceNumberSchema.parse('123')).toBe('123');
    expect(InvoiceNumberSchema.parse('00000001')).toBe('1');
    for (const bad of ['0', '00000000', '', '123456789', '12a']) {
      expect(InvoiceNumberSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('the domain parser canonicalizes the same way and rejects zero', () => {
    expect(parseInvoiceRef('F001', ' 0123 ').number).toBe('123');
    expect(canonicalInvoiceNumber('007')).toBe('7');
    expect(canonicalInvoiceNumber('0')).toBeNull();
    expect(() => parseInvoiceRef('F001', '0')).toThrow();
    expect(() => parseInvoiceRef('F001', '00000000')).toThrow();
  });

  it('"0123" and "123" collide as INVOICE_DUPLICATE; stored numbers have no leading zeros', async () => {
    const k = makeKit();
    const supplier = await k.company(1);
    const buyer = await k.company(2);
    const a1 = await k.readyAttachment(supplier.actor);
    const first = await k.uc.sendInvoice.execute(
      supplier.actor,
      k.invoiceInput(buyer.id, a1, { number: '0123' }),
    );
    expect(first.number).toBe('123');
    expect((await k.a.invoices.byId(first.id))?.number).toBe('123');
    const a2 = await k.readyAttachment(supplier.actor);
    await expectCode(
      k.uc.sendInvoice.execute(supplier.actor, k.invoiceInput(buyer.id, a2, { number: '123' })),
      'INVOICE_DUPLICATE',
    );
    await expectCode(
      k.uc.sendInvoice.execute(supplier.actor, k.invoiceInput(buyer.id, a2, { number: '00123' })),
      'INVOICE_DUPLICATE',
    );
  });

  it('"0" and "00000000" are rejected when sending', async () => {
    const k = makeKit();
    const supplier = await k.company(1);
    const buyer = await k.company(2);
    const att = await k.readyAttachment(supplier.actor);
    for (const number of ['0', '00000000']) {
      await expectCode(
        k.uc.sendInvoice.execute(supplier.actor, k.invoiceInput(buyer.id, att, { number })),
        'VALIDATION_ERROR',
      );
    }
    const parsed = CreateInvoiceRequestSchema.safeParse(
      k.invoiceInput(buyer.id, att, { number: '0' }),
    );
    expect(parsed.success).toBe(false);
  });

  it('resending with a zero-padded copy of another number is INVOICE_DUPLICATE', async () => {
    const k = makeKit();
    const supplier = await k.company(1);
    const buyer = await k.company(2);
    const a1 = await k.readyAttachment(supplier.actor);
    const a2 = await k.readyAttachment(supplier.actor);
    await k.uc.sendInvoice.execute(supplier.actor, k.invoiceInput(buyer.id, a1, { number: '55' }));
    const second = await k.uc.sendInvoice.execute(
      supplier.actor,
      k.invoiceInput(buyer.id, a2, { number: '56' }),
    );
    await k.uc.rejectInvoice.execute(buyer.actor, second.id, { reason: 'Numero mal' });
    await expectCode(
      k.uc.editAndResend.execute(supplier.actor, second.id, { number: '0055' }),
      'INVOICE_DUPLICATE',
    );
    await expectCode(
      k.uc.editAndResend.execute(supplier.actor, second.id, { number: '0000' }),
      'VALIDATION_ERROR',
    );
    const fixed = await k.uc.editAndResend.execute(supplier.actor, second.id, { number: '0057' });
    expect(fixed.number).toBe('57');
  });

  it('the memory repository compares canonical numbers and stores only canonical ones', async () => {
    const a = createMemoryAdapters();
    const now = a.clock.now();
    const base: Invoice = {
      id: 'i1',
      supplierId: 's',
      buyerId: 'b',
      series: 'F001',
      number: '123',
      faceAmount: 1n,
      currency: 'USDC',
      issueDate: '2026-11-20',
      dueDate: '2026-12-20',
      longerTermAgreed: false,
      maxDiscountBps: null,
      status: 'sent',
      rejectionReason: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await a.invoices.insert(base);
    expect(await a.invoices.duplicateExists('s', 'F001', '0123')).toBe(true);
    expect(await a.invoices.duplicateExists('s', 'F001', '124')).toBe(false);
    await expect(a.invoices.insert({ ...base, id: 'i2', number: '0124' })).rejects.toThrow();
    await expect(a.invoices.update('i1', 1, { number: '0123' })).rejects.toThrow();
    expect((await a.invoices.byId('i1'))?.number).toBe('123');
  });
});
