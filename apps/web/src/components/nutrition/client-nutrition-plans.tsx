'use client';

import { useEffect, useState } from 'react';
import { Trash2, Utensils } from 'lucide-react';
import { DAY_OF_WEEK_LABELS, MEAL_SLOT_LABELS, type TrainerAssignedPlan } from '@gart/shared';

import { NutrientSummary } from '@/components/nutrition/nutrient-summary';
import { Button, Card, Modal, RowsSkeleton, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { formatRecordDate } from '@/lib/dates';
import { listClientPlans, removeClientPlan } from '@/lib/meals';

/**
 * What this client has been given, on the client's own page.
 *
 * Without it a trainer could assign a plan and then never see who has one,
 * never notice a double-assign, and never take one back — the API existed with
 * no way in, which is the Step 24 lesson exactly.
 *
 * Silent when the trainer has no nutrition: the section simply does not appear,
 * rather than showing an upsell in the middle of a client's page.
 */
export function ClientNutritionPlans({ clientId }: { clientId: string }) {
  const { notify } = useToast();
  const [plans, setPlans] = useState<TrainerAssignedPlan[]>();
  const [available, setAvailable] = useState(true);
  const [deleting, setDeleting] = useState<TrainerAssignedPlan>();
  const [removing, setRemoving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    listClientPlans(clientId)
      .then((loaded) => {
        if (active) setPlans(loaded);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setPlans([]);
        // 402 is «not on your plan», which is not an error worth shouting on
        // somebody else's page — the section just stays away.
        if (error instanceof ApiError && error.status === 402) {
          setAvailable(false);

          return;
        }
        notify(
          error instanceof ApiError ? error.message : 'Не вдалося завантажити плани харчування',
          'danger',
        );
      });

    return () => {
      active = false;
    };
  }, [clientId, reloadKey, notify]);

  if (!available) {
    return null;
  }

  return (
    <section aria-labelledby="client-nutrition-heading" className="mt-8">
      <h2
        id="client-nutrition-heading"
        className="mb-3 flex items-center gap-2 text-base font-bold tracking-[-0.02em] text-text"
      >
        <Utensils aria-hidden="true" className="size-4 text-text-secondary" />
        Плани харчування
      </h2>

      {plans === undefined ? (
        <RowsSkeleton count={2} />
      ) : plans.length === 0 ? (
        <Card>
          <p className="text-sm leading-relaxed text-text-secondary">
            Планів харчування ще немає. Надайте план на вкладці «Харчування → Плани».
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {plans.map((plan) => (
            <li key={plan.id}>
              <Card>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-text">{plan.name}</h3>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {plan.daysOfWeek.map((day) => DAY_OF_WEEK_LABELS[day]).join(', ')} · з{' '}
                      {formatRecordDate(plan.startDate)}
                      {plan.endDate !== null && ` до ${formatRecordDate(plan.endDate)}`}
                    </p>
                    <div className="mt-1.5">
                      <NutrientSummary nutrients={plan.nutrients} />
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      {plan.meals
                        .map((meal) => `${MEAL_SLOT_LABELS[meal.slot]}: ${meal.name}`)
                        .join(' · ')}
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Прибрати план ${plan.name}`}
                    onClick={() => {
                      setDeleting(plan);
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={deleting !== undefined}
        onClose={() => {
          setDeleting(undefined);
        }}
        title="Прибрати план?"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setDeleting(undefined);
              }}
            >
              Скасувати
            </Button>
            <Button
              variant="danger"
              loading={removing}
              onClick={() => {
                const target = deleting;

                if (target === undefined) return;

                setRemoving(true);
                void removeClientPlan(clientId, target.id)
                  .then(() => {
                    setDeleting(undefined);
                    setReloadKey((key) => key + 1);
                    notify('План прибрано', 'success');
                  })
                  .catch((error: unknown) => {
                    notify(
                      error instanceof ApiError ? error.message : 'Не вдалося прибрати план',
                      'danger',
                    );
                  })
                  .finally(() => {
                    setRemoving(false);
                  });
              }}
            >
              Прибрати
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-text-secondary">
          «{deleting?.name}» більше не показуватиметься клієнту. Ваш шаблон плану залишиться на
          місці.
        </p>
      </Modal>
    </section>
  );
}
