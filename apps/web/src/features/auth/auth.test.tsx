import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/api/session';
import { NEW_ADDRESS, SUPPLIER_ADDRESS } from '@/mocks/addresses';
import { resetMockApi, server } from '@/mocks/server';
import { routeTable } from '@/routes/router';
import { selectMockAccount } from '@/wallet/mock';

vi.mock('@/chain/challenge', () => ({ assertChallenge: () => undefined }));
vi.mock('@/wallet', async () => ({ wallet: (await import('@/wallet/mock')).mockWallet }));

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => resetMockApi());
afterEach(() => {
  sessionStore.set(null);
  server.resetHandlers();
});
afterAll(() => server.close());

function renderAt(path: string) {
  const router = createMemoryRouter(routeTable, { initialEntries: [path] });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('sign in and registration', () => {
  it('a registered wallet goes straight to the app', async () => {
    selectMockAccount(SUPPLIER_ADDRESS);
    const router = renderAt('/');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/app'));
  });

  it('a new wallet registers, sees its code and QR, then continues to funds', async () => {
    selectMockAccount(NEW_ADDRESS);
    const router = renderAt('/');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/registro'));

    await userEvent.type(await screen.findByLabelText('RUC'), '20601234560');
    expect(await screen.findByText('Ese RUC no es válido')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('RUC'));
    await userEvent.type(screen.getByLabelText('RUC'), '20100070970');
    await userEvent.type(screen.getByLabelText('Razón social'), 'Taller Norte SAC');
    await userEvent.type(screen.getByLabelText('Rubro'), 'Metalmecánica');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar empresa' }));

    expect(await screen.findByText(/^PR-[2-9A-Z]{6}$/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^QR de PR-/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/fondos'));
  });

  it('protected routes send an anonymous visitor to the start', async () => {
    const router = renderAt('/app');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});
