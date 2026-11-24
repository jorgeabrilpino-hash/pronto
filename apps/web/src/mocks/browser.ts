import { getResponse } from 'msw';
import { resetDb } from './db';
import { handlers } from './handlers';

/**
 * Starts the mock API in the browser (VITE_USE_MOCKS=true).
 * It patches `fetch` and answers from the MSW handlers, so no Service Worker is needed
 * (works in any browser pane and in a Vercel preview). Other requests pass through.
 */
export async function startMocks(): Promise<void> {
  resetDb();
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const request = new Request(input, init);
    const mocked = await getResponse(handlers, request.clone());
    return mocked ?? real(request);
  };
}
