import type { PrepareOfferRequest } from '@pronto/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { useSession } from '@/api/session';
import { useChainOp } from '@/chain/useChainOp';
import { Amount } from '@/components/Amount';
import { Button } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { IconAlert } from '@/components/icons';
import { NetworkSheet } from '@/components/NetworkSheet';
import { Screen } from '@/components/Screen';
import { useInvoice } from '@/features/invoices/useInvoices';
import { daysBetween, formatAnnual, formatBps } from '@/lib/format';
import { annualizedBps, discountFromBps, formatUsdc, netFromBps, parseMoney } from '@/lib/money';

const DISCOUNTS = [100, 150, 200];
const VALIDITY: Array<PrepareOfferRequest['validityDays']> = [3, 7, 15];

function Pills<T extends number>({
  label,
  values,
  value,
  onChange,
  render,
}: {
  label: string;
  values: T[];
  value: T;
  onChange: (v: T) => void;
  render: (v: T) => string;
}) {
  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="flex gap-2">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={v === value}
            onClick={() => onChange(v)}
            className={`tabular min-h-11 flex-1 rounded-full border px-4 text-[15px] font-semibold transition-colors duration-150 ${
              v === value ? 'border-ink bg-ink text-ivory' : 'border-line bg-ivory text-ink'
            }`}
          >
            {render(v)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** View 8: discount in percent, validity and Reservar. Money first, annual cost as support. */
export function NewOffer() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = useSession();
  const q = useInvoice(id);
  const op = useChainOp();
  const [bps, setBps] = useState(150);
  const [days, setDays] = useState<PrepareOfferRequest['validityDays']>(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | undefined>();

  const inv = q.data;
  if (!inv) {
    return (
      <Screen title="Nueva oferta" back={`/pagar/${id}`}>
        {q.isError ? (
          <ErrorNotice error={q.error} onAction={() => q.refetch()} />
        ) : (
          <div className="h-48 rounded-card bg-line/60" aria-busy="true" />
        )}
      </Screen>
    );
  }

  const face = parseMoney(inv.faceAmount);
  const net = netFromBps(face, bps);
  const saving = discountFromBps(face, bps);
  const term = Math.max(1, daysBetween(new Date().toISOString().slice(0, 10), inv.dueDate));
  const annual = annualizedBps(saving, net, term);
  const over = inv.maxDiscountBps !== null && bps > inv.maxDiscountBps;

  async function reserve() {
    if (!session || !inv) return;
    setBusy(true);
    setError(null);
    try {
      const draft = await api.draftOffer(id, { discountBps: bps, validityDays: days });
      const maxExpiry = Date.now() + (days + 1) * 86_400_000;
      const expires = Date.parse(draft.expiresAt);
      if (
        parseMoney(draft.netAmount) !== net ||
        draft.discountBps !== bps ||
        !(expires > Date.now() && expires <= maxExpiry)
      ) {
        throw new ApiError('CHAIN_MISMATCH', 409);
      }
      setNote(
        `Pagas ${formatUsdc(net)} a ${inv.supplier.legalName} · billetera ${draft.supplierWallet}`,
      );
      setBusy(false);
      await op.run(
        {
          kind: 'create',
          address: session.address,
          offerIdHex: draft.offerIdHex,
          buyer: session.address,
          supplier: draft.supplierWallet,
          face: parseMoney(inv.faceAmount),
          net: parseMoney(draft.netAmount),
          expiresAt: draft.expiresAt,
        },
        async (hash) => {
          await api.reconcileOffer(draft.offerIdHex, hash);
          await qc.invalidateQueries();
        },
      );
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Nueva oferta"
      back={`/pagar/${id}`}
      footer={
        <Button onClick={reserve} loading={busy} loadingLabel="Preparando…">
          Reservar {formatUsdc(net)}
        </Button>
      }
    >
      <h2 className="text-2xl font-bold">Ofrece pagar hoy</h2>
      <p className="text-sm text-muted">{inv.supplier.legalName}</p>
      <Pills
        label="Descuento"
        values={DISCOUNTS}
        value={bps}
        onChange={setBps}
        render={formatBps}
      />
      <section className="flex flex-col gap-1 rounded-card border border-line bg-ivory p-5">
        <span className="text-sm text-muted">Pagas hoy</span>
        <Amount value={net} currency className="text-[40px] font-semibold leading-none" />
        <span className="mt-2 text-[15px]">
          Ahorras <Amount value={saving} currency className="font-semibold" />
        </span>
        <span className="text-sm text-muted">equivale a {formatAnnual(annual)} anual</span>
      </section>
      {over && inv.maxDiscountBps !== null ? (
        <p className="flex items-center gap-2 text-[15px] text-danger" role="status">
          <IconAlert size={18} />
          Supera el descuento máximo de la empresa ({formatBps(inv.maxDiscountBps)})
        </p>
      ) : null}
      <Pills
        label="Vigencia"
        values={VALIDITY}
        value={days}
        onChange={setDays}
        render={(d) => `${d} días`}
      />
      {error ? <ErrorNotice error={error} onAction={reserve} /> : null}
      <NetworkSheet
        state={op.state}
        note={note}
        onRetry={op.retry}
        onClose={() => {
          const ok = op.state.done;
          op.close();
          if (ok) navigate(`/pagar/${id}`, { replace: true });
        }}
      />
    </Screen>
  );
}
