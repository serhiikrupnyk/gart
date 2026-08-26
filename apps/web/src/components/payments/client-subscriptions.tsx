'use client';

import { useState } from 'react';
import {
  DUNNING_MAX_ATTEMPTS,
  formatMoney,
  SUBSCRIPTION_PERIOD_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  type ClientSubscription,
} from '@gart/shared';

import { Badge, type BadgeTone, Button, Card, Modal, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { formatRecordDate } from '@/lib/dates';
import { cancelMySubscription, reactivateMySubscription } from '@/lib/subscriptions';

/** The badge is coloured by what it SAYS, not by whether access happens to run. */
const STATUS_TONES: Record<ClientSubscription['status'], BadgeTone> = {
  ACTIVE: 'success',
  PAST_DUE: 'warning',
  CANCELLED: 'neutral',
  ENDED: 'neutral',
};

export interface ClientSubscriptionsProps {
  subscriptions: ClientSubscription[];
  /** Fired after a cancel or resume, so the screen reloads. */
  onChanged: () => void;
}

/**
 * The client's own recurring arrangements — what they cost, when they renew,
 * and how to stop them.
 *
 * Stopping is a plain button that says what it does, and the confirmation
 * states the date access actually runs to and that no money comes back. There
 * is no retention offer, no second «are you sure», and no route that is harder
 * to find than the one that started it: a subscription somebody cannot stop
 * themselves is the definition of a dark pattern.
 */
export function ClientSubscriptions({ subscriptions, onChanged }: ClientSubscriptionsProps) {
  const { notify } = useToast();

  const [cancelTarget, setCancelTarget] = useState<ClientSubscription | undefined>();
  const [busyId, setBusyId] = useState<string | undefined>();

  async function confirmCancel(): Promise<void> {
    if (cancelTarget === undefined) return;

    setBusyId(cancelTarget.id);

    try {
      await cancelMySubscription(cancelTarget.id);
      notify('Підписку скасовано', 'success');
      setCancelTarget(undefined);
      onChanged();
    } catch (caught) {
      notify(caught instanceof ApiError ? caught.message : 'Не вдалося скасувати', 'danger');
      setCancelTarget(undefined);
    } finally {
      setBusyId(undefined);
    }
  }

  async function resume(subscription: ClientSubscription): Promise<void> {
    if (busyId !== undefined) return;

    setBusyId(subscription.id);

    try {
      await reactivateMySubscription(subscription.id);
      notify('Підписку відновлено', 'success');
      onChanged();
    } catch (caught) {
      notify(caught instanceof ApiError ? caught.message : 'Не вдалося відновити', 'danger');
    } finally {
      setBusyId(undefined);
    }
  }

  if (subscriptions.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="subscriptions">
      <h2 id="subscriptions" className="mb-3 text-sm font-bold text-text">
        Підписка
      </h2>

      <ul className="space-y-3">
        {subscriptions.map((subscription) => (
          <li key={subscription.id}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-text">{subscription.productName}</p>
                  <p className="mt-0.5 text-sm text-text-secondary">
                    {formatMoney(subscription.price)} ·{' '}
                    {SUBSCRIPTION_PERIOD_LABELS[subscription.period].toLowerCase()}
                  </p>

                  {subscription.status === 'ACTIVE' && subscription.nextChargeAt !== null && (
                    <p className="mt-2 text-xs text-text-secondary">
                      Наступне списання {formatRecordDate(subscription.nextChargeAt)}
                    </p>
                  )}

                  {subscription.status === 'PAST_DUE' && (
                    <p className="mt-2 text-xs text-text-secondary">
                      Оплата не пройшла (спроба {subscription.failedAttempts} з{' '}
                      {DUNNING_MAX_ATTEMPTS}). Доступ триває до{' '}
                      {formatRecordDate(subscription.accessUntil)}
                    </p>
                  )}

                  {subscription.status === 'CANCELLED' && (
                    <p className="mt-2 text-xs text-text-secondary">
                      {subscription.isActive
                        ? `Скасовано. Доступ триває до ${formatRecordDate(subscription.accessUntil)}`
                        : `Скасовано. Доступ закінчився ${formatRecordDate(subscription.accessUntil)}`}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <Badge tone={STATUS_TONES[subscription.status]}>
                    {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                  </Badge>

                  {(subscription.status === 'ACTIVE' || subscription.status === 'PAST_DUE') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Скасувати підписку ${subscription.productName}`}
                      onClick={() => {
                        setCancelTarget(subscription);
                      }}
                    >
                      Скасувати підписку
                    </Button>
                  )}

                  {subscription.canReactivate && (
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Відновити підписку ${subscription.productName}`}
                      onClick={() => {
                        void resume(subscription);
                      }}
                    >
                      Відновити
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>

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
          Наступних списань не буде. Доступ триває до{' '}
          <span className="font-semibold text-text">
            {cancelTarget === undefined ? '' : formatRecordDate(cancelTarget.accessUntil)}
          </span>{' '}
          — цей період уже оплачено. Кошти за нього не повертаються. Поки він триває, підписку можна
          відновити.
        </p>
      </Modal>
    </section>
  );
}
