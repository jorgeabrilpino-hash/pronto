/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_USE_MOCKS?: string;
  readonly VITE_STELLAR_RPC_URL?: string;
  readonly VITE_NETWORK_PASSPHRASE?: string;
  readonly VITE_PRONTO_CONTRACT_ID?: string;
  readonly VITE_USDC_SAC_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
