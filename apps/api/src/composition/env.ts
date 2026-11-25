import { z } from '@hono/zod-openapi';
import { TESTNET_PASSPHRASE, TESTNET_RPC_URL } from '../adapters/stellar';

/**
 * Environment of the API (BACKEND_PLAN section 14). Validation errors report variable NAMES
 * only, never values, so a misconfigured deploy cannot leak a secret into a log.
 */

const required = z.string().trim().min(1);

export const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'] as const;

export const EnvSchema = z.object({
  DATABASE_URL: required,
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: required,
  JWT_SECRET: z.string().min(32),
  PRONTO_CONTRACT_ID: z.string().regex(/^C[A-Z2-7]{55}$/),
  STELLAR_RPC_URL: z.url().default(TESTNET_RPC_URL),
  // Only TESTNET: any other passphrase is a configuration error.
  STELLAR_NETWORK_PASSPHRASE: z.literal(TESTNET_PASSPHRASE).default(TESTNET_PASSPHRASE),
  ALLOWED_ORIGINS: z.string().default(''),
  NODE_ENV: z.string().default('production'),
});

export type AppEnv = z.output<typeof EnvSchema>;

export class EnvError extends Error {
  constructor(readonly variables: readonly string[]) {
    super(`Invalid or missing environment variables: ${variables.join(', ')}`);
    this.name = 'EnvError';
  }
}

export function parseEnv(source: Record<string, string | undefined>): AppEnv {
  // Empty strings count as missing, as in most hosting dashboards.
  const cleaned: Record<string, string> = {};
  for (const key of Object.keys(EnvSchema.shape)) {
    const value = source[key];
    if (value !== undefined && value.trim() !== '') cleaned[key] = value;
  }
  const r = EnvSchema.safeParse(cleaned);
  if (!r.success) {
    const names = [...new Set(r.error.issues.map((i) => String(i.path[0] ?? '?')))].sort();
    throw new EnvError(names);
  }
  return r.data;
}

/** Comma separated origins, trimmed, without trailing slash; dev origins outside production. */
export function allowedOrigins(env: Pick<AppEnv, 'ALLOWED_ORIGINS' | 'NODE_ENV'>): string[] {
  const list = env.ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o) => o !== '');
  if (env.NODE_ENV !== 'production') list.push(...DEV_ORIGINS);
  return [...new Set(list)];
}
