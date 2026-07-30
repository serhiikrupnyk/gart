import type { ClientStatus } from '@gart/shared';

import { STATUS_LABELS } from '@/lib/clients';

const STATUS_STYLES: Record<ClientStatus, string> = {
  INVITED: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  ARCHIVED: 'bg-neutral-100 text-neutral-600 ring-neutral-500/20',
};

export function StatusBadge({ status }: { status: ClientStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
