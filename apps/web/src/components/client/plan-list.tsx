import { WORKOUT_TYPE_LABELS, type ClientAssignment } from '@gart/shared';

import { Badge } from '@/components/ui';
import { scheduleLine } from '@/lib/workout-format';

/** «Мій план» — the client's active programs and when they train. */
export function PlanList({ plans }: { plans: ClientAssignment[] }) {
  if (plans.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border-strong bg-surface px-4 py-7 text-center text-sm text-text-secondary shadow-e1">
        Активних програм немає.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface shadow-e1">
      {plans.map((plan) => (
        <li key={plan.id} className="px-4 py-4 transition-colors hover:bg-bg-subtle/60">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-bold text-text">{plan.name}</span>
            <Badge tone="neutral">{WORKOUT_TYPE_LABELS[plan.type]}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-text-secondary">
            {scheduleLine(plan)} · {plan.exerciseCount} вправ
          </p>
        </li>
      ))}
    </ul>
  );
}
