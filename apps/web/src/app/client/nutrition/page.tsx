'use client';

import { useEffect, useState } from 'react';
import { Utensils } from 'lucide-react';
import {
  compareToTarget,
  DAY_OF_WEEK_LABELS,
  MEAL_SLOT_LABELS,
  type ClientNutrition,
} from '@gart/shared';

import { NutrientSummary, TargetReport } from '@/components/nutrition/nutrient-summary';
import { Card, EmptyState, RowsSkeleton, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { formatRecordDate } from '@/lib/dates';
import { getMyNutrition } from '@/lib/meals';

/**
 * The client's plan, read-only.
 *
 * Recording what was actually eaten is Step 31; this step is what they were
 * given. Phone-first, because that is where somebody reads it — standing in a
 * kitchen, not at a desk.
 */
export default function ClientNutritionPage() {
  const { notify } = useToast();
  const [data, setData] = useState<ClientNutrition>();

  useEffect(() => {
    let active = true;

    getMyNutrition()
      .then((loaded) => {
        if (active) setData(loaded);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setData({ available: false, plans: [] });
        notify(
          error instanceof ApiError ? error.message : 'Не вдалося завантажити харчування',
          'danger',
        );
      });

    return () => {
      active = false;
    };
  }, [notify]);

  if (data === undefined) {
    return <RowsSkeleton count={3} />;
  }

  if (!data.available) {
    return (
      <EmptyState
        title="Розділ харчування зараз недоступний"
        // Honest about the section, silent about the reason. A client is not
        // the payer, and nothing about somebody else's billing is theirs to
        // read — nor is any of this their fault to be told about.
        description="Ваші плани збережені. Якщо потрібно, зверніться до свого тренера."
      />
    );
  }

  if (data.plans.length === 0) {
    return (
      <EmptyState
        title="Плану харчування ще немає"
        description="Коли тренер складе для вас план, він зʼявиться тут."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-accent-subtle text-accent-text">
          <Utensils aria-hidden="true" className="size-4" />
        </span>
        <h1 className="text-xl font-bold tracking-[-0.03em] text-text">Харчування</h1>
      </div>

      {data.plans.map((plan) => (
        <section key={plan.id} className="space-y-3">
          <Card tone="raised">
            <h2 className="text-lg font-bold tracking-[-0.02em] text-text">{plan.name}</h2>
            <p className="mt-1 text-xs text-text-secondary">
              {plan.daysOfWeek.map((day) => DAY_OF_WEEK_LABELS[day]).join(', ')} · з{' '}
              {formatRecordDate(plan.startDate)}
              {plan.endDate !== null && ` до ${formatRecordDate(plan.endDate)}`}
            </p>
            <div className="mt-3">
              <NutrientSummary nutrients={plan.nutrients} />
            </div>
            <div className="mt-4">
              <TargetReport
                report={{
                  kcal: compareToTarget(plan.nutrients.kcal, plan.targets.kcal),
                  protein: compareToTarget(plan.nutrients.protein, plan.targets.protein),
                  fat: compareToTarget(plan.nutrients.fat, plan.targets.fat),
                  carbs: compareToTarget(plan.nutrients.carbs, plan.targets.carbs),
                }}
              />
            </div>
          </Card>

          {plan.meals.map((meal) => (
            <Card key={meal.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-bold tracking-[-0.02em] text-text">{meal.name}</h3>
                <span className="text-2xs font-bold uppercase tracking-[0.12em] text-text-muted">
                  {MEAL_SLOT_LABELS[meal.slot]}
                  {meal.servings !== '1.00' && ` · ×${meal.servings}`}
                </span>
              </div>

              <ul className="mt-2 space-y-1 text-sm text-text-secondary">
                {meal.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span className="min-w-0">
                      {item.foodName}
                      {item.portionLabel !== null && (
                        <span className="text-text-muted">
                          {' '}
                          ({item.portionCount ?? ''} × {item.portionLabel})
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums">{item.grams} г</span>
                  </li>
                ))}
              </ul>

              <div className="mt-2.5 border-t border-border pt-2.5">
                <NutrientSummary nutrients={meal.nutrients} />
              </div>
            </Card>
          ))}
        </section>
      ))}
    </div>
  );
}
