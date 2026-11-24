import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/endpoints';
import { ErrorNotice } from '@/components/ErrorNotice';
import { IconExternal } from '@/components/icons';
import { explorerUrl } from '@/components/NetworkSheet';
import { Screen } from '@/components/Screen';
import { env } from '@/lib/env';
import { formatDate, shortHash } from '@/lib/format';

const STEPS = [
  {
    fn: 'create_offer',
    title: 'Reservar',
    text: 'El comprador reserva el monto neto en el contrato.',
  },
  {
    fn: 'accept',
    title: 'Cobrar',
    text: 'El proveedor cobra en la misma transacción en que acepta.',
  },
  {
    fn: 'reclaim',
    title: 'Recuperar',
    text: 'Si la oferta vence, el comprador recupera su reserva.',
  },
];
const LABEL = { create: 'Reservar', accept: 'Cobrar', reclaim: 'Recuperar' };

/** View 15: how Pronto uses the network, the contract and the latest real operations. */
export function NetworkPage() {
  const q = useQuery({ queryKey: ['network'], queryFn: () => api.network() });
  const contract = q.data?.contractId ?? env.contractId;
  return (
    <Screen title="Pronto en la red" back>
      <h2 className="text-2xl font-bold">Cada pago pasa por un contrato</h2>
      <ol className="flex flex-col gap-2">
        {STEPS.map((s, i) => (
          <li key={s.fn} className="flex gap-3 rounded-card border border-line bg-ivory p-4">
            <span className="tabular flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm text-ivory">
              {i + 1}
            </span>
            <span className="flex flex-col">
              <span className="font-semibold">
                {s.title} <span className="tabular text-sm font-normal text-muted">{s.fn}</span>
              </span>
              <span className="text-[15px] text-muted">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <section className="flex flex-col gap-1">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
          Contrato · Testnet
        </span>
        <a
          href={`https://stellar.expert/explorer/testnet/contract/${contract}`}
          target="_blank"
          rel="noreferrer"
          className="tabular inline-flex min-h-11 items-center gap-2 break-all text-sm underline underline-offset-4"
        >
          {shortHash(contract)}
          <IconExternal size={16} />
        </a>
      </section>
      {q.isError ? <ErrorNotice error={q.error} onAction={() => q.refetch()} /> : null}
      {q.data ? (
        <section className="flex flex-col gap-2">
          <p className="text-[15px]">
            <span className="tabular font-semibold">{q.data.offersCreated}</span> reservas ·{' '}
            <span className="tabular font-semibold">{q.data.offersAccepted}</span> cobradas
          </p>
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
            Últimas operaciones
          </h3>
          <ul>
            {q.data.lastOperations.map((o) => (
              <li
                key={o.txHash}
                className="flex min-h-11 items-center justify-between border-b border-line text-[15px]"
              >
                <span>{LABEL[o.kind]}</span>
                <a
                  href={explorerUrl(o.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="tabular text-muted underline underline-offset-4"
                >
                  {shortHash(o.txHash)} · {formatDate(o.at)}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Screen>
  );
}
