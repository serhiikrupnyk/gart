'use client';

import { useState } from 'react';
import {
  formatMoney,
  PLAN_CAPABILITIES,
  planPrice,
  SUBSCRIPTION_PLANS,
  type SubscriptionPeriod,
  type SubscriptionPlan,
} from '@gart/shared';

import { Check, Lock } from 'lucide-react';

import { Badge, Button, Card, Select } from '@/components/ui';
import {
  PERIOD_OPTIONS,
  periodSuffix,
  PLAN_FEATURES,
  PLAN_LABELS,
  PLAN_SUMMARIES,
  PLAN_UPCOMING,
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
 * A plan is sellable once something real stands behind it: Pro from the start,
 * Grow since nutrition shipped. Scale still says «скоро» with no button,
 * because a bigger team and an extended agenda are not built and a card that
 * took money for them would be selling a promise.
 *
 * What can be paid for comes from PLAN_CAPABILITIES, so this screen and the
 * server that would refuse the charge read the same table. What a plan gives
 * TODAY and what is merely coming are separate lists, so the difference is
 * visible rather than implied.
 */
export function PlanCards({ currentPlan, blockedReason, busy, onSubscribe }: PlanCardsProps) {
  const [period, setPeriod] = useState<SubscriptionPeriod>('MONTHLY');

  return (
    <div className="space-y-4">
      {/*
        ONE cadence for the page, above the grid and stated once.
        It used to render inside each card — which was invisible while only Pro
        was sellable, and became two identically-labelled controls bound to one
        value the moment Grow joined it: changing cadence on one card silently
        moved the price on the other.
      */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {/*
          Named for what it chooses. An active subscription's own cadence
          control lives further down the billing page, and two different
          actions sharing one accessible name is a trap for anybody navigating
          by label.
        */}
        <label htmlFor="billing-period" className="text-sm font-semibold text-text-secondary">
          Періодичність нової підписки
        </label>
        <div className="w-full sm:w-56">
          <Select
            id="billing-period"
            options={PERIOD_OPTIONS}
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value as SubscriptionPeriod);
            }}
          />
        </div>
      </div>

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
                  <p className="mt-4 text-sm text-text-secondary">
                    Ціну оголосимо, коли запустимо.
                  </p>
                )}

                <ul className="mt-4 space-y-2 text-sm text-text-secondary">
                  {PLAN_FEATURES[plan].map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {PLAN_UPCOMING[plan].length > 0 && (
                  <>
                    {/* Named, and visibly not part of what is being paid for. */}
                    <p className="mt-4 text-2xs font-bold uppercase tracking-[0.14em] text-text-muted">
                      Незабаром
                    </p>
                    <ul className="mt-2 space-y-1.5 text-sm text-text-secondary">
                      {PLAN_UPCOMING[plan].map((feature) => (
                        <li key={feature} className="flex gap-2">
                          <Lock
                            aria-hidden="true"
                            className="mt-0.5 size-3.5 shrink-0 text-text-muted"
                          />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {sellable && blockedReason !== undefined && (
                  <p className="mt-auto pt-6 text-sm leading-relaxed text-text-secondary">
                    {blockedReason}
                  </p>
                )}

                {sellable && blockedReason === undefined && (
                  <div className="mt-auto space-y-2 pt-6 [&>*]:w-full">
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
    </div>
  );
}
