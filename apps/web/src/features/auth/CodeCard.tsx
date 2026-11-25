import type { Company } from '@pronto/shared';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { IconCopy, IconShare } from '@/components/icons';
import { QrCode } from '@/components/QrCode';
import { ReceiptCard } from '@/components/ReceiptCard';

export function companyUrl(code: string): string {
  return `${window.location.origin}/e/${code}`;
}

/** Code + QR + copy/share. The QR always comes with the written code (DESIGN.md 9). */
export function CodeCard({ company }: { company: Pick<Company, 'code' | 'legalName'> }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(company.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    const url = companyUrl(company.code);
    if (navigator.share) {
      await navigator
        .share({ title: 'Pronto', text: `${company.legalName} en Pronto`, url })
        .catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(url).catch(() => undefined);
    }
  }

  return (
    <ReceiptCard
      body={
        <div className="flex flex-col items-center gap-3">
          <p className="text-center font-semibold">{company.legalName}</p>
          <QrCode value={companyUrl(company.code)} label={`QR de ${company.code}`} />
        </div>
      }
      stub={
        <div className="flex flex-col items-center gap-3">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
            Código Pronto
          </p>
          <p className="code text-[24px] font-semibold">{company.code}</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={copy}>
              <IconCopy size={18} />
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
            <Button variant="secondary" onClick={share}>
              <IconShare size={18} />
              Compartir
            </Button>
          </div>
        </div>
      }
    />
  );
}
