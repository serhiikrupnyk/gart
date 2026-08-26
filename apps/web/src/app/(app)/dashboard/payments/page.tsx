'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link2, Plus } from 'lucide-react';
import {
  formatMoney,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_FILTERS,
  type PaymentStatus,
  type PaymentStatusFilter,
  type PublicPayment,
} from '@gart/shared';

import { PageHeader } from '@/components/layout/page-header';
import { PaymentTabs } from '@/components/layout/payment-tabs';
import { CheckoutModal } from '@/components/payments/checkout-modal';
import {
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
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
import { formatRecordDate } from '@/lib/dates';
import { listPayments } from '@/lib/payments';

const STATUS_TONES: Record<PaymentStatus, BadgeTone> = {
  PENDING: 'warning',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  REFUNDED: 'neutral',
};

const FILTER_LABELS: Record<PaymentStatusFilter, string> = {
  all: 'Усі статуси',
  PENDING: PAYMENT_STATUS_LABELS.PENDING,
  SUCCEEDED: PAYMENT_STATUS_LABELS.SUCCEEDED,
  FAILED: PAYMENT_STATUS_LABELS.FAILED,
  REFUNDED: PAYMENT_STATUS_LABELS.REFUNDED,
};

export default function PaymentsPage() {
  const { notify } = useToast();

  const [status, setStatus] = useState<PaymentStatusFilter>('all');
  const [payments, setPayments] = useState<PublicPayment[] | undefined>();
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  /**
   * The status control outlives every state this screen has, which the retry
   * button inside the empty state does not: pressing it unmounts it, and a
   * blurred element drops focus to <body> and the next Tab to the skip link.
   */
  const filterRef = useRef<HTMLSelectElement>(null);

  const retry = useCallback(() => {
    setPayments(undefined);
    setReloadKey((key) => key + 1);
    filterRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;

    listPayments(status)
      .then((loaded) => {
        if (!active) return;
        setPayments(loaded);
        setFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setPayments([]);
        setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [status, reloadKey]);

  async function copyLink(payment: PublicPayment): Promise<void> {
    if (payment.checkoutUrl === null) return;

    try {
      await navigator.clipboard.writeText(payment.checkoutUrl);
      notify('Посилання скопійовано', 'success');
    } catch {
      // A clipboard write can be refused by permission or by an insecure
      // origin, and a silent no-op would look like a broken button.
      notify('Не вдалося скопіювати посилання', 'danger');
    }
  }

  return (
    <>
      <PaymentTabs active="/dashboard/payments" />

      <PageHeader
        title="Оплати"
        description="Що клієнти оплатили, комісія платформи та сума до виплати."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              ref={filterRef}
              aria-label="Фільтр за статусом"
              value={status}
              options={PAYMENT_STATUS_FILTERS.map((value) => ({
                value,
                label: FILTER_LABELS[value],
              }))}
              onChange={(event) => {
                setPayments(undefined);
                setStatus(event.target.value as PaymentStatusFilter);
              }}
            />
            <Button
              variant="primary"
              onClick={() => {
                setCheckoutOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Виставити рахунок
            </Button>
          </div>
        }
      />

      {/* Filtering replaces the table, and can replace it with an empty state.
          Without this the whole interaction is silent. */}
      <p aria-live="polite" className="sr-only">
        {payments === undefined
          ? 'Завантаження оплат'
          : failed
            ? 'Не вдалося завантажити оплати'
            : `Показано оплат: ${String(payments.length)}`}
      </p>

      {payments === undefined ? (
        <TableSkeleton rows={5} columns={7} label="Завантаження оплат" />
      ) : failed ? (
        <EmptyState
          title="Не вдалося завантажити оплати"
          description="Перевірте з’єднання і спробуйте ще раз."
          action={
            <Button variant="primary" onClick={retry}>
              Спробувати ще раз
            </Button>
          }
        />
      ) : payments.length === 0 ? (
        <EmptyState
          title={status === 'all' ? 'Оплат поки немає' : 'Немає оплат із цим статусом'}
          description={
            status === 'all'
              ? 'Виставте клієнту рахунок за продукт — оплати з’являться тут.'
              : 'Спробуйте інший фільтр.'
          }
          action={
            status === 'all' ? (
              <Button
                variant="primary"
                onClick={() => {
                  setCheckoutOpen(true);
                }}
              >
                <Plus className="size-4" aria-hidden="true" />
                Виставити рахунок
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Table caption="Оплати ваших клієнтів">
          <Thead>
            <Tr>
              <Th>Клієнт</Th>
              <Th>Продукт</Th>
              <Th numeric>Сума</Th>
              <Th numeric>Комісія</Th>
              <Th numeric>До виплати</Th>
              <Th>Статус</Th>
              <Th>Дата</Th>
            </Tr>
          </Thead>
          <Tbody>
            {payments.map((payment) => (
              <Tr key={payment.id}>
                <Td>
                  <span className="font-semibold text-text">{payment.clientName}</span>
                </Td>
                <Td>{payment.productName}</Td>
                <Td numeric>{formatMoney(payment.amount)}</Td>
                <Td numeric>
                  <span className="text-text-secondary">{formatMoney(payment.platformFee)}</span>
                </Td>
                <Td numeric>
                  <span className="font-semibold text-text">{formatMoney(payment.payout)}</span>
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS_TONES[payment.status]}>
                      {PAYMENT_STATUS_LABELS[payment.status]}
                    </Badge>
                    {payment.status === 'PENDING' && payment.checkoutUrl !== null && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Скопіювати посилання на оплату: ${payment.productName} для ${payment.clientName}`}
                        onClick={() => {
                          void copyLink(payment);
                        }}
                      >
                        <Link2 className="size-4" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </Td>
                <Td>{formatRecordDate(payment.createdAt)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <CheckoutModal
        open={checkoutOpen}
        onClose={() => {
          setCheckoutOpen(false);
        }}
        onCreated={() => {
          setPayments(undefined);
          setReloadKey((key) => key + 1);
          filterRef.current?.focus();
        }}
      />
    </>
  );
}
