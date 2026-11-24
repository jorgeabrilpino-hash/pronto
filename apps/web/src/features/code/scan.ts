import { CompanyCodeSchema } from '@pronto/shared';

/** Accepts a Pronto QR (".../e/PR-XXXXXX") or a bare code; returns the code or null. */
export function codeFromScan(text: string): string | null {
  const m = /(PR-[A-Za-z0-9]{6})/i.exec(text.trim());
  const code = m?.[1]?.toUpperCase();
  const parsed = CompanyCodeSchema.safeParse(code);
  return parsed.success ? parsed.data : null;
}
