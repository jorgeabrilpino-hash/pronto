import type { Invoice, Role } from '@pronto/shared';
import { Link } from 'react-router';
import { Amount } from '@/components/Amount';
import { formatDate, formatInvoiceRef } from '@/lib/format';
import { detailPath, StatusChip } from './status';

/** List row: counterpart + ref and date on the left, amount and status on the right. */
export function InvoiceRow({
  inv,
  role,
  highlight,
}: {
  inv: Invoice;
  role: Role;
  highlight?: boolean;
}) {
  const other = role === 'supplier' ? inv.buyer : inv.supplier;
  return (
    <li>
      <Link
        to={detailPath(inv, role)}
        className={`flex min-h-[72px] items-center justify-between gap-3 border-b border-line px-1 py-3 active:bg-[#f2ede1] ${
          highlight ? 'rounded-card border border-gold bg-gold/10 px-3' : ''
        }`}
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{other.legalName}</span>
          <span className="tabular text-sm text-muted">
            {formatInvoiceRef(inv.series, inv.number)} · {formatDate(inv.dueDate)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <Amount value={inv.faceAmount} className="font-semibold" />
          <StatusChip inv={inv} role={role} />
        </span>
      </Link>
    </li>
  );
}
