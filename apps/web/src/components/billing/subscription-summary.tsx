import { AlertTriangle, CalendarClock, CircleCheck, Clock, Users } from 'lucide-react';
import { formatMoney, type PublicSubscription } from '@gart/shared';

import { Badge, type BadgeTone, Card } from '@/components/ui';
import { formatRecordDate } from '@/lib/dates';
import { PERIOD_LABELS, PLAN_LABELS, STATUS_LABELS } from '@/lib/billing';

/**
 * Every state says the same three things: what is happening, until when, and
 * what the trainer can do about it.
 *
 * The dates are the point. «Оплата не пройшла» on its own is alarming and
 * useless; «оплата не пройшла, доступ до 12 вересня, спробуємо ще раз» is
 * something a person can plan around, which is the difference between a
 * warning and a threat.
 */
const TONES: Record<PublicSubscription['status'], BadgeTone> = {
  TRIALING: 'accent',
  ACTIVE: 'success',
  PAST_DUE: 'warning',
  CANCELLED: 'neutral',
  ENDED: 'danger',
};

function describe(subscription: PublicSubscription): { headline: string; detail: string } {
  const until = formatRecordDate(subscription.accessUntil);

  switch (subscription.status) {
    case 'TRIALING':
      return {
        headline: `Пробний період до ${until}`,
        detail:
          'Картку не потрібно — після завершення нічого не спишеться. ' +
          'Оформіть підписку будь-коли, щоб продовжити роботу без обмежень.',
      };
    case 'ACTIVE':
      return {
        headline: `Підписка активна до ${until}`,
        detail:
          subscription.nextChargeAt === null
            ? 'Наступне списання не заплановано.'
            : `Наступне списання ${formatRecordDate(subscription.nextChargeAt)} — ` +
              `${formatMoney(subscription.price)}.`,
      };
    case 'PAST_DUE':
      return {
        headline: `Оплата не пройшла — доступ до ${until}`,
        detail:
          subscription.nextChargeAt === null
            ? 'Спроби списання вичерпано. Оформіть підписку знову, щоб відновити доступ.'
            : `Спробуємо ще раз ${formatRecordDate(subscription.nextChargeAt)}. ` +
              'Перевірте картку — ваші клієнти тим часом працюють як зазвичай.',
      };
    case 'CANCELLED':
      return {
        headline: `Скасовано — доступ до ${until}`,
        detail: subscription.canReactivate
          ? 'Більше нічого не спишеться. Можна відновити підписку до цієї дати.'
          : 'Більше нічого не спишеться.',
      };
    case 'ENDED':
      return {
        headline: 'Підписку завершено',
        detail:
          'Робочий простір у режимі перегляду: усі дані на місці, ваші клієнти тренуються ' +
          'як зазвичай. Оформіть підписку, щоб знову вносити зміни.',
      };
  }
}

const ICONS: Record<PublicSubscription['status'], typeof Clock> = {
  TRIALING: Clock,
  ACTIVE: CircleCheck,
  PAST_DUE: AlertTriangle,
  CANCELLED: CalendarClock,
  ENDED: AlertTriangle,
};

export function SubscriptionSummary({ subscription }: { subscription: PublicSubscription }) {
  const { headline, detail } = describe(subscription);
  const Icon = ICONS[subscription.status];
  const paid = subscription.status !== 'TRIALING' && subscription.status !== 'ENDED';

  return (
    <Card tone="raised">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent-text">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold tracking-[-0.02em] text-text">{headline}</h2>
              <Badge tone={TONES[subscription.status]}>{STATUS_LABELS[subscription.status]}</Badge>
            </div>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-text-secondary">{detail}</p>

            {subscription.pendingPeriod !== null && (
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                З наступного списання періодичність зміниться на «
                {PERIOD_LABELS[subscription.pendingPeriod].toLowerCase()}». Поточний період
                залишається без змін — нічого не перераховуємо і не списуємо зараз.
              </p>
            )}
          </div>
        </div>

        <dl className="shrink-0 space-y-1 text-sm sm:text-right">
          <div>
            <dt className="sr-only">Тариф</dt>
            <dd className="font-bold text-text">
              Gart {PLAN_LABELS[subscription.plan]}
              {paid && ` · ${formatMoney(subscription.price)}`}
            </dd>
          </div>
          {paid && (
            <div>
              <dt className="sr-only">Періодичність</dt>
              <dd className="text-text-secondary">{PERIOD_LABELS[subscription.period]}</dd>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-text-secondary sm:justify-end">
            <Users aria-hidden="true" className="size-3.5" />
            <dt className="sr-only">Клієнти</dt>
            <dd>
              {subscription.maxClients === null
                ? `${String(subscription.clientCount)} — без обмежень`
                : `${String(subscription.clientCount)} з ${String(subscription.maxClients)}`}
            </dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}
