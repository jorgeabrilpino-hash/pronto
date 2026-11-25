import type { Invoice } from '@pronto/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '@/api/endpoints';
import { useSession } from '@/api/session';
import { assertStatus, useChainOp } from '@/chain/useChainOp';
import { Button, LinkButton } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Field } from '@/components/Field';
import { NetworkSheet } from '@/components/NetworkSheet';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { canSupply, profileOf } from '@/features/shell/centralAction';
import { formatUsdc } from '@/lib/money';
import { InvoiceCard } from './InvoiceCard';
import { normalizeAmount } from './new/StepData';
import { useInvoice } from './useInvoices';

function ResendSheet({
  inv,
  open,
  onClose,
  onDone,
}: {
  inv: Invoice;
  open: boolean;
  onClose: () => void;
  onDone: (inv: Invoice) => void;
}) {
  const [amount, setAmount] = useState(inv.faceAmount);
  const [due, setDue] = useState(inv.dueDate);
  const face = normalizeAmount(amount);
  const send = useMutation({
    mutationFn: () =>
      api.resendInvoice(inv.id, { ...(face ? { faceAmount: face } : {}), dueDate: due }),
    onSuccess: onDone,
  });
  return (
    <Sheet open={open} title="Corregir y reenviar" onClose={onClose}>
      {inv.rejectionReason ? <p className="text-muted">Motivo: {inv.rejectionReason}</p> : null}
      <Field
        label="Importe"
        mono
        inputMode="decimal"
        suffix="USDC"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={face ? undefined : 'Escribe un monto mayor a 0'}
      />
      <Field
        label="Vencimiento"
        mono
        type="date"
        value={due}
        onChange={(e) => setDue(e.target.value)}
      />
      {send.isError ? <ErrorNotice error={send.error} /> : null}
      <Button
        loading={send.isPending}
        loadingLabel="Enviando…"
        disabled={!face}
        onClick={() => send.mutate()}
      >
        Reenviar
      </Button>
    </Sheet>
  );
}

/** View 6: supplier side. State, document and the offer with Cobrar / Esperar. */
export function ReceivableDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = useSession();
  const q = useInvoice(id);
  const op = useChainOp();
  const [editing, setEditing] = useState(false);

  const inv = q.data;
  const offer = inv?.offer;
  const cancel = useMutation({
    mutationFn: () => api.cancelInvoice(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invoices'] });
      navigate('/app', { replace: true });
    },
  });

  function collect() {
    if (!offer || !session) return;
    const p = { kind: 'accept' as const, address: session.address, offerIdHex: offer.offerIdHex };
    void op.run(p, async (hash) => {
      assertStatus(await api.reconcileOffer(offer.offerIdHex, hash), ['accepted']);
      await qc.invalidateQueries();
    });
  }

  const supplies = canSupply(profileOf(session?.company));
  let footer = null;
  if (inv?.displayStatus === 'offer_open' && offer) {
    footer = (
      <>
        <Button onClick={collect}>Cobrar {formatUsdc(offer.netAmount).replace(' USDC', '')}</Button>
        <Button variant="text" onClick={() => navigate('/app')}>
          Esperar
        </Button>
      </>
    );
  } else if (inv?.displayStatus === 'rejected' && supplies) {
    footer = <Button onClick={() => setEditing(true)}>Corregir y reenviar</Button>;
  } else if (inv?.displayStatus === 'collected' && offer) {
    footer = <LinkButton to={`/comprobante/${offer.offerIdHex}`}>Ver comprobante</LinkButton>;
  }
  const canCancel =
    (supplies && inv?.displayStatus === 'sent') ||
    inv?.displayStatus === 'confirmed' ||
    inv?.displayStatus === 'rejected';

  return (
    <Screen title="Por cobrar" back="/app" footer={footer}>
      {q.isError ? <ErrorNotice error={q.error} onAction={() => q.refetch()} /> : null}
      {inv ? (
        <InvoiceCard inv={inv} side="supplier" />
      ) : (
        <div className="h-64 rounded-card bg-line/60" aria-busy="true" />
      )}
      {inv?.displayStatus === 'rejected' && inv.rejectionReason ? (
        <p className="rounded-card border border-danger bg-danger-tint p-4 text-danger">
          {inv.rejectionReason}
        </p>
      ) : null}
      {canCancel ? (
        <Button
          variant="danger"
          className="self-start"
          loading={cancel.isPending}
          loadingLabel="Cancelando…"
          onClick={() => cancel.mutate()}
        >
          Cancelar factura
        </Button>
      ) : null}
      {cancel.isError ? <ErrorNotice error={cancel.error} /> : null}
      {inv ? (
        <ResendSheet
          inv={inv}
          open={editing}
          onClose={() => setEditing(false)}
          onDone={(next) => {
            qc.setQueryData(['invoice', id], next);
            void qc.invalidateQueries({ queryKey: ['invoices'] });
            setEditing(false);
          }}
        />
      ) : null}
      <NetworkSheet state={op.state} onRetry={op.retry} onClose={op.close} />
    </Screen>
  );
}
