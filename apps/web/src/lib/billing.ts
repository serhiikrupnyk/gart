import {
  SUBSCRIPTION_PERIOD_MONTHS,
  SUBSCRIPTION_PERIODS,
  type PublicPayment,
  type PublicSubscription,
  type SubscriptionPeriod,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from '@gart/shared';

import { apiFetch } from './api';

export function getSubscription(): Promise<PublicSubscription | null> {
  return apiFetch<PublicSubscription | null>('/billing/subscription');
}

export function listPayments(): Promise<PublicPayment[]> {
  return apiFetch<PublicPayment[]>('/billing/payments');
}

/**
 * Opens a checkout and returns where the acquirer wants the trainer.
 *
 * The amount is deliberately not sent: the server derives it from the plan and
 * the cadence, so nothing a browser says can decide what anything costs.
 */
export function openCheckout(
  plan: SubscriptionPlan,
  period: SubscriptionPeriod,
): Promise<{ redirectUrl: string }> {
  return apiFetch<{ redirectUrl: string }>('/billing/subscription/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan, period }),
  });
}

export function changePeriod(period: SubscriptionPeriod): Promise<PublicSubscription> {
  return apiFetch<PublicSubscription>('/billing/subscription/period', {
    method: 'POST',
    body: JSON.stringify({ period }),
  });
}

export function cancelSubscription(): Promise<PublicSubscription> {
  return apiFetch<PublicSubscription>('/billing/subscription/cancel', { method: 'POST' });
}

export function reactivateSubscription(): Promise<PublicSubscription> {
  return apiFetch<PublicSubscription>('/billing/subscription/reactivate', { method: 'POST' });
}

export const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  PRO: 'Pro',
  GROW: 'Grow',
  SCALE: 'Scale',
};

/**
 * What each plan is FOR, in the trainer's terms.
 *
 * Grow and Scale describe what they will do, not what they do — neither is on
 * sale, and both are marked «скоро» wherever they appear. Naming them anyway is
 * more honest than a silent gap: a trainer choosing a tool deserves to know
 * where it is going.
 */
export const PLAN_SUMMARIES: Record<SubscriptionPlan, string> = {
  PRO: 'Клієнти без обмежень, програми, прогрес, звички та чат 1:1.',
  GROW: 'Усе з Pro, а також харчування, Food Log, групові чати та команда.',
  SCALE: 'Усе з Grow, більша команда та розширена агенда.',
};

export const PLAN_FEATURES: Record<SubscriptionPlan, readonly string[]> = {
  PRO: [
    'Клієнти без обмежень',
    'Програми та бібліотека вправ',
    'Прогрес: заміри й фото',
    'Звички',
    'Чат 1:1 із клієнтом',
  ],
  GROW: ['Харчування та Food Log', 'Групові чати', 'Групові заняття', 'Команда'],
  SCALE: ['Більша команда', 'Розширена агенда'],
};

export const PERIOD_LABELS: Record<SubscriptionPeriod, string> = {
  MONTHLY: 'Щомісяця',
  QUARTERLY: 'Раз на 3 місяці',
  SEMIANNUAL: 'Раз на 6 місяців',
  ANNUAL: 'Раз на рік',
};

export const PERIOD_OPTIONS = SUBSCRIPTION_PERIODS.map((period) => ({
  value: period,
  label: PERIOD_LABELS[period],
}));

/** «за 3 місяці» — what the price beside it actually covers. */
export function periodSuffix(period: SubscriptionPeriod): string {
  const months = SUBSCRIPTION_PERIOD_MONTHS[period];

  return months === 1 ? 'на місяць' : `за ${String(months)} міс.`;
}

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  TRIALING: 'Пробний період',
  ACTIVE: 'Активна',
  PAST_DUE: 'Оплата не пройшла',
  CANCELLED: 'Скасовано',
  ENDED: 'Завершено',
};

export const PAYMENT_STATUS_LABELS: Record<PublicPayment['status'], string> = {
  PENDING: 'В обробці',
  SUCCEEDED: 'Оплачено',
  FAILED: 'Не пройшов',
  REFUNDED: 'Повернено',
};
