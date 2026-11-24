import type { Invoice, Role } from '@pronto/shared';
import { Link, useSearchParams } from 'react-router';
import { useSession } from '@/api/session';
import { LinkButton } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { IconPlus } from '@/components/icons';
import { Screen, TestnetChip } from '@/components/Screen';
import { InvoiceRow } from '@/features/invoices/InvoiceRow';
import { needsAction } from '@/features/invoices/status';
import { useInvoices } from '@/features/invoices/useInvoices';
import { shortWallet } from '@/lib/format';
import { formatUsdc, parseMoney } from '@/lib/money';

const TABS: Array<{ role: Role; slug: string; label: string }> = [
  { role: 'supplier', slug: 'cobrar', label: 'Por cobrar' },
  { role: 'buyer', slug: 'pagar', label: 'Por pagar' },
];

/** Total still open: everything not yet collected, rejected or cancelled. */
function openTotal(list: Invoice[]): bigint {
  return list
    .filter((i) => !['collected', 'cancelled', 'rejected'].includes(i.displayStatus))
    .reduce((sum, i) => sum + parseMoney(i.faceAmount), 0n);
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {[0, 1, 2].map((n) => (
        <div key={n} className="h-[72px] rounded-card bg-line/60" />
      ))}
    </div>
  );
}

/** View 4: two tabs, "Requiere tu acción" first, total and list. */
export function Home() {
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const role: Role = params.get('tab') === 'pagar' ? 'buyer' : 'supplier';
  const supplier = useInvoices('supplier');
  const buyer = useInvoices('buyer');
  const current = role === 'supplier' ? supplier : buyer;
  const counts: Record<Role, number> = {
    supplier: supplier.data?.length ?? 0,
    buyer: buyer.data?.length ?? 0,
  };

  const list = current.data ?? [];
  const urgent = list.filter((i) => needsAction(i, role)).slice(0, 3);
  const urgentIds = new Set(urgent.map((i) => i.id));
  const rest = list.filter((i) => !urgentIds.has(i.id));

  return (
    <Screen
      title={session?.company?.legalName ?? 'Pronto'}
      back={false}
      right={
        <div className="flex items-center gap-1.5">
          <span className="tabular rounded-full border border-line bg-ivory px-2.5 py-1.5 text-xs text-muted">
            {shortWallet(session?.address ?? '')}
          </span>
          <TestnetChip />
        </div>
      }
      footer={
        role === 'supplier' ? (
          <LinkButton to="/facturas/nueva">
            <IconPlus size={20} />
            Nueva factura
          </LinkButton>
        ) : undefined
      }
    >
      <div role="tablist" aria-label="Facturas" className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.slug}
            type="button"
            role="tab"
            aria-selected={t.role === role}
            onClick={() => setParams({ tab: t.slug }, { replace: true })}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border px-4 text-[15px] font-semibold transition-colors duration-150 ${
              t.role === role ? 'border-ink bg-ink text-ivory' : 'border-line bg-ivory text-ink'
            }`}
          >
            {t.label}
            <span className="tabular text-sm opacity-80">{counts[t.role]}</span>
          </button>
        ))}
      </div>

      {current.isPending ? <Skeleton /> : null}
      {current.isError ? (
        <ErrorNotice error={current.error} onAction={() => current.refetch()} />
      ) : null}

      {current.data ? (
        <>
          <p className="flex items-baseline justify-between">
            <span className="text-sm text-muted">
              {role === 'supplier' ? 'Por cobrar en total' : 'Por pagar en total'}
            </span>
            <span className="tabular text-xl font-semibold">{formatUsdc(openTotal(list))}</span>
          </p>

          {urgent.length > 0 ? (
            <section aria-labelledby="accion" className="flex flex-col gap-2">
              <h2
                id="accion"
                className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-muted"
              >
                Requiere tu acción
              </h2>
              <ul className="flex flex-col gap-2">
                {urgent.map((i) => (
                  <InvoiceRow key={i.id} inv={i} role={role} highlight />
                ))}
              </ul>
            </section>
          ) : null}

          {list.length === 0 ? (
            <p className="py-8 text-center text-muted">Aún no hay facturas</p>
          ) : (
            <ul>
              {rest.map((i) => (
                <InvoiceRow key={i.id} inv={i} role={role} />
              ))}
            </ul>
          )}
        </>
      ) : null}

      <nav aria-label="Más" className="mt-2 flex justify-center gap-1">
        {[
          ['/mi-codigo', 'Mi código'],
          ['/contactos', 'Contactos'],
          ['/ajustes', 'Ajustes'],
        ].map(([to, label]) => (
          <Link
            key={to}
            to={to ?? '/'}
            className="inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-medium text-muted active:text-ink"
          >
            {label}
          </Link>
        ))}
      </nav>
    </Screen>
  );
}
