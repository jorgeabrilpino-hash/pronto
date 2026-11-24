// Health check: connects (with retries), reads basic facts and reports latency. Prints no secrets.
//   pnpm db:ping
import { withConnection } from './db.mjs';

const started = Date.now();
try {
  const info = await withConnection(
    async (client) => {
      const { rows } = await client.query(
        `select current_user as role, split_part(version(), ' ', 2) as postgres,
                (select count(*) from information_schema.tables where table_schema = 'public')::int as tables`,
      );
      return rows[0];
    },
    { attempts: 4 },
  );
  console.log(`db ok in ${Date.now() - started} ms`, info);
} catch (err) {
  console.error(`db unreachable after ${Date.now() - started} ms: ${err.code ?? err.message}`);
  process.exitCode = 1;
}
