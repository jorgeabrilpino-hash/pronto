import type { Company, Profile } from '@pronto/shared';

export interface CentralAction {
  to: string;
  label: string;
  icon: 'new' | 'pay';
}

const NEW: CentralAction = { to: '/facturas/nueva', label: 'Nueva factura', icon: 'new' };
const PAY: CentralAction = { to: '/app?tab=pagar', label: 'Pagar', icon: 'pay' };

/** Screens that show the bottom navigation. Flow screens bring their own fixed button. */
export const TAB_ROOTS = ['/app', '/facturas', '/actividad', '/perfil'];

/** Can this company act as supplier (send invoices) or as buyer (confirm and pay early)? */
export const canSupply = (p: Profile) => p !== 'buyer';
export const canBuy = (p: Profile) => p !== 'supplier';

export function profileOf(company: Pick<Company, 'profile'> | null | undefined): Profile {
  return company?.profile ?? 'both';
}

/**
 * The middle button follows the company profile; with "both" it follows what the person
 * is looking at (the "Por pagar" tab means paying).
 */
export function centralAction(profile: Profile, search: string): CentralAction {
  if (profile === 'supplier') return NEW;
  if (profile === 'buyer') return PAY;
  return new URLSearchParams(search).get('tab') === 'pagar' ? PAY : NEW;
}
