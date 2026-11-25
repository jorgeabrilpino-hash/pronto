/** Typed access to Vite env vars. Names only are committed; values live in .env.local. */
function demoSession(): boolean {
  try {
    return sessionStorage.getItem('pronto.demo') === '1';
  } catch {
    return false;
  }
}

function resolveMocks(): boolean {
  if (demoSession()) return true;
  const flag = import.meta.env.VITE_USE_MOCKS;
  if (flag !== undefined) return flag === 'true';
  return !import.meta.env.VITE_API_URL;
}

export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? '',
  /** An explicit flag wins; a demo session (sessionStorage) or no API URL means the mock server. */
  useMocks: resolveMocks(),
  rpcUrl: import.meta.env.VITE_STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  networkPassphrase: import.meta.env.VITE_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
  /** Contract ids and asset come from env, never from code. */
  contractId: import.meta.env.VITE_PRONTO_CONTRACT_ID ?? '',
  usdcSacId: import.meta.env.VITE_USDC_SAC_ID ?? '',
  assetCode: import.meta.env.VITE_ASSET_CODE ?? 'USDC',
} as const;
