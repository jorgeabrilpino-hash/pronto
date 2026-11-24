import type { Invoice } from '@pronto/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '@/api/endpoints';
import { useSession } from '@/api/session';
import { useChainOp } from '@/chain/useChainOp';
import { Button, LinkButton } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Field } from '@/components/Field';
import { NetworkSheet } from '@/components/NetworkSheet';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { InvoiceCard } from './InvoiceCard';
import { useInvoice } from './useInvoices';

interface RejectProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  busy: boolean;
  error: unknown;
}

function RejectSheet({ open, onClose, onSubmit, busy, error }: RejectProps) {
  const [reason, setReason] = useState('');
  return (
    <Sheet open={open} title="No coincide" onClose={onClose}>
      <Field label="¿Qué no coincide?" value={reason} onChange={(e) => setReason(e.target.value)} />
      {error ? <ErrorNotice error={error} /> : null}
      <Button
        loading={busy}
        loadingLabel="Enviando…"
        disabled={reason.trim().length < 3}
        onClick={() => onSubmit(reason.trim())}
      >
        Enviar motivo
      </Button>
    </Sheet>
  );
}

/** View 7: client side. Confirm or "No coincide", then offer early payment or recover. */
export function PayableDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = useSession();
  const q = useInvoice(id);
  const op = useChainOp();
  const [rejecting, setRejecting] = useState(false);

  const refresh = (inv: Invoice) => {
    qc.setQueryData(['invoice', id], inv);
    void qc.invalidateQueries({ queryKey: ['invoices'] });
  };
  const confirm = useMutation({ mutationFn: () => api.confirmInvoice(id), onSuccess: refresh });
  const reject = useMutation({
    mutationFn: (reason: string) => api.rejectInvoice(id, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invoices'] });
      navigate('/app?tab=pagar', { replace: true });
    },
  });

  const inv = q.data;
  const offer = inv?.offer;

  function reclaim() {
    if (!offer || !session) return;
    const p = { kind: 'reclaim' as const, address: session.address, offerIdHex: offer.offerIdHex };
    void op.run(p, async (hash) => {
      await api.reconcileOffer(offer.offerIdHex, hash);
      await qc.invalidateQueries();
    });
  }

  let footer = null;
  if (inv?.displayStatus === 'sent') {
    footer = (
      <>
        <Button
          onClick={() => confirm.mutate()}
          loading={confirm.isPending}
          loadingLabel="Confirmando…"
        >
          Confirmar
        </Button>
        <Button variant="text" onClick={() => setRejecting(true)}>
          No coincide
        </Button>
      </>
    );
  } else if (inv?.displayStatus === 'confirmed') {
    footer = <LinkButton to={`/pagar/${id}/oferta`}>Ofrecer pago anticipado</LinkButton>;
  } else if (inv?.displayStatus === 'offer_expired') {
    footer = <Button onClick={reclaim}>Recuperar</Button>;
  } else if (inv?.displayStatus === 'collected' && offer) {
    footer = <LinkButton to={`/comprobante/${offer.offerIdHex}`}>Ver comprobante</LinkButton>;
  }

  return (
    <Screen title="Por pagar" back="/app?tab=pagar" footer={footer}>
      {q.isError ? <ErrorNotice error={q.error} onAction={() => q.refetch()} /> : null}
      {inv ? (
        <InvoiceCard inv={inv} side="buyer" />
      ) : (
        <div className="h-64 rounded-card bg-line/60" aria-busy="true" />
      )}
      {confirm.isError ? (
        <ErrorNotice error={confirm.error} onAction={() => confirm.mutate()} />
      ) : null}
      <RejectSheet
        open={rejecting}
        onClose={() => setRejecting(false)}
        onSubmit={(r) => reject.mutate(r)}
        busy={reject.isPending}
        error={reject.error}
      />
      <NetworkSheet state={op.state} onRetry={op.retry} onClose={op.close} />
    </Screen>
  );
}
