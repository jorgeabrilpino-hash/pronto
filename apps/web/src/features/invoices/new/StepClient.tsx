import type { PublicCompany } from '@pronto/shared';
import { useEffect, useState } from 'react';
import { api } from '@/api/endpoints';
import { isApiError } from '@/api/errors';
import { useCompany } from '@/api/session';
import { Button } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Field } from '@/components/Field';
import { IconScan } from '@/components/icons';
import { Scanner } from '@/components/Scanner';
import { Screen } from '@/components/Screen';
import { codeFromScan } from '@/features/code/scan';
import { messageFor } from '@/lib/messages';
import { shareInvite } from './invite';

interface Props {
  initialCode?: string | undefined;
  onNext: (buyer: PublicCompany) => void;
}

/** Step 1: find the client by exact code or RUC (scan, type or paste). */
export function StepClient({ initialCode, onNext }: Props) {
  const me = useCompany();
  const [query, setQuery] = useState(initialCode ?? '');
  const [found, setFound] = useState<PublicCompany | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function search(raw = query) {
    const q = raw.trim().toUpperCase().replace(/\s/g, '');
    if (!q) return;
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      setFound(await api.lookup(/^\d+$/.test(q) ? { ruc: q } : { code: q }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once for a code from the QR page
  useEffect(() => {
    if (initialCode) void search(initialCode);
  }, []);

  const self = found !== null && found.id === me?.id;
  const notFound = isApiError(error, 'COMPANY_NOT_FOUND');

  return (
    <Screen
      title="Nueva factura · 1 de 3"
      back="/app"
      footer={
        found && !self ? (
          <Button onClick={() => onNext(found)}>Confirmar</Button>
        ) : (
          <Button
            onClick={() => search()}
            loading={busy}
            loadingLabel="Buscando…"
            disabled={!query.trim()}
          >
            Buscar
          </Button>
        )
      }
    >
      <h2 className="text-2xl font-bold">¿A quién le envías la factura?</h2>
      <Field
        label="Código Pronto o RUC"
        mono
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setFound(null);
          setError(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && void search()}
        placeholder="PR-7K4Q2M"
        autoCapitalize="characters"
      />
      <Button variant="secondary" className="self-start" onClick={() => setScanning(true)}>
        <IconScan size={18} />
        Escanear QR
      </Button>
      {found ? (
        <div className="rounded-card border border-line bg-ivory p-4">
          <p className="font-semibold">{found.legalName}</p>
          <p className="tabular text-sm text-muted">RUC {found.ruc}</p>
        </div>
      ) : null}
      {self ? <ErrorNotice error={{ code: 'SELF_INVOICE' }} /> : null}
      {error ? (
        <ErrorNotice
          error={error}
          onAction={notFound ? () => void shareInvite() : () => void search()}
          actionLabel={notFound ? messageFor('COMPANY_NOT_FOUND').action : undefined}
        />
      ) : null}
      <Scanner
        open={scanning}
        onClose={() => setScanning(false)}
        onResult={(text) => {
          setScanning(false);
          const code = codeFromScan(text);
          if (code) {
            setQuery(code);
            void search(code);
          }
        }}
      />
    </Screen>
  );
}
