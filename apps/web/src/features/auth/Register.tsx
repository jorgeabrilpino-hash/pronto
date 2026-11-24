import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { api } from '@/api/endpoints';
import { isApiError } from '@/api/errors';
import { sessionStore, useSession } from '@/api/session';
import { Button } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { shortWallet } from '@/lib/format';
import { messageFor } from '@/lib/messages';
import { isValidRuc } from '@/lib/ruc';
import { CodeCard } from './CodeCard';

/** View 2: RUC, legal name and sector; then the code and QR (2b). */
export function Register() {
  const session = useSession();
  const navigate = useNavigate();
  const [ruc, setRuc] = useState('');
  const [legalName, setLegalName] = useState('');
  const [sector, setSector] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (!session) return <Navigate to="/" replace />;
  const company = session.company;

  if (company) {
    return (
      <Screen
        title="Tu empresa"
        back={false}
        footer={<Button onClick={() => navigate('/fondos', { replace: true })}>Continuar</Button>}
      >
        <h2 className="text-2xl font-bold">Listo, ya estás en Pronto</h2>
        <CodeCard company={company} />
      </Screen>
    );
  }

  const rucInvalid = !isValidRuc(ruc);
  const rucError =
    (ruc.length === 11 || touched) && rucInvalid ? messageFor('RUC_INVALID').message : undefined;
  const ready = !rucInvalid && legalName.trim().length >= 2 && sector.trim().length >= 2;

  async function submit() {
    setTouched(true);
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.registerCompany({
        ruc,
        legalName: legalName.trim(),
        sector: sector.trim(),
      });
      sessionStore.setCompany(created);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Registro"
      back="/"
      right={
        <span className="tabular rounded-full border border-line bg-ivory px-3 py-1.5 text-xs text-muted">
          {shortWallet(session.address)}
        </span>
      }
      footer={
        <Button onClick={submit} loading={busy} loadingLabel="Registrando…">
          Registrar empresa
        </Button>
      }
    >
      <h2 className="text-2xl font-bold">Registra tu empresa</h2>
      <Field
        label="RUC"
        mono
        inputMode="numeric"
        maxLength={11}
        value={ruc}
        onChange={(e) => setRuc(e.target.value.replace(/\D/g, ''))}
        error={rucError}
      />
      <Field
        label="Razón social"
        value={legalName}
        onChange={(e) => setLegalName(e.target.value)}
        autoComplete="organization"
        error={
          touched && legalName.trim().length < 2 ? 'Escribe el nombre de tu empresa' : undefined
        }
      />
      <Field
        label="Rubro"
        value={sector}
        onChange={(e) => setSector(e.target.value)}
        error={touched && sector.trim().length < 2 ? 'Escribe tu rubro' : undefined}
      />
      {error ? (
        <ErrorNotice
          error={error}
          onAction={isApiError(error, 'WALLET_TAKEN') ? () => navigate('/') : submit}
        />
      ) : null}
    </Screen>
  );
}
