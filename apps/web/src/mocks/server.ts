import { setupServer } from 'msw/node';
import { mockConfig } from './config';
import { resetDb } from './db';
import { handlers } from './handlers';

export const server = setupServer(...handlers);

/** Test helper: fresh seeded data and no artificial latency. */
export function resetMockApi(): void {
  mockConfig.latencyMs = 0;
  resetDb();
}
