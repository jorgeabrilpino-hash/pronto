import type { DisplayStatus, Invoice, Role } from '@pronto/shared';
import type { ReactNode } from 'react';
import { Chip } from '@/components/Chip';
import { IconAlert, IconBolt, IconCheck, IconClock, IconDot, IconReturn } from '@/components/icons';
import { daysUntil } from '@/lib/format';

type Tone = 'neutral' | 'green' | 'gold' | 'danger' | 'muted-outline';

interface View {
  label: string;
  tone: Tone;
  icon: ReactNode;
}

/** Each role reads the single state machine with its own words (FLUJO_V2 section 4). */
export function statusView(inv: Invoice, role: Role): View {
  const s: DisplayStatus = inv.displayStatus;
  const supplier = role === 'supplier';
  switch (s) {
    case 'sent':
      return {
        label: supplier ? 'Esperando confirmación' : 'Por confirmar',
        tone: 'muted-outline',
        icon: <IconDot size={14} />,
      };
    case 'rejected':
      return { label: 'Revisar', tone: 'danger', icon: <IconAlert size={14} /> };
    case 'confirmed':
      return { label: 'Confirmada', tone: 'green', icon: <IconCheck size={14} /> };
    case 'offer_open': {
      const days = inv.offer ? daysUntil(inv.offer.expiresAt) : 0;
      return {
        label: supplier ? 'Te ofrecen pagar hoy' : `Reservado · vence en ${days} d`,
        tone: 'gold',
        icon: <IconBolt size={14} />,
      };
    }
    case 'collected':
      return {
        label: supplier ? 'Cobrada' : 'Pagada',
        tone: 'green',
        icon: <IconCheck size={14} />,
      };
    case 'offer_expired':
      return {
        label: supplier ? 'Oferta vencida' : 'Recuperar',
        tone: 'muted-outline',
        icon: <IconClock size={14} />,
      };
    case 'cancelled':
      return { label: 'Cancelada', tone: 'muted-outline', icon: <IconReturn size={14} /> };
  }
}

export function StatusChip({ inv, role }: { inv: Invoice; role: Role }) {
  const v = statusView(inv, role);
  return (
    <Chip tone={v.tone} icon={v.icon}>
      {v.label}
    </Chip>
  );
}

/** "Requiere tu acción": the next move is yours. */
export function needsAction(inv: Invoice, role: Role): boolean {
  const s = inv.displayStatus;
  if (role === 'supplier') return s === 'offer_open' || s === 'rejected';
  return s === 'sent' || s === 'offer_expired';
}

export function detailPath(inv: Invoice, role: Role): string {
  return role === 'supplier' ? `/cobrar/${inv.id}` : `/pagar/${inv.id}`;
}
