// Generates Kysely types from the live database into supabase/generated/db.ts.
//   numeric -> string (money is never a JS number); date -> string (ISO yyyy-mm-dd).
// The runtime must match: pg returns numeric as string by default, but date (OID 1082) needs
//   pg.types.setTypeParser(1082, (value) => value)
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Kysely, PostgresDialect as KyselyPostgresDialect } from 'kysely';
import kyselyCodegen from 'kysely-codegen';
import pg from 'pg';
import { clientConfig, repoRoot, retry } from './db.mjs';

const { generate, PostgresDialect } = kyselyCodegen;

const outFile = resolve(repoRoot, 'supabase', 'generated', 'db.ts');
mkdirSync(resolve(repoRoot, 'supabase', 'generated'), { recursive: true });

async function run() {
  const pool = new pg.Pool({ ...clientConfig(), max: 1 });
  pool.on('error', () => {});
  const db = new Kysely({ dialect: new KyselyPostgresDialect({ pool }) });
  try {
    await generate({
      db,
      dialect: new PostgresDialect({ numericParser: 'string', dateParser: 'string' }),
      outFile,
      defaultSchemas: ['public'],
      includePattern: 'public.*',
      excludePattern: 'public.pronto_migrations',
      logger: undefined,
    });
    console.log('types: supabase/generated/db.ts');
  } finally {
    await db.destroy().catch(() => {});
  }
}

try {
  await retry(run);
} catch (err) {
  console.error(`types failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
