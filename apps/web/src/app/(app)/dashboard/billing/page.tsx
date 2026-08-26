'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatMoney, type PublicPayment, type PublicSubscription } from '@gart/shared';
import type { SubscriptionPeriod, SubscriptionPlan } from '@gart/shared';

import { PlanCards } from '@/components/billing/plan-cards';
import { SubscriptionSummary } from '@/components/billing/subscription-summary';
import { PageHeader } from '@/components/layout/page-header';
import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  EmptyState,
  Modal,
  RowsSkeleton,
  Select,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import {
  cancelSubscription,
  changePeriod,
  getSubscription,
  listPayments,
  openCheckout,
  PAYMENT_STATUS_LABELS,
  PERIOD_OPTIONS,
  PLAN_LABELS,
  reactivateSubscription,
} from '@/lib/billing';
import { formatRecordDate } from '@/lib/dates';

const PAYMENT_TONES: Record<PublicPayment['status'], BadgeTone> = {
  PENDING: 'neutral',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  REFUNDED: 'warning',
};

/**
 * The billing area, and the entry point «Платежі» in the nav now points at.
 *
 * Everything the trainer can do to their own subscription is reachable from
 * here: subscribe, change the cadence, cancel, resume, and read every charge
 * that has ever been made. An API with no way in is an unfinished feature, and
 * a subscription you cannot stop from the screen that sells it is a dark
 * pattern.
 */
export default function BillingPage() {
  const { notify } = useToast();

  const [subscription, setSubscription] = useState<PublicSubscription | null>();
  const [payments, setPayments] = useState<PublicPayment[]>();
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Bumped to re-run the load; the effect owns the fetch, so state is only ever
  // set from a settled promise rather than synchronously during the effect.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    Promise.all([getSubscription(), listPayments()])
      .then(([loadedSubscription, loadedPayments]) => {
        if (!active) return;
        setSubscription(loadedSubscription);
        setPayments(loadedPayments);
      })
      .catch((error: unknown) => {
        if (!active) return;
        // Without this an API failure leaves the skeleton up for ever.
        setSubscription(null);
        setPayments([]);
        notify(
          error instanceof ApiError ? error.message : 'Не вдалося завантажити підписку',
          'danger',
        );
      });

    return () => {
      active = false;
    };
  }, [reloadKey, notify]);

  /** Runs an action, reports what went wrong, and refreshes what it changed. */
  const run = useCallback(
    async (action: () => Promise<unknown>, fallback: string) => {
      setBusy(true);

      try {
        await action();
        setReloadKey((key) => key + 1);
      } catch (error: unknown) {
        notify(error instanceof ApiError ? error.message : fallback, 'danger');
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );

  const subscribe = (plan: SubscriptionPlan, period: SubscriptionPeriod) => {
    void run(async () => {
      const { redirectUrl } = await openCheckout(plan, period);

      // The acquirer's own page. Nothing is granted until it reports back, so
      // the trainer is exactly where they were if they close the tab.
      window.location.assign(redirectUrl);
    }, 'Не вдалося відкрити оплату');
  };

  const loading = subscription === undefined || payments === undefined;

  return (
    <>
      <PageHeader title="Платежі" description="Ваша підписка на Gart, тариф і історія списань." />

      {loading ? (
        <RowsSkeleton count={4} />
      ) : (
        <div className="space-y-6">
          {subscription === null ? (
            <EmptyState
              title="Підписки ще немає"
              description="Оберіть тариф нижче, щоб почати роботу з Gart без обмежень."
            />
          ) : (
            <SubscriptionSummary subscription={subscription} />
          )}

          {subscription !== null && subscription.status === 'ACTIVE' && (
            <Card>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-base font-bold tracking-[-0.02em] text-text">
                    Періодичність оплати
                  </h2>
                  <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-text-secondary">
                    Зміна діє з наступного списання. Оплачений період залишається на тих самих
                    умовах — зараз нічого не списуємо і не повертаємо.
                  </p>
                </div>
                <label className="w-full shrink-0 sm:w-64">
                  <span className="sr-only">Періодичність оплати</span>
                  <Select
                    options={PERIOD_OPTIONS}
                    disabled={busy}
                    value={subscription.pendingPeriod ?? subscription.period}
                    onChange={(event) => {
                      void run(
                        () => changePeriod(event.target.value as SubscriptionPeriod),
                        'Не вдалося змінити періодичність',
                      );
                    }}
                  />
                </label>
              </div>
            </Card>
          )}

          <div>
            <h2 className="pb-3 text-base font-bold tracking-[-0.02em] text-text">Тарифи</h2>
            <PlanCards
              currentPlan={
                subscription !== null && subscription.status !== 'TRIALING'
                  ? subscription.plan
                  : null
              }
              blockedReason={
                subscription?.canReactivate === true
                  ? 'Ваша скасована підписка ще діє — відновіть її нижче, щоб не втратити решту оплаченого періоду.'
                  : undefined
              }
              busy={busy}
              onSubscribe={subscribe}
            />
          </div>

          {subscription !== null &&
            (subscription.canReactivate ? (
              <Card>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm leading-relaxed text-text-secondary">
                    Підписку скасовано, але доступ ще триває до{' '}
                    {formatRecordDate(subscription.accessUntil)}. Її можна відновити.
                  </p>
                  <Button
                    variant="primary"
                    loading={busy}
                    onClick={() => {
                      void run(reactivateSubscription, 'Не вдалося відновити підписку');
                    }}
                  >
                    Відновити підписку
                  </Button>
                </div>
              </Card>
            ) : (
              (subscription.status === 'ACTIVE' || subscription.status === 'PAST_DUE') && (
                <Card>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm leading-relaxed text-text-secondary">
                      Більше не потрібно? Скасуйте підписку — доступ триватиме до кінця оплаченого
                      періоду.
                    </p>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setConfirmCancel(true);
                      }}
                    >
                      Скасувати підписку
                    </Button>
                  </div>
                </Card>
              )
            ))}

          <div>
            <h2 className="pb-3 text-base font-bold tracking-[-0.02em] text-text">
              Історія списань
            </h2>
            {payments.length === 0 ? (
              <EmptyState
                title="Списань ще не було"
                description="Тут з’являться всі платежі за вашу підписку на Gart."
              />
            ) : (
              <Table caption="Історія списань за підписку на Gart">
                <Thead>
                  <Tr>
                    <Th>Дата</Th>
                    <Th>Тариф</Th>
                    <Th>Сума</Th>
                    <Th>Статус</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {payments.map((payment) => (
                    <Tr key={payment.id}>
                      <Td>{formatRecordDate(payment.paidAt ?? payment.createdAt)}</Td>
                      <Td>{payment.plan === null ? '—' : `Gart ${PLAN_LABELS[payment.plan]}`}</Td>
                      <Td>
                        <span className="tabular-nums">{formatMoney(payment.amount)}</span>
                      </Td>
                      <Td>
                        <Badge tone={PAYMENT_TONES[payment.status]}>
                          {PAYMENT_STATUS_LABELS[payment.status]}
                        </Badge>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </div>
        </div>
      )}

      <Modal
        open={confirmCancel}
        onClose={() => {
          setConfirmCancel(false);
        }}
        title="Скасувати підписку?"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirmCancel(false);
              }}
            >
              Залишити
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => {
                void run(cancelSubscription, 'Не вдалося скасувати підписку').then(() => {
                  setConfirmCancel(false);
                });
              }}
            >
              Скасувати підписку
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-text-secondary">
          Наступних списань не буде. Доступ триватиме до{' '}
          {subscription === null || subscription === undefined
            ? '—'
            : formatRecordDate(subscription.accessUntil)}
          , а гроші за вже оплачений період не повертаються. Відновити підписку можна до цієї дати.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          Ваші клієнти нічого не втратять — вони продовжать тренуватися як зазвичай.
        </p>
      </Modal>
    </>
  );
}
