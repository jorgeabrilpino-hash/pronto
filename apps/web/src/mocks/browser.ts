import { setupWorker } from 'msw/browser';
import { resetDb } from './db';
import { handlers } from './handlers';

/** Starts the mock API in the browser (VITE_USE_MOCKS=true). */
export async function startMocks(): Promise<void> {
  resetDb();
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true });
}
