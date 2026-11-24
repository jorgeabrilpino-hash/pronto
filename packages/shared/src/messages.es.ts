import type { ErrorCode } from './errors';

/** One short sentence and one button label per error code (neutral Spanish). */
export interface UserMessage {
  message: string;
  action: string;
}

export const MESSAGES_ES = {
  VALIDATION_ERROR: { message: 'Revisa los datos', action: 'Corregir' },
  UNAUTHENTICATED: { message: 'Tu sesión venció', action: 'Firmar de nuevo' },
  FORBIDDEN: { message: 'No tienes permiso para esto', action: 'Volver' },
  RUC_INVALID: { message: 'Ese RUC no es válido', action: 'Corregir' },
  RUC_TAKEN: { message: 'Este RUC ya está en Pronto', action: 'Volver' },
  WALLET_TAKEN: { message: 'Esta billetera ya tiene una empresa', action: 'Entrar' },
  COMPANY_NOT_FOUND: { message: 'No encontramos esa empresa', action: 'Invitar a Pronto' },
  SELF_INVOICE: { message: 'No puedes enviarte una factura', action: 'Elegir otro cliente' },
  INVOICE_DUPLICATE: { message: 'Ya enviaste esta factura', action: 'Ver factura' },
  INVOICE_OVERDUE: { message: 'Esta factura ya venció', action: 'Corregir fechas' },
  INVOICE_NOT_FOUND: { message: 'No encontramos esa factura', action: 'Volver' },
  INVALID_STATE: { message: 'Esta factura cambió, recarga para ver lo último', action: 'Recargar' },
  OFFER_EXISTS: { message: 'Esta factura ya tiene una oferta activa', action: 'Ver oferta' },
  ATTACHMENT_INVALID: {
    message: 'Sube PDF, foto o XML de hasta 5 MB',
    action: 'Elegir otro archivo',
  },
  CHAIN_MISMATCH: {
    message: 'Lo que está en la red no coincide con esta oferta',
    action: 'Ver en la red',
  },
  CHAIN_UNAVAILABLE: { message: 'No pudimos consultar la red ahora', action: 'Reintentar' },
  CHALLENGE_EXPIRED: { message: 'La firma venció', action: 'Firmar de nuevo' },
  SIGNATURE_INVALID: { message: 'No pudimos verificar tu firma', action: 'Firmar de nuevo' },
  RATE_LIMITED: { message: 'Demasiados intentos, espera un momento', action: 'Reintentar' },
  INTERNAL: { message: 'Algo salió mal de nuestro lado', action: 'Reintentar' },
} satisfies Record<ErrorCode, UserMessage>;
