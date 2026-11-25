import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Loads the owner's secrets file (outside the repository) so the integration tests can reach the
// real database and storage. Values are never printed. Without the file those tests skip.
const here = dirname(fileURLToPath(import.meta.url));
const file =
  process.env.PRONTO_ENV_FILE ?? resolve(here, '..', '..', '..', '.secrets', 'pronto.env');

if (!process.env.DATABASE_URL && existsSync(file)) {
  process.loadEnvFile(file);
}
