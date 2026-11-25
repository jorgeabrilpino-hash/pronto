import { Navigate } from 'react-router';
import { useSession } from '@/api/session';
import { LinkButton } from '@/components/Button';
import { ReceiptCard, Stamp } from '@/components/ReceiptCard';
import { Plain } from '@/components/Screen';
import { nextRoute } from './signIn';

/** Welcome: logo, one sentence, Entrar and a small "Cómo funciona". No role choice. */
export function Welcome() {
  const session = useSession();
  if (session) return <Navigate to={nextRoute(session)} replace />;

  return (
    <Plain
      footer={
        <>
          <LinkButton to="/entrar">Entrar</LinkButton>
          <LinkButton to="/como-funciona" variant="text">
            Cómo funciona
          </LinkButton>
        </>
      }
    >
      <h1 className="display mt-4 text-[30px]">
        Cobra o paga facturas antes de tiempo, con un descuento claro.
      </h1>
      <ReceiptCard
        tone="dark"
        body={
          <>
            <div className="flex items-start justify-between gap-3">
              <span className="label text-paper/70">Pago total de F001-123</span>
              <Stamp tilt>Pagado</Stamp>
            </div>
            <p className="tabular text-[40px] font-bold leading-none">985,00</p>
            <p className="text-sm text-paper/70">USDC · descuento 1,5 %</p>
          </>
        }
      />
    </Plain>
  );
}
