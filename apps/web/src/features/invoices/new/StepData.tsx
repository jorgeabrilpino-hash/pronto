import type { PublicCompany } from '@pronto/shared';
import { useState } from 'react';
import { api } from '@/api/endpoints';
import { Button } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { daysBetween } from '@/lib/format';
import { parseMoney } from '@/lib/money';
import type { XmlInvoiceData } from '../parseXml';
import type { Uploaded } from '../upload';

interface Props {
  buyer: PublicCompany;
  doc: Uploaded;
  prefill: XmlInvoiceData;
  onBack: () => void;
  onSent: (invoiceId: string) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

/** "1 000,50" or "1000.5" to the API decimal string; null if not a positive amount. */
export function normalizeAmount(raw: string): string | null {
  const s = raw.replace(/[\s\u202f]/g, '').replace(',', '.');
  if (!/^\d{1,13}(\.\d{1,7})?$/.test(s)) return null;
  return parseMoney(s) > 0n ? s.replace(/^0+(?=\d)/, '') : null;
}

/** Step 3: series, number, amount, dates and the optional maximum discount. */
export function StepData({ buyer, doc, prefill, onBack, onSent }: Props) {
  const [series, setSeries] = useState(prefill.series ?? 'F001');
  const [number, setNumber] = useState(prefill.number ?? '');
  const [amount, setAmount] = useState(prefill.faceAmount ?? '');
  const [issue, setIssue] = useState(prefill.issueDate ?? today());
  const [due, setDue] = useState(prefill.dueDate ?? '');
  const [maxPct, setMaxPct] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const face = normalizeAmount(amount);
  const longTerm = issue !== '' && due !== '' && daysBetween(issue, due) > 30;
  const maxBps = maxPct === '' ? undefined : Math.round(Number(maxPct.replace(',', '.')) * 100);
  const errs = {
    series: /^[A-Z0-9]{4}$/.test(series) ? undefined : '4 letras o números, como F001',
    number: /^\d{1,8}$/.test(number) ? undefined : 'Solo números, hasta 8 dígitos',
    amount: face ? undefined : 'Escribe un monto mayor a 0',
    issue: issue && issue <= today() ? undefined : 'La fecha no puede ser futura',
    due: due && due > issue ? undefined : 'Debe ser posterior a la emisión',
    max:
      maxBps === undefined || (Number.isFinite(maxBps) && maxBps > 0 && maxBps <= 5000)
        ? undefined
        : 'Entre 0,01 y 50 %',
  };
  const ready = Object.values(errs).every((e) => e === undefined) && (!longTerm || agreed);

  async function send() {
    setTouched(true);
    if (!ready || !face) return;
    setBusy(true);
    setError(null);
    try {
      const inv = await api.sendInvoice({
        buyerCompanyId: buyer.id,
        series,
        number,
        faceAmount: face,
        currency: 'USDC',
        issueDate: issue,
        dueDate: due,
        longerTermAgreed: longTerm && agreed,
        ...(maxBps !== undefined ? { maxDiscountBps: maxBps } : {}),
        attachmentIds: [doc.id],
      });
      onSent(inv.id);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  const show = (e: string | undefined) => (touched ? e : undefined);
  return (
    <Screen
      title="Nueva factura · 3 de 3"
      back={onBack}
      footer={
        <Button onClick={send} loading={busy} loadingLabel="Enviando…">
          Enviar
        </Button>
      }
    >
      <h2 className="text-2xl font-bold">Datos de la factura</h2>
      <p className="text-sm text-muted">Para {buyer.legalName}</p>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3">
        <Field
          label="Serie"
          mono
          value={series}
          maxLength={4}
          autoCapitalize="characters"
          onChange={(e) => setSeries(e.target.value.toUpperCase())}
          error={show(errs.series)}
        />
        <Field
          label="Número"
          mono
          inputMode="numeric"
          value={number}
          onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
          error={show(errs.number)}
        />
      </div>
      <Field
        label="Importe"
        mono
        inputMode="decimal"
        suffix="USDC"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={show(errs.amount)}
      />
      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3">
        <Field
          label="Emisión"
          mono
          type="date"
          max={today()}
          value={issue}
          onChange={(e) => setIssue(e.target.value)}
          error={show(errs.issue)}
        />
        <Field
          label="Vencimiento"
          mono
          type="date"
          min={today()}
          value={due}
          onChange={(e) => setDue(e.target.value)}
          error={show(errs.due)}
        />
      </div>
      <Field
        label="Descuento máximo que aceptas (opcional)"
        mono
        inputMode="decimal"
        suffix="%"
        value={maxPct}
        onChange={(e) => setMaxPct(e.target.value)}
        error={show(errs.max)}
        hint="Tu cliente verá un aviso si ofrece más."
      />
      {longTerm ? (
        <label className="flex min-h-11 items-start gap-3 text-[15px]">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 size-5 accent-ink"
          />
          <span>El plazo mayor a 30 días fue pactado por escrito con mi cliente.</span>
        </label>
      ) : null}
      {error ? <ErrorNotice error={error} onAction={() => void send()} /> : null}
    </Screen>
  );
}
