import { useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { IconDoc, IconUpload } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { parseInvoiceXml, type XmlInvoiceData } from '../parseXml';
import { classify, type Uploaded, uploadAttachment } from '../upload';

interface Props {
  doc: Uploaded | null;
  onBack: () => void;
  onNext: (doc: Uploaded, xml: XmlInvoiceData) => void;
}

function sizeLabel(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} MB`;
}

/** Step 2: PDF, phone photo or XML (max 5 MB). XML fills the next step by itself. */
export function StepDocument({ doc, onBack, onNext }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState<Uploaded | null>(doc);
  const [xml, setXml] = useState<XmlInvoiceData>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function pick(file: File) {
    setError(null);
    if (!classify(file)) {
      setError({ code: 'ATTACHMENT_INVALID' });
      return;
    }
    setBusy(true);
    try {
      const uploaded = await uploadAttachment(file);
      setCurrent(uploaded);
      setXml(uploaded.kind === 'xml' ? parseInvoiceXml(await file.text()) : {});
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Nueva factura · 2 de 3"
      back={onBack}
      footer={
        <Button onClick={() => current && onNext(current, xml)} disabled={!current || busy}>
          Continuar
        </Button>
      }
    >
      <h2 className="text-2xl font-bold">Sube la factura</h2>
      <input
        ref={input}
        type="file"
        hidden
        accept="application/pdf,image/jpeg,image/png,.xml,text/xml,application/xml"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void pick(f);
        }}
      />
      {current ? (
        <div className="flex items-center gap-3 rounded-card border border-line bg-ivory p-4">
          <IconDoc />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{current.name}</span>
            <span className="tabular text-sm text-muted">{sizeLabel(current.sizeBytes)}</span>
          </span>
        </div>
      ) : null}
      <Button
        variant="secondary"
        className="self-start"
        loading={busy}
        loadingLabel="Subiendo…"
        onClick={() => input.current?.click()}
      >
        <IconUpload size={18} />
        {current ? 'Cambiar archivo' : 'Elegir archivo'}
      </Button>
      <p className="text-sm text-muted">PDF, foto o XML de hasta 5 MB.</p>
      {error ? <ErrorNotice error={error} onAction={() => input.current?.click()} /> : null}
    </Screen>
  );
}
