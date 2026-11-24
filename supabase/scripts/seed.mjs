// Loads supabase/seed.sql (demo data) in one transaction. Idempotent: safe to run repeatedly,
// including after a dropped connection (the server rolls back an unfinished transaction).
import { readFileSync } from 'node:fs';
import { seedFile, withConnection } from './db.mjs';

async function run(client) {
  await client.query('begin');
  try {
    await client.query(readFileSync(seedFile, 'utf8'));
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  }
  const { rows } = await client.query(
    `select (select count(*) from public.companies)::int as companies,
            (select count(*) from public.invoices)::int as invoices,
            (select count(*) from public.attachments)::int as attachments,
            (select count(*) from public.offers)::int as offers`,
  );
  console.log('seed ok', rows[0]);
}

try {
  await withConnection(run);
} catch (err) {
  console.error(`seed failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
