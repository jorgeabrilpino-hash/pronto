import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { api } from '@/api/endpoints';
import { Amount } from '@/components/Amount';
import { Button } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { IconExternal } from '@/components/icons';
import { explorerUrl } from '@/components/NetworkSheet';
import { ReceiptCard, Stamp } from '@/components/ReceiptCard';
import { Screen } from '@/components/Screen';
import { formatBps, formatDate, formatInvoiceRef, shortHash } from '@/lib/format';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[15px]">
      <span className="text-muted">{label}</span>
      <span className="tabular text-right">{children}</span>
    </div>
  );
}

/** View 10: the receipt. Amount once, big; stamp only when it was really collected. */
export function Receipt() {
  const { offerId = '' } = useParams();
  const q = useQuery({ queryKey: ['proof', offerId], queryFn: () => api.offerProof(offerId) });
  const p = q.data;
  const paid = p?.chainStatus === 'accepted';
  const tx = p?.txAccept ?? p?.txCreate ?? null;
  const bps = p ? p.discountBps : 0;

  return (
    <Screen
      title="Comprobante"
      footer={p ? <Button onClick={() => window.print()}>Descargar PDF</Button> : undefined}
    >
      {q.isError ? <ErrorNotice error={q.error} onAction={() => q.refetch()} /> : null}
      {!p && !q.isError ? <div className="h-72 rounded-card bg-line/60" aria-busy="true" /> : null}
      {p ? (
        <ReceiptCard
          body={
            <>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
                  Comprobante Pronto
                </span>
                {paid ? <Stamp tilt>Pagado</Stamp> : null}
              </div>
              <p className="mt-2 text-[15px]">
                Pago total de{' '}
                <span className="tabular font-semibold">
                  {formatInvoiceRef(p.invoiceSeries, p.invoiceNumber)}
                </span>
              </p>
              <Amount
                value={p.netAmount}
                currency
                className="text-[40px] font-semibold leading-none"
              />
            </>
          }
          stub={
            <>
              <Row label="Valor de la factura">
                <Amount value={p.faceAmount} currency />
              </Row>
              <Row label={`Descuento ${formatBps(bps)}`}>
                <Amount value={p.discountAmount} currency />
              </Row>
              <Row label="Reserva vence">{formatDate(p.expiresAt)}</Row>
              {tx ? (
                <div className="mt-1 flex flex-col gap-1 border-t border-line pt-3">
                  <span className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
                    Código de operación
                  </span>
                  <span className="tabular break-all text-sm">{shortHash(tx)}</span>
                  <a
                    href={explorerUrl(tx)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 self-start text-[15px] font-medium text-muted active:text-ink"
                  >
                    <IconExternal size={16} />
                    Ver en la red
                  </a>
                </div>
              ) : null}
            </>
          }
        />
      ) : null}
    </Screen>
  );
}
