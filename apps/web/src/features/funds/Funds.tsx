import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/api/session';
import { activateUsdc, getFunds } from '@/chain/funds';
import { Button, LinkButton } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { IconCheck, IconDot, IconExternal } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { formatAmount } from '@/lib/money';

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <li className="flex min-h-14 items-center justify-between border-b border-line last:border-b-0">
      <span className="font-semibold">{label}</span>
      <span className={`flex items-center gap-1.5 text-[15px] ${ok ? 'text-green' : 'text-muted'}`}>
        {ok ? <IconCheck size={18} /> : <IconDot size={18} />}
        <span className="tabular">{value}</span>
      </span>
    </li>
  );
}

/** View 3: test funds and USDC activation. */
export function Funds() {
  const session = useSession();
  const qc = useQueryClient();
  const address = session?.address ?? '';
  const funds = useQuery({ queryKey: ['funds', address], queryFn: () => getFunds(address) });
  const activate = useMutation({
    mutationFn: () => activateUsdc(address),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['funds', address] }),
  });

  const active = funds.data?.usdc != null;
  return (
    <Screen
      title="Fondos"
      back={false}
      footer={
        active ? (
          <LinkButton to="/app" replace>
            Continuar
          </LinkButton>
        ) : (
          <Button
            onClick={() => activate.mutate()}
            loading={activate.isPending}
            loadingLabel="Activando…"
            disabled={!funds.data}
          >
            Activar USDC
          </Button>
        )
      }
    >
      <h2 className="text-2xl font-bold">Tus fondos de prueba</h2>
      {funds.isError ? (
        <ErrorNotice error={funds.error} onAction={() => funds.refetch()} />
      ) : (
        <ul className="rounded-card border border-line bg-ivory px-4">
          <Row
            label="USDC"
            ok={active}
            value={
              funds.data?.usdc != null ? `${formatAmount(funds.data.usdc)} USDC` : 'Falta activar'
            }
          />
          <Row
            label="XLM (comisiones)"
            ok={!!funds.data && funds.data.xlm !== '0'}
            value={funds.data ? formatAmount(funds.data.xlm.replace(/(\.\d{7}).*/, '$1')) : '…'}
          />
        </ul>
      )}
      {activate.isError ? (
        <ErrorNotice error={activate.error} onAction={() => activate.mutate()} />
      ) : null}
      <a
        href="https://faucet.circle.com"
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-full border-[1.5px] border-line bg-ivory px-5 text-[15px] font-semibold active:bg-pressed"
      >
        Conseguir USDC de prueba
        <IconExternal size={16} />
      </a>
    </Screen>
  );
}
