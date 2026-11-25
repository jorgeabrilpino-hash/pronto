import type { OpenAPIHono } from '@hono/zod-openapi';
import { DomainError } from '@pronto/shared';
import type { Context } from 'hono';
import { JwtTokenService, StellarSignatureVerifier } from '../adapters/auth';
import { createHttpApp, type HttpEnv } from '../adapters/http';
import { createMemoryAdapters, type MemoryAdapters } from '../adapters/memory';
import { createDatabase, createPostgresAdapters } from '../adapters/postgres';
import { FetchJsonRpcTransport, StellarChainReader } from '../adapters/stellar';
import { SupabaseFileStorage } from '../adapters/storage';
import { CryptoIdGenerator, SystemClock } from '../adapters/system';
import type { ExtractedInvoice, InvoiceExtractor } from '../application/ports';
import { createUseCases, type Ports, type UseCases } from '../application/use-cases';
import { allowedOrigins, parseEnv } from './env';

export { type AppEnv, allowedOrigins, DEV_ORIGINS, EnvError, EnvSchema, parseEnv } from './env';

/**
 * Composition root: the only place that knows every adapter. `createApp` wires the real ones
 * (Postgres, Supabase Storage, Stellar TESTNET RPC, JWT); `createTestApp` the memory ones.
 */

/** Use case 16 is not built yet: extraction fails with a clear, typed error. */
export class UnavailableInvoiceExtractor implements InvoiceExtractor {
  async extract(_file: { bytes: Uint8Array; mime: string }): Promise<ExtractedInvoice> {
    throw new DomainError(
      'FEATURE_UNAVAILABLE',
      'Invoice extraction (XML and AI) is not available',
    );
  }
}

export interface AppOptions {
  /** Origins added to ALLOWED_ORIGINS (the dev server adds the Vite ones). */
  extraOrigins?: readonly string[];
  log?: (line: string) => void;
  socketIp?: (c: Context) => string | undefined;
}

export interface App {
  app: OpenAPIHono<HttpEnv>;
  useCases: UseCases;
  extractor: InvoiceExtractor;
  /** Closes the database pool. */
  close(): Promise<void>;
}

export function createApp(
  source: Record<string, string | undefined>,
  options: AppOptions = {},
): App {
  const env = parseEnv(source);
  const clock = new SystemClock();
  const ids = new CryptoIdGenerator();
  const database = createDatabase(env.DATABASE_URL, { max: 5 });
  const pg = createPostgresAdapters(database.db, { ids, clock });
  const ports: Ports = {
    ...pg,
    storage: new SupabaseFileStorage({
      url: env.SUPABASE_URL,
      serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
      clock,
    }),
    chain: new StellarChainReader({
      contractId: env.PRONTO_CONTRACT_ID,
      transport: new FetchJsonRpcTransport({ url: env.STELLAR_RPC_URL }),
      networkPassphrase: env.STELLAR_NETWORK_PASSPHRASE,
    }),
    signatures: new StellarSignatureVerifier({
      clock,
      networkPassphrase: env.STELLAR_NETWORK_PASSPHRASE,
    }),
    tokens: new JwtTokenService(env.JWT_SECRET, clock),
    clock,
    ids,
  };
  const useCases = createUseCases(ports);
  const origins = [...allowedOrigins(env), ...(options.extraOrigins ?? [])];
  const app = createHttpApp({
    useCases,
    clock,
    allowedOrigins: origins,
    ...(options.log === undefined ? {} : { log: options.log }),
    ...(options.socketIp === undefined ? {} : { socketIp: options.socketIp }),
  });
  return { app, useCases, extractor: new UnavailableInvoiceExtractor(), close: database.close };
}

export interface TestApp {
  app: OpenAPIHono<HttpEnv>;
  adapters: MemoryAdapters;
  useCases: UseCases;
  /** JSON log lines written by the app. */
  logs: string[];
}

/** Same HTTP app over the memory adapters; nothing leaves the process. */
export function createTestApp(
  options: { start?: Date; allowedOrigins?: readonly string[] } = {},
): TestApp {
  const adapters = createMemoryAdapters(options.start);
  const useCases = createUseCases(adapters);
  const logs: string[] = [];
  const app = createHttpApp({
    useCases,
    clock: adapters.clock,
    allowedOrigins: options.allowedOrigins ?? ['http://localhost:5173'],
    log: (line) => logs.push(line),
    socketIp: () => '127.0.0.1',
  });
  return { app, adapters, useCases, logs };
}
