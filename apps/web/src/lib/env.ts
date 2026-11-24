/** Typed access to Vite env vars. Names only are committed; values live in .env.local. */
export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? '',
  /** An explicit flag wins; with no API URL configured the app runs on the mock server. */
  useMocks:
    import.meta.env.VITE_USE_MOCKS !== undefined
      ? import.meta.env.VITE_USE_MOCKS === 'true'
      : !import.meta.env.VITE_API_URL,
  rpcUrl: import.meta.env.VITE_STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  networkPassphrase: import.meta.env.VITE_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
  contractId:
    import.meta.env.VITE_PRONTO_CONTRACT_ID ??
    'CCEP3RMDUYCFD3GJPDTMH2OQGX3KTV4NX7VRCXLUIIU2ZZOSKL4M5BE4',
  usdcSacId:
    import.meta.env.VITE_USDC_SAC_ID ?? 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
} as const;
