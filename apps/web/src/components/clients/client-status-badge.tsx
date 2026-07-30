import type { ClientStatus } from '@gart/shared';

import { Badge, type BadgeTone } from '@/components/ui';
import { STATUS_LABELS } from '@/lib/clients';

const TONES: Record<ClientStatus, BadgeTone> = {
  INVITED: 'warning',
  ACTIVE: 'success',
  ARCHIVED: 'neutral',
};

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return <Badge tone={TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}
