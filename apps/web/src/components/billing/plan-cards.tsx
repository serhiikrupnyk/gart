'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import {
  formatMoney,
  PLAN_CAPABILITIES,
  planPrice,
  SUBSCRIPTION_PLANS,
  type SubscriptionPeriod,
  type SubscriptionPlan,
} from '@gart/shared';

import { Badge, Button, Card, Select } from '@/components/ui';
import {
  PERIOD_OPTIONS,
  periodSuffix,
  PLAN_FEATURES,
  PLAN_LABELS,
  PLAN_SUMMARIES,
} from '@/lib/billing';

export interface PlanCardsProps {
  /** The plan currently paid for, so it can be marked rather than re-sold. */
  currentPlan: SubscriptionPlan | null;
  /**
   * Why buying is not the right move right now, or undefined when it is.
   *
   * Shown in place of the button rather than disabling it: a trainer whose
   * cancelled subscription is still running would forfeit the rest of it by
   * paying again, and «this is greyed out» does not say that.
   */
  blockedReason?: string;
  busy: boolean;
  onSubscribe: (plan: SubscriptionPlan, period: SubscriptionPeriod) => void;
}

/**
 * The plan chooser.
 *
 * Only Pro can be bought, and the other two say «скоро» with no button — the
 * same convention the nav uses for sections that are not built. Everything Grow
 * and Scale name is genuinely unbuilt, and a card that took money for it would
 * be selling a promise. What can be paid for and what cannot both come from
 * PLAN_CAPABILITIES, so this screen and the server that would refuse the
 * charge are reading the same table.
 */
export function PlanCards({ currentPlan, blockedReason, busy, onSubscribe }: PlanCardsProps) {
  const [period, setPeriod] = useState<SubscriptionPeriod>('MONTHLY');

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {SUBSCRIPTION_PLANS.map((plan) => {
        const sellable = PLAN_CAPABILITIES[plan].sellable;
        const current = plan === currentPlan;

        return (
          <Card key={plan} tone={sellable ? 'raised' : 'surface'}>
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold tracking-[-0.02em] text-text">
                  Gart {PLAN_LABELS[plan]}
                </h3>
                {current ? (
                  <Badge tone="success">Ваш тариф</Badge>
                ) : (
                  !sellable && <Badge tone="neutral">Скоро</Badge>
                )}
              </div>

              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {PLAN_SUMMARIES[plan]}
              </p>

              {sellable ? (
                <p className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tracking-[-0.04em] text-text">
                    {formatMoney(planPrice(plan, period))}
                  </span>
                  <span className="text-sm text-text-secondary">{periodSuffix(period)}</span>
                </p>
              ) : (
                <p className="mt-4 text-sm text-text-secondary">Ціну оголосимо, коли запустимо.</p>
              )}

              <ul className="mt-4 space-y-2 text-sm text-text-secondary">
                {PLAN_FEATURES[plan].map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
                    {feature}
                  </li>
                ))}
              </ul>

              {sellable && blockedReason !== undefined && (
                <p className="mt-auto pt-6 text-sm leading-relaxed text-text-secondary">
                  {blockedReason}
                </p>
              )}

              {sellable && blockedReason === undefined && (
                <div className="mt-auto space-y-2 pt-6 [&>*]:w-full">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-text-secondary">
                      Періодичність
                    </span>
                    <Select
                      options={PERIOD_OPTIONS}
                      value={period}
                      onChange={(event) => {
                        setPeriod(event.target.value as SubscriptionPeriod);
                      }}
                    />
                  </label>
                  <Button
                    variant="primary"
                    loading={busy}
                    onClick={() => {
                      onSubscribe(plan, period);
                    }}
                  >
                    {current ? 'Продовжити підписку' : 'Оформити підписку'}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
