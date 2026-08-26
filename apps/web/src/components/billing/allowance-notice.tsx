import Link from 'next/link';
import { Users } from 'lucide-react';
import type { PublicSubscription } from '@gart/shared';

import { buttonClasses } from '@/components/ui';
import { cx } from '@/lib/cx';

/**
 * What to show when the client allowance is full.
 *
 * Deliberately not an error. Nothing has gone wrong and nothing is lost — the
 * trial simply holds three clients, and there are two ways on. It names both,
 * because a limit that only says «no» leaves a trainer stuck with a product
 * they were in the middle of evaluating.
 */
export function AllowanceNotice({ subscription }: { subscription: PublicSubscription }) {
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-panel border border-accent/30 bg-accent-subtle p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3.5">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-accent-text">
          <Users aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-text">
            У пробному періоді — {String(subscription.maxClients ?? 0)} клієнтів
          </p>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-text-secondary">
            Усі ваші клієнти на місці й працюють як зазвичай. Щоб додавати нових, оформіть підписку
            — на тарифі клієнтів без обмежень. Або перенесіть в архів того, з ким уже не працюєте.
          </p>
        </div>
      </div>
      <Link
        href="/dashboard/billing"
        className={cx(buttonClasses('primary', 'md'), 'shrink-0 justify-center')}
      >
        Оформити підписку
      </Link>
    </div>
  );
}
