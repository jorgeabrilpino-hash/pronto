import { describe, expect, it } from 'vitest';
import { canBuy, canSupply, centralAction, profileOf, TAB_ROOTS } from './centralAction';

describe('central action', () => {
  it('follows the profile', () => {
    expect(centralAction('supplier', '?tab=pagar').label).toBe('Nueva factura');
    expect(centralAction('buyer', '').label).toBe('Pagar');
  });

  it('follows the visible tab when the company does both', () => {
    expect(centralAction('both', '').label).toBe('Nueva factura');
    expect(centralAction('both', '?tab=pagar').label).toBe('Pagar');
  });

  it('knows which side each profile can act on', () => {
    expect([canSupply('supplier'), canSupply('buyer'), canSupply('both')]).toEqual([
      true,
      false,
      true,
    ]);
    expect([canBuy('supplier'), canBuy('buyer'), canBuy('both')]).toEqual([false, true, true]);
    expect(profileOf(null)).toBe('both');
    expect(profileOf({ profile: 'buyer' })).toBe('buyer');
  });

  it('shows the bottom bar only on the four root tabs', () => {
    expect(TAB_ROOTS).toEqual(['/app', '/facturas', '/actividad', '/perfil']);
  });
});
