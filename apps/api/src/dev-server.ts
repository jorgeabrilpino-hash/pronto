import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Local development server: http://127.0.0.1:8787 over the REAL adapters (Supabase database
 * and storage, Stellar TESTNET). Run with `pnpm --filter @pronto/api dev`.
 *
 * Node runs the TypeScript sources directly (type stripping plus transform types). The sources
 * use extensionless relative imports for the bundler, so a resolve hook adds `.ts` or
 * `/index.ts` when the plain specifier does not resolve. Only this file needs Node syntax.
 */

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      const relative = specifier.startsWith('./') || specifier.startsWith('../');
      if (relative && context.parentURL?.endsWith('.ts') === true) {
        for (const suffix of ['.ts', '/index.ts']) {
          try {
            return nextResolve(`${specifier}${suffix}`, context);
          } catch {
            // try the next candidate
          }
        }
      }
      throw err;
    }
  },
});

const here = dirname(fileURLToPath(import.meta.url));
// Same secrets file as vitest.setup.ts, outside the repository. Values are never printed.
const envFile =
  process.env.PRONTO_ENV_FILE ?? resolve(here, '..', '..', '..', '..', '.secrets', 'pronto.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
process.env.NODE_ENV ??= 'development';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 8787);

const compositionPath = './composition/index.ts';
const composition: typeof import('./composition') = await import(compositionPath);
const { serve } = await import('@hono/node-server');
const { getConnInfo } = await import('@hono/node-server/conninfo');

let built: ReturnType<typeof composition.createApp>;
try {
  built = composition.createApp(process.env, {
    extraOrigins: composition.DEV_ORIGINS,
    socketIp: (c) => getConnInfo(c).remote.address,
  });
} catch (err) {
  // EnvError lists variable names only; any other error prints its name, not its details.
  const message = err instanceof composition.EnvError ? err.message : String((err as Error).name);
  process.stderr.write(`Pronto API failed to start: ${message}\n`);
  process.exit(1);
}

const server = serve({ fetch: built.app.fetch, hostname: HOST, port: PORT }, (info) => {
  process.stdout.write(`Pronto API (TESTNET) on http://${HOST}:${info.port}\n`);
});

const shutdown = () => {
  server.close();
  void built.close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
