import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from '../../../../../supabase/generated/db';
import { SUPABASE_ROOT_CA_2021 } from './ca';

/**
 * Postgres connection for the API. DATABASE_URL is parsed once into discrete fields; every query
 * parameter (sslmode, sslrootcert, host ...) is ignored so it cannot override the pinned TLS
 * settings. The connection string and its parts are never logged.
 */

// DATE (OID 1082) stays a "YYYY-MM-DD" string: no time zone shifts through a JS Date.
pg.types.setTypeParser(1082, (v: string) => v);

export type Database = Kysely<DB>;

export interface ConnectionTarget {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function parseDatabaseUrl(connectionString: string): ConnectionTarget {
  const url = new URL(connectionString);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use the postgres:// scheme');
  }
  const decode = (value: string) => decodeURIComponent(value);
  return {
    host: decode(url.hostname.replace(/^\[|\]$/g, '')),
    port: url.port ? Number(url.port) : 5432,
    user: decode(url.username),
    password: decode(url.password),
    database: decode(url.pathname.replace(/^\//, '')) || 'postgres',
  };
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export interface PoolOptions {
  /** Maximum open connections (serverless: keep it small). */
  max?: number;
  /** Server side statement timeout in milliseconds. */
  statementTimeoutMs?: number;
  /** Attempts to open a connection when the network fails transiently. */
  connectAttempts?: number;
  baseDelayMs?: number;
}

export function poolConfig(connectionString: string, options: PoolOptions = {}): pg.PoolConfig {
  const target = parseDatabaseUrl(connectionString);
  const statementTimeout = options.statementTimeoutMs ?? 30_000;
  return {
    ...target,
    ssl: isLocalHost(target.host)
      ? false
      : { ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true, servername: target.host },
    max: options.max ?? 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    statement_timeout: statementTimeout,
    query_timeout: statementTimeout + 5_000,
  };
}

const TRANSIENT_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  '57P01',
  '57P02',
  '57P03',
  '08000',
  '08003',
  '08006',
  '53300',
]);

/** Network drops and server restarts while OPENING a connection. Never used to replay a query. */
export function isTransientConnectError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (code === '57014') return false;
  if (typeof code === 'string' && TRANSIENT_CODES.has(code)) return true;
  const message = String((err as { message?: unknown }).message ?? '');
  return /timeout|timed out|terminated|ECONNRESET|socket hang up|EAI_AGAIN/i.test(message);
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * Pool facade for Kysely: `connect()` retries transient failures with exponential backoff.
 * Queries are never retried, so a write is never replayed.
 */
export function retryingPool(
  pool: pg.Pool,
  options: Pick<PoolOptions, 'connectAttempts' | 'baseDelayMs'> = {},
) {
  const attempts = options.connectAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  return {
    options: pool.options,
    async connect(): Promise<pg.PoolClient> {
      for (let attempt = 1; ; attempt++) {
        try {
          return await pool.connect();
        } catch (err) {
          if (!isTransientConnectError(err) || attempt >= attempts) throw err;
          await sleep(Math.min(5_000, baseDelayMs * 2 ** (attempt - 1)));
        }
      }
    },
    end(): Promise<void> {
      return pool.end();
    },
  };
}

export interface PostgresHandle {
  db: Database;
  pool: pg.Pool;
  close(): Promise<void>;
}

export function createDatabase(
  connectionString: string,
  options: PoolOptions = {},
): PostgresHandle {
  const pool = new pg.Pool(poolConfig(connectionString, options));
  // An idle client dropped by the network emits 'error'; without a listener Node would crash.
  pool.on('error', () => {});
  const db = new Kysely<DB>({
    dialect: new PostgresDialect({ pool: retryingPool(pool, options) }),
  });
  return { db, pool, close: () => db.destroy() };
}
