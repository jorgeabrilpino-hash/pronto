import { QueryClient } from '@tanstack/react-query';
import { isApiError } from './errors';
import { sessionStore } from './session';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !isApiError(error) && count < 2,
    },
  },
});

let lastAddress = sessionStore.get()?.address ?? null;

/** Cached data belongs to one account: drop it all when the identity changes or ends. */
sessionStore.subscribe(() => {
  const next = sessionStore.get()?.address ?? null;
  if (next === lastAddress) return;
  lastAddress = next;
  void queryClient.cancelQueries();
  queryClient.clear();
});
