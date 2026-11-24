import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { api } from '@/api/endpoints';
import { useSession } from '@/api/session';
import { LinkButton } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ReceiptCard } from '@/components/ReceiptCard';
import { Screen } from '@/components/Screen';

/** View 13: public destination of the QR. Name, RUC, sector and Enviar factura. */
export function CompanyPage() {
  const { code = '' } = useParams();
  const session = useSession();
  const q = useQuery({
    queryKey: ['company-page', code],
    queryFn: () => api.companyPage(code),
  });
  const c = q.data;
  const mine = session?.company?.code === code;

  return (
    <Screen
      title="Empresa"
      back={session ? true : '/'}
      footer={
        c && session?.company && !mine ? (
          <LinkButton to={`/facturas/nueva?code=${c.code}`}>Enviar factura</LinkButton>
        ) : c && !session ? (
          <LinkButton to="/">Entrar para enviar factura</LinkButton>
        ) : undefined
      }
    >
      {q.isError ? <ErrorNotice error={q.error} onAction={() => q.refetch()} /> : null}
      {!c && !q.isError ? <div className="h-48 rounded-card bg-line/60" aria-busy="true" /> : null}
      {c ? (
        <ReceiptCard
          body={
            <>
              <h2 className="text-xl font-bold">{c.legalName}</h2>
              <p className="tabular text-muted">RUC {c.ruc}</p>
            </>
          }
          stub={
            <>
              <div className="flex justify-between text-[15px]">
                <span className="text-muted">Rubro</span>
                <span>{c.sector}</span>
              </div>
              <div className="flex justify-between text-[15px]">
                <span className="text-muted">Código Pronto</span>
                <span className="tabular">{c.code}</span>
              </div>
            </>
          }
        />
      ) : null}
    </Screen>
  );
}
