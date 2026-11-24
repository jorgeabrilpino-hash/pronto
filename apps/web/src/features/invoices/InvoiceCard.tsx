import type { Invoice, Role } from '@pronto/shared';
import { useState } from 'react';
import { api } from '@/api/endpoints';
import { Amount } from '@/components/Amount';
import { IconDoc } from '@/components/icons';
import { ReceiptCard } from '@/components/ReceiptCard';
import { formatBps, formatDate, formatInvoiceRef } from '@/lib/format';
import { StatusChip } from './status';

function DocumentLink({ attachmentId }: { attachmentId: string }) {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    const tab = window.open('', '_blank');
    try {
      const { url } = await api.attachmentUrl(attachmentId);
      if (tab) tab.location.href = url;
    } catch {
      tab?.close();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className="inline-flex min-h-11 items-center gap-2 self-start text-[15px] font-medium underline underline-offset-4 disabled:opacity-40"
    >
      <IconDoc size={18} />
      Ver documento
    </button>
  );
}

export function Label({ children }: { children: string }) {
  return (
    <span className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
      {children}
    </span>
  );
}

/** Receipt ticket for an invoice: who, which invoice and the amount once; stub with dates. */
export function InvoiceCard({ inv, side }: { inv: Invoice; side: Role }) {
  const other = side === 'supplier' ? inv.buyer : inv.supplier;
  const doc = inv.attachments.find((a) => a.kind !== 'xml') ?? inv.attachments[0];
  return (
    <ReceiptCard
      body={
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Label>{side === 'supplier' ? 'Cliente' : 'Proveedor'}</Label>
              <p className="truncate text-lg font-semibold">{other.legalName}</p>
              <p className="tabular text-sm text-muted">RUC {other.ruc}</p>
            </div>
            <StatusChip inv={inv} role={side} />
          </div>
          <p className="tabular mt-2 text-sm text-muted">
            Factura {formatInvoiceRef(inv.series, inv.number)}
          </p>
          <Amount
            value={inv.faceAmount}
            currency
            className="text-[40px] font-semibold leading-none"
          />
        </>
      }
      stub={
        <>
          <div className="flex justify-between text-[15px]">
            <span className="text-muted">Vence</span>
            <span className="tabular">{formatDate(inv.dueDate)}</span>
          </div>
          {inv.maxDiscountBps !== null ? (
            <div className="flex justify-between text-[15px]">
              <span className="text-muted">Descuento máximo</span>
              <span className="tabular">{formatBps(inv.maxDiscountBps)}</span>
            </div>
          ) : null}
          {doc ? <DocumentLink attachmentId={doc.id} /> : null}
        </>
      }
    />
  );
}
