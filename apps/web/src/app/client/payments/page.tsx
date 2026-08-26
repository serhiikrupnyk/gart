'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  formatMoney,
  PAYMENT_STATUS_LABELS,
  type ClientPayment,
  type ClientPurchases,
  type PaymentStatus,
  type ClientSubscription,
  type PublicEntitlement,
} from '@gart/shared';

import {
  Badge,
  type BadgeTone,
  Button,
  buttonClasses,
  Card,
  CardListSkeleton,
  EmptyState,
} from '@/components/ui';
import { formatRecordDate } from '@/lib/dates';
import { myPurchases } from '@/lib/payments';
import { mySubscriptions } from '@/lib/subscriptions';
import { ClientSubscriptions } from '@/components/payments/client-subscriptions';

const STATUS_TONES: Record<PaymentStatus, BadgeTone> = {
  PENDING: 'warning',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  REFUNDED: 'neutral',
};

type PayableNow = ClientPayment & { checkoutUrl: string };

/** An open checkout is something to act on; everything else is a record. */
function isOpen(payment: ClientPayment): payment is PayableNow {
  return payment.status === 'PENDING' && payment.checkoutUrl !== null;
}

function accessLabel(entitlement: PublicEntitlement): string {
  if (!entitlement.isActive) {
    return 'Завершено';
  }

  return entitlement.endsAt === null
    ? 'Доступ без обмеження'
    : `Діє до ${formatRecordDate(entitlement.endsAt)}`;
}

export default function ClientPaymentsPage() {
  const [data, setData] = useState<ClientPurchases | undefined>();
  const [subscriptions, setSubscriptions] = useState<ClientSubscription[]>([]);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  /**
   * The heading is the one element present in every state this screen has, so
   * it is where focus goes when the control that was pressed stops existing.
   * tabIndex={-1} makes it focusable programmatically without adding a stop.
   */
  const headingRef = useRef<HTMLHeadingElement>(null);

  const retry = useCallback(() => {
    setData(undefined);
    setReloadKey((key) => key + 1);
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;

    // Two independent loads, purchases first. A subscriptions outage must not
    // take the payable invoice down with it — the client came here to pay, and
    // /me/purchases answered perfectly well.
    myPurchases()
      .then((loaded) => {
        if (!active) return;
        setData(loaded);
        setFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setData({ payments: [], entitlements: [] });
        setFailed(true);
      });

    mySubscriptions()
      .then((loaded) => {
        if (active) setSubscriptions(loaded);
      })
      .catch(() => {
        // Its own failure, kept to itself.
        if (active) setSubscriptions([]);
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const heading = (
    <h1 ref={headingRef} tabIndex={-1} className="mb-5 text-xl font-bold tracking-tight text-text">
      Оплати
    </h1>
  );

  if (data === undefined) {
    return (
      <>
        {heading}
        <CardListSkeleton count={3} label="Завантаження оплат" />
      </>
    );
  }

  if (failed) {
    return (
      <>
        {heading}
        <EmptyState
          title="Не вдалося завантажити оплати"
          description="Перевірте з’єднання і спробуйте ще раз."
          action={
            <Button variant="primary" onClick={retry}>
              Спробувати ще раз
            </Button>
          }
        />
      </>
    );
  }

  const open = data.payments.filter(isOpen);
  const history = data.payments.filter((payment) => !isOpen(payment));

  if (data.payments.length === 0 && data.entitlements.length === 0 && subscriptions.length === 0) {
    return (
      <>
        {heading}
        <EmptyState
          title="Оплат поки немає"
          description="Коли тренер надішле рахунок, він з’явиться тут."
        />
      </>
    );
  }

  // A Fragment like the other branches, so the h1 reconciles instead of being
  // torn down — focus is placed on it after a cancel, and a changed root
  // element type would destroy the node that focus had just landed on.
  return (
    <>
      {heading}
      <div className="space-y-8">
        <ClientSubscriptions subscriptions={subscriptions} onChanged={retry} />

        {open.length > 0 && (
          <section aria-labelledby="to-pay">
            <h2 id="to-pay" className="mb-3 text-sm font-bold text-text">
              До оплати
            </h2>
            <ul className="space-y-3">
              {open.map((payment) => (
                <li key={payment.id}>
                  <Card>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text">{payment.productName}</p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums text-text">
                          {formatMoney(payment.amount)}
                        </p>
                      </div>
                      <a
                        href={payment.checkoutUrl}
                        className={buttonClasses('primary', 'md')}
                        aria-label={`Оплатити ${payment.productName}, ${formatMoney(payment.amount)}`}
                      >
                        Оплатити
                      </a>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.entitlements.length > 0 && (
          <section aria-labelledby="access">
            <h2 id="access" className="mb-3 text-sm font-bold text-text">
              Ваш доступ
            </h2>
            <ul className="space-y-3">
              {data.entitlements.map((entitlement) => (
                <li key={entitlement.id}>
                  <Card>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text">{entitlement.productName}</p>
                        <p className="mt-0.5 text-xs text-text-secondary">
                          {accessLabel(entitlement)}
                        </p>
                      </div>
                      <Badge tone={entitlement.isActive ? 'success' : 'neutral'}>
                        {entitlement.isActive ? 'Активний' : 'Завершено'}
                      </Badge>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}

        {history.length > 0 && (
          <section aria-labelledby="history">
            <h2 id="history" className="mb-3 text-sm font-bold text-text">
              Історія
            </h2>
            <ul className="space-y-3">
              {history.map((payment) => (
                <li key={payment.id}>
                  <Card>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text">{payment.productName}</p>
                        <p className="mt-0.5 text-xs text-text-secondary">
                          {formatRecordDate(payment.paidAt ?? payment.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums text-text">
                          {formatMoney(payment.amount)}
                        </p>
                        <Badge tone={STATUS_TONES[payment.status]}>
                          {PAYMENT_STATUS_LABELS[payment.status]}
                        </Badge>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
