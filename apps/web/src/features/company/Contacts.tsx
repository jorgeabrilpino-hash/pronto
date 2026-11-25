import type { Role } from '@pronto/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '@/api/endpoints';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Screen } from '@/components/Screen';

const TABS: Array<{ role: Role; label: string }> = [
  { role: 'supplier', label: 'Mis clientes' },
  { role: 'buyer', label: 'Mis proveedores' },
];

/** View 12: contacts that build themselves from the invoices you exchange. */
export function Contacts() {
  const [role, setRole] = useState<Role>('supplier');
  const q = useQuery({ queryKey: ['contacts', role], queryFn: () => api.contacts(role) });
  return (
    <Screen title="Contactos">
      <div role="tablist" aria-label="Contactos" className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.role}
            type="button"
            role="tab"
            aria-selected={t.role === role}
            onClick={() => setRole(t.role)}
            className={`min-h-11 flex-1 rounded-full border px-4 text-[15px] font-semibold ${
              t.role === role ? 'border-ink bg-ink text-ivory' : 'border-line bg-ivory text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {q.isError ? <ErrorNotice error={q.error} onAction={() => q.refetch()} /> : null}
      {q.data?.length === 0 ? (
        <p className="py-8 text-center text-muted">Aún no tienes contactos</p>
      ) : null}
      <ul>
        {q.data?.map((c) => (
          <li key={c.id}>
            <Link
              to={`/e/${c.code}`}
              className="flex min-h-[64px] flex-col justify-center border-b border-line px-1 active:bg-[#f2ede1]"
            >
              <span className="font-semibold">{c.legalName}</span>
              <span className="tabular text-sm text-muted">
                {c.code} · RUC {c.ruc}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
