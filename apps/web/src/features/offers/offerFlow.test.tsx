import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/endpoints';
import { queryClient } from '@/api/queryClient';
import { resetMockApi, server } from '@/mocks/server';
import { routeTable } from '@/routes/router';
import { ADDR, loginAs, logout } from '@/test/helpers';

vi.mock('@/chain/operation', async (orig) => ({
  ...(await orig<typeof import('@/chain/operation')>()),
  runOperation: async (
    p: { kind: 'create' | 'accept' | 'reclaim'; offerIdHex: string },
    onStep: (s: string) => void,
  ) => {
    onStep('sign');
    const { applyChainOperation } = await import('@/mocks/db');
    return applyChainOperation(p.kind, p.offerIdHex);
  },
}));

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => resetMockApi());
afterEach(() => {
  logout();
  queryClient.clear();
  server.resetHandlers();
});
afterAll(() => server.close());

function renderAt(path: string) {
  const router = createMemoryRouter(routeTable, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

async function invoiceId(role: 'supplier' | 'buyer', number: string) {
  const found = (await api.invoices(role)).find((i) => i.number === number);
  if (!found) throw new Error('seed missing');
  return found.id;
}

describe('offer lifecycle through the screens', () => {
  it('buyer reserves 985 USDC for 1 000 at 1,5 %; supplier then collects it', async () => {
    await loginAs(ADDR.buyer);
    const id = await invoiceId('buyer', '123');
    const router = renderAt(`/pagar/${id}/oferta`);

    const reserve = await screen.findByRole('button', { name: /Reservar 985 USDC/ });
    expect(screen.getByText(/equivale a 18,5/)).toBeInTheDocument();
    await userEvent.click(reserve);
    expect(await screen.findByText('Confirmado')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/pagar/${id}`));
    expect((await api.invoice(id)).displayStatus).toBe('offer_open');

    logout();
    queryClient.clear();
    await loginAs(ADDR.supplier);
    renderAt(`/cobrar/${id}`);
    await userEvent.click(await screen.findByRole('button', { name: /Cobrar 985/ }));
    expect(await screen.findByText('Confirmado')).toBeInTheDocument();
    await waitFor(async () => expect((await api.invoice(id)).displayStatus).toBe('collected'));
  });

  it('changing the discount updates what the buyer pays today', async () => {
    await loginAs(ADDR.buyer);
    const id = await invoiceId('buyer', '123');
    renderAt(`/pagar/${id}/oferta`);
    await userEvent.click(await screen.findByRole('button', { name: '2 %' }));
    expect(await screen.findByRole('button', { name: /Reservar 980 USDC/ })).toBeInTheDocument();
  });

  it('home lists "Requiere tu acción" first for the supplier', async () => {
    await loginAs(ADDR.supplier);
    renderAt('/app');
    expect(await screen.findByText('Requiere tu acción')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Nueva factura/ }).length).toBeGreaterThan(0);
  });
});
