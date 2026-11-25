export type Profile = 'supplier' | 'buyer' | 'both';

export interface CentralAction {
  to: string;
  label: string;
  icon: 'new' | 'pay';
}

const NEW: CentralAction = { to: '/facturas/nueva', label: 'Nueva factura', icon: 'new' };
const PAY: CentralAction = { to: '/app?tab=pagar', label: 'Pagar', icon: 'pay' };

/** Screens that show the bottom navigation. Flow screens bring their own fixed button. */
export const TAB_ROOTS = ['/app', '/facturas', '/actividad', '/perfil'];

/**
 * The middle button follows the company profile; with "both" it follows what the person
 * is looking at (the "Por pagar" tab means paying).
 */
export function centralAction(profile: Profile, search: string): CentralAction {
  if (profile === 'supplier') return NEW;
  if (profile === 'buyer') return PAY;
  return new URLSearchParams(search).get('tab') === 'pagar' ? PAY : NEW;
}

/** `profile` arrives with the backend contract change; until then every company is "both". */
export function profileOf(company: object | null | undefined): Profile {
  const value = (company as { profile?: unknown } | null | undefined)?.profile;
  return value === 'supplier' || value === 'buyer' ? value : 'both';
}
