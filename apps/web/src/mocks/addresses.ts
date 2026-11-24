/** Test accounts (public addresses; importing them in the wallet is the owner's job). */
export const BUYER_ADDRESS = 'GABXMVQFX6R74OUC6TGL3YGO7TLGV7R34RVAGTJE42UUXCVA4IELCKU3';
export const SUPPLIER_ADDRESS = 'GCKU5G3MCJD4HM44QCK2E3D3Y6AIC3YZNG2EZ2HRWT4CF6LNSUWWVQTY';
/** Valid-looking address with no company yet, to walk the registration in the demo. */
export const NEW_ADDRESS = `G${'A'.repeat(51)}NEW2`;

export const DEMO_ACCOUNTS = [
  { id: 'supplier', label: 'Proveedor', address: SUPPLIER_ADDRESS },
  { id: 'buyer', label: 'Comprador', address: BUYER_ADDRESS },
  { id: 'new', label: 'Empresa nueva', address: NEW_ADDRESS },
] as const;
