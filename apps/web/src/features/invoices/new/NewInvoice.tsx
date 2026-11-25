import type { PublicCompany } from '@pronto/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { XmlInvoiceData } from '../parseXml';
import type { Uploaded } from '../upload';
import { StepClient } from './StepClient';
import { StepData } from './StepData';
import { StepDocument } from './StepDocument';

/** View 5: client, document, data. The invoice shows up only in the client's "Por pagar". */
export function NewInvoice() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [buyer, setBuyer] = useState<PublicCompany | null>(null);
  const [doc, setDoc] = useState<Uploaded | null>(null);
  const [xml, setXml] = useState<XmlInvoiceData>({});
  const [step, setStep] = useState<1 | 2 | 3>(1);

  if (step === 2 && buyer) {
    return (
      <StepDocument
        doc={doc}
        onBack={() => setStep(1)}
        onNext={(d, x) => {
          setDoc(d);
          setXml(x);
          setStep(3);
        }}
      />
    );
  }
  if (step === 3 && buyer && doc) {
    return (
      <StepData
        buyer={buyer}
        doc={doc}
        prefill={xml}
        onBack={() => setStep(2)}
        onSent={async (id) => {
          await qc.invalidateQueries({ queryKey: ['invoices'] });
          navigate(`/cobrar/${id}`, { replace: true });
        }}
      />
    );
  }
  return (
    <StepClient
      initialCode={params.get('code') ?? undefined}
      onNext={(b) => {
        setBuyer(b);
        setStep(2);
      }}
    />
  );
}
