import type { Role } from '@pronto/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '@/api/endpoints';

const lastReconcile = new Map<string, number>();

/** Lists invoices for one side; quietly reconciles open or pending offers (max once per 15 s each). */
export function useInvoices(role: Role) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['invoices', role], queryFn: () => api.invoices(role) });

  useEffect(() => {
    const now = Date.now();
    const due = (q.data ?? []).flatMap((i) =>
      i.offer && ['pending', 'open'].includes(i.offer.chainStatus) ? [i.offer.offerIdHex] : [],
    );
    const stale = due.filter((id) => now - (lastReconcile.get(id) ?? 0) > 15_000);
    if (stale.length === 0) return;
    for (const id of stale) lastReconcile.set(id, now);
    void Promise.allSettled(stale.map((id) => api.reconcileOffer(id))).then((r) => {
      if (r.some((x) => x.status === 'fulfilled')) {
        void qc.invalidateQueries({ queryKey: ['invoices'] });
      }
    });
  }, [q.data, qc]);

  return q;
}

export function useInvoice(id: string) {
  return useQuery({ queryKey: ['invoice', id], queryFn: () => api.invoice(id) });
}
