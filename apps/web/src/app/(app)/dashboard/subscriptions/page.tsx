'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DUNNING_MAX_ATTEMPTS,
  formatMoney,
  SUBSCRIPTION_PERIOD_LABELS,
  SUBSCRIPTION_STATUS_FILTERS,
  SUBSCRIPTION_STATUS_LABELS,
  type PublicSubscription,
  type SubscriptionStatus,
  type SubscriptionStatusFilter,
} from '@gart/shared';

import { PageHeader } from '@/components/layout/page-header';
import { PaymentTabs } from '@/components/layout/payment-tabs';
import {
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  Modal,
  Select,
  Table,
  TableSkeleton,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { formatRecordDate } from '@/lib/dates';
import { cancelSubscription, listSubscriptions, reactivateSubscription } from '@/lib/subscriptions';

const STATUS_TONES: Record<SubscriptionStatus, BadgeTone> = {
  ACTIVE: 'success',
  PAST_DUE: 'warning',
  CANCELLED: 'neutral',
  ENDED: 'neutral',
};

const FILTER_LABELS: Record<SubscriptionStatusFilter, string> = {
  all: 'Усі статуси',
  ACTIVE: SUBSCRIPTION_STATUS_LABELS.ACTIVE,
  PAST_DUE: SUBSCRIPTION_STATUS_LABELS.PAST_DUE,
  CANCELLED: SUBSCRIPTION_STATUS_LABELS.CANCELLED,
  ENDED: SUBSCRIPTION_STATUS_LABELS.ENDED,
};

export default function SubscriptionsPage() {
  const { notify } = useToast();

  const [status, setStatus] = useState<SubscriptionStatusFilter>('all');
  const [subscriptions, setSubscriptions] = useState<PublicSubscription[] | undefined>();
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [cancelTarget, setCancelTarget] = useState<PublicSubscription | undefined>();
  const [busyId, setBusyId] = useState<string | undefined>();

  const filterRef = useRef<HTMLSelectElement>(null);

  const retry = useCallback(() => {
    setSubscriptions(undefined);
    setReloadKey((key) => key + 1);
    filterRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;

    listSubscriptions(status)
      .then((loaded) => {
        if (!active) return;
        setSubscriptions(loaded);
        setFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setSubscriptions([]);
        setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [status, reloadKey]);

  async function confirmCancel(): Promise<void> {
    if (cancelTarget === undefined) return;

    setBusyId(cancelTarget.id);

    try {
      await cancelSubscription(cancelTarget.id);
      notify('Підписку скасовано', 'success');
      setCancelTarget(undefined);
      setSubscriptions(undefined);
      setReloadKey((key) => key + 1);
      filterRef.current?.focus();
    } catch (caught) {
      notify(caught instanceof ApiError ? caught.message : 'Не вдалося скасувати', 'danger');
      setCancelTarget(undefined);
    } finally {
      setBusyId(undefined);
    }
  }

  async function resume(subscription: PublicSubscription): Promise<void> {
    if (busyId !== undefined) return;

    setBusyId(subscription.id);

    try {
      await reactivateSubscription(subscription.id);
      notify('Підписку відновлено', 'success');
      setSubscriptions(undefined);
      setReloadKey((key) => key + 1);
      // The row this button lives in is about to be replaced by the skeleton,
      // and a blurred element drops focus to <body>. The filter outlives it.
      filterRef.current?.focus();
    } catch (caught) {
      notify(caught instanceof ApiError ? caught.message : 'Не вдалося відновити', 'danger');
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <>
      <PaymentTabs active="/dashboard/subscriptions" />

      <PageHeader
        title="Підписки"
        description="Хто на регулярній оплаті, коли наступне списання і що з ним не так."
        actions={
          <Select
            ref={filterRef}
            aria-label="Фільтр за статусом"
            value={status}
            options={SUBSCRIPTION_STATUS_FILTERS.map((value) => ({
              value,
              label: FILTER_LABELS[value],
            }))}
            onChange={(event) => {
              setSubscriptions(undefined);
              setStatus(event.target.value as SubscriptionStatusFilter);
            }}
          />
        }
      />

      <p aria-live="polite" className="sr-only">
        {subscriptions === undefined
          ? 'Завантаження підписок'
          : failed
            ? 'Не вдалося завантажити підписки'
            : `Показано підписок: ${String(subscriptions.length)}`}
      </p>

      {subscriptions === undefined ? (
        <TableSkeleton rows={4} columns={6} label="Завантаження підписок" />
      ) : failed ? (
        <EmptyState
          title="Не вдалося завантажити підписки"
          description="Перевірте з’єднання і спробуйте ще раз."
          action={
            <Button variant="primary" onClick={retry}>
              Спробувати ще раз
            </Button>
          }
        />
      ) : subscriptions.length === 0 ? (
        <EmptyState
          title={status === 'all' ? 'Підписок поки немає' : 'Немає підписок із цим статусом'}
          description={
            status === 'all'
              ? 'Виставте клієнту рахунок за продукт-підписку — вона з’явиться тут.'
              : 'Спробуйте інший фільтр.'
          }
        />
      ) : (
        <Table caption="Підписки ваших клієнтів">
          <Thead>
            <Tr>
              <Th>Клієнт</Th>
              <Th>Продукт</Th>
              <Th numeric>Ціна</Th>
              <Th>Статус</Th>
              <Th>Наступне списання</Th>
              <Th>Дії</Th>
            </Tr>
          </Thead>
          <Tbody>
            {subscriptions.map((subscription) => (
              <Tr key={subscription.id}>
                <Td>
                  <span className="font-semibold text-text">{subscription.clientName}</span>
                </Td>
                <Td>
                  {subscription.productName}
                  <span className="mt-0.5 block text-xs text-text-secondary">
                    {SUBSCRIPTION_PERIOD_LABELS[subscription.period]}
                  </span>
                </Td>
                <Td numeric>{formatMoney(subscription.price)}</Td>
                <Td>
                  <Badge tone={STATUS_TONES[subscription.status]}>
                    {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                  </Badge>
                  {subscription.failedAttempts > 0 && subscription.status === 'PAST_DUE' && (
                    <span className="mt-1 block text-xs text-text-secondary">
                      Спроба {subscription.failedAttempts} з {DUNNING_MAX_ATTEMPTS} · доступ до{' '}
                      {formatRecordDate(subscription.accessUntil)}
                    </span>
                  )}
                  {subscription.status === 'CANCELLED' && (
                    <span className="mt-1 block text-xs text-text-secondary">
                      Доступ до {formatRecordDate(subscription.accessUntil)}
                    </span>
                  )}
                </Td>
                <Td>
                  {subscription.nextChargeAt === null
                    ? '—'
                    : formatRecordDate(subscription.nextChargeAt)}
                </Td>
                <Td>
                  {subscription.status === 'ACTIVE' || subscription.status === 'PAST_DUE' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Скасувати підписку: ${subscription.productName} для ${subscription.clientName}`}
                      onClick={() => {
                        setCancelTarget(subscription);
                      }}
                    >
                      Скасувати
                    </Button>
                  ) : subscription.status === 'CANCELLED' && subscription.isActive ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Відновити підписку: ${subscription.productName} для ${subscription.clientName}`}
                      onClick={() => {
                        void resume(subscription);
                      }}
                    >
                      Відновити
                    </Button>
                  ) : (
                    <span className="text-xs text-text-secondary">—</span>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <Modal
        open={cancelTarget !== undefined}
        onClose={() => {
          setCancelTarget(undefined);
        }}
        title="Скасувати підписку?"
        footer={
          <>
            <Button
              variant="secondary"
              disabled={busyId !== undefined}
              onClick={() => {
                setCancelTarget(undefined);
              }}
            >
              Не скасовувати
            </Button>
            <Button
              variant="danger"
              loading={busyId !== undefined && busyId === cancelTarget?.id}
              onClick={() => {
                void confirmCancel();
              }}
            >
              Скасувати підписку
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-text-secondary">
          Наступних списань не буде. Доступ у{' '}
          <span className="font-semibold text-text">{cancelTarget?.clientName}</span> триває до{' '}
          <span className="font-semibold text-text">
            {cancelTarget === undefined ? '' : formatRecordDate(cancelTarget.accessUntil)}
          </span>
          , бо цей період уже оплачено. Кошти не повертаються — для повернення є окрема операція.
        </p>
      </Modal>
    </>
  );
}
