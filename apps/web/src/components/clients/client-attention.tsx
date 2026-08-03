import { ATTENTION_LABELS, type ClientListItem } from '@gart/shared';

import { Badge } from '@/components/ui';
import { localDateString, parseLocalDate } from '@/lib/dates';
import { pluralUk } from '@/lib/workout-format';

/** «сьогодні» / «вчора» / «3 дн. тому» — enough pulse to scan a list by. */
function sinceLabel(iso: string, now: Date): string {
  const days = Math.floor(
    (parseLocalDate(localDateString(now)).getTime() - parseLocalDate(iso.slice(0, 10)).getTime()) /
      86_400_000,
  );

  if (days <= 0) {
    return 'сьогодні';
  }
  if (days === 1) {
    return 'вчора';
  }

  return `${String(days)} ${pluralUk(days, 'день', 'дні', 'днів')} тому`;
}

/**
 * Why this client is worth opening. A stated skip reason outranks silence, and
 * a client with nothing to report shows only when they last trained.
 */
export function ClientAttention({ client, now }: { client: ClientListItem; now: Date }) {
  if (client.attention !== null) {
    return (
      <Badge tone={client.attention === 'SKIPPED' ? 'danger' : 'warning'}>
        {ATTENTION_LABELS[client.attention]}
      </Badge>
    );
  }

  if (client.lastLoggedAt === null) {
    return <span className="text-sm text-text-secondary">—</span>;
  }

  return (
    <span className="text-sm text-text-secondary">
      Тренувався {sinceLabel(client.lastLoggedAt, now)}
    </span>
  );
}
