// Applies supabase/migrations/*.sql in filename order, once each, tracked in public.pronto_migrations
// (our own table; Supabase's supabase_migrations schema is not used). Each file runs in one transaction,
// so a dropped connection leaves nothing half applied and running the command again continues safely.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrationsDir, withConnection } from './db.mjs';

const TRACKING_DDL = `
  create table if not exists public.pronto_migrations (
    name       text primary key,
    checksum   text not null,
    applied_at timestamptz not null default now()
  );
  alter table public.pronto_migrations enable row level security;
  revoke all on public.pronto_migrations from anon, authenticated;
`;

async function run(client) {
  let applied = 0;
  await client.query(TRACKING_DDL);
  const done = new Map(
    (await client.query('select name, checksum from public.pronto_migrations')).rows.map((r) => [
      r.name,
      r.checksum,
    ]),
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const previous = done.get(file);
    if (previous !== undefined) {
      if (previous !== checksum) {
        throw new Error(`Migration ${file} was modified after being applied (checksum mismatch)`);
      }
      console.log(`skip   ${file}`);
      continue;
    }
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into public.pronto_migrations (name, checksum) values ($1, $2)', [
        file,
        checksum,
      ]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw err;
    }
    applied += 1;
    console.log(`apply  ${file}`);
  }
  console.log(`done: ${applied} applied, ${files.length - applied} already applied`);
}

try {
  await withConnection(run);
} catch (err) {
  console.error(`migrate failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
