// Shared database helper for the supabase/ scripts and tests.
// Connects with DATABASE_URL only (never the Supabase Data API). The value is never printed.
// If DATABASE_URL is not already set, it is loaded from the local secrets file that lives outside
// the repository (override the location with PRONTO_ENV_FILE).
//
// Resilience (home internet drops): every connection has a timeout and TCP keep-alive, and
// connect()/withConnection()/retry() retry transient network failures with exponential backoff.
// TLS is verified against Supabase's root CA, pinned in supabase/certs (public certificate).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(here, '..', '..');
export const migrationsDir = resolve(repoRoot, 'supabase', 'migrations');
export const seedFile = resolve(repoRoot, 'supabase', 'seed.sql');
export const caFile =
  process.env.PGSSLROOTCERT ?? resolve(repoRoot, 'supabase', 'certs', 'prod-ca-2021.crt');

export function loadEnvIfNeeded() {
  if (process.env.DATABASE_URL) return;
  const file = process.env.PRONTO_ENV_FILE ?? resolve(repoRoot, '..', '.secrets', 'pronto.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

function isLocalUrl(connectionString) {
  try {
    const host = new URL(connectionString).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  } catch {
    return false;
  }
}

/** Verified TLS for remote databases; only a localhost database (for example Docker) skips TLS. */
export function sslOptions(connectionString) {
  if (isLocalUrl(connectionString)) return false;
  return { ca: readFileSync(caFile, 'utf8'), rejectUnauthorized: true };
}

export function clientConfig() {
  loadEnvIfNeeded();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set (load it with node --env-file or PRONTO_ENV_FILE)');
  }
  return {
    connectionString,
    ssl: sslOptions(connectionString),
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    statement_timeout: 120_000,
    query_timeout: 130_000,
  };
}

export function createClient() {
  return new pg.Client(clientConfig());
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
  '57P01', // admin shutdown
  '57P02', // crash shutdown
  '57P03', // cannot connect now
  '08000',
  '08003',
  '08006',
  '53300', // too many connections
]);

/** True for network drops and server restarts. A statement timeout (57014) is not retried. */
export function isTransient(err) {
  if (!err) return false;
  if (err.code === '57014') return false;
  if (TRANSIENT_CODES.has(err.code)) return true;
  return /timeout|timed out|terminated|ECONNRESET|socket hang up|EAI_AGAIN/i.test(
    String(err.message),
  );
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Runs `fn`, retrying transient failures with exponential backoff (1s, 2s, 4s ... up to 15s). */
export async function retry(
  fn,
  { attempts = 6, baseDelayMs = 1_000, log = (line) => console.error(line) } = {},
) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (!isTransient(err) || attempt >= attempts) throw err;
      const delay =
        Math.min(15_000, baseDelayMs * 2 ** (attempt - 1)) + Math.floor(Math.random() * 500);
      log(
        `db: attempt ${attempt}/${attempts} failed (${err.code ?? 'network'}); retrying in ${Math.round(delay / 1000)}s`,
      );
      await sleep(delay);
    }
  }
}

/** Opens a connection, retrying transient failures. The caller must call client.end(). */
export async function connect(options) {
  return retry(async () => {
    const client = createClient();
    // An idle connection that the network drops emits 'error'; without a listener Node would crash.
    client.on('error', () => {});
    try {
      await client.connect();
      return client;
    } catch (err) {
      await client.end().catch(() => {});
      throw err;
    }
  }, options);
}

/**
 * Connects, runs `fn(client)` and always closes the connection. If the connection drops mid-way,
 * the whole of `fn` runs again on a new connection, so `fn` must be safe to repeat
 * (migrations and the seed are: each runs in one transaction and is tracked or idempotent).
 */
export async function withConnection(fn, options) {
  return retry(async () => {
    const client = await connect({ ...options, attempts: 1 });
    try {
      return await fn(client);
    } finally {
      await client.end().catch(() => {});
    }
  }, options);
}
