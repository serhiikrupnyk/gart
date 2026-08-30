'use client';

import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import {
  compareToTarget,
  MEAL_SLOT_LABELS,
  type NutritionStatus,
  type PublicMealPlan,
} from '@gart/shared';

import { AssignPlanModal } from '@/components/nutrition/assign-plan-modal';
import { NutrientSummary, TargetReport } from '@/components/nutrition/nutrient-summary';
import { NutritionTabs } from '@/components/nutrition/nutrition-tabs';
import { NutritionUpsell } from '@/components/nutrition/nutrition-upsell';
import { PlanFormModal } from '@/components/nutrition/plan-form-modal';
import { PageHeader } from '@/components/layout/page-header';
import { Button, Card, EmptyState, Modal, RowsSkeleton, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { deletePlan, listPlans } from '@/lib/meals';
import { getNutritionStatus } from '@/lib/nutrition';

type FormState = { open: false } | { open: true; plan?: PublicMealPlan };

export default function PlansPage() {
  const { notify } = useToast();

  const [status, setStatus] = useState<NutritionStatus>();
  const [plans, setPlans] = useState<PublicMealPlan[]>();
  const [form, setForm] = useState<FormState>({ open: false });
  const [assigning, setAssigning] = useState<PublicMealPlan>();
  const [deleting, setDeleting] = useState<PublicMealPlan>();
  const [removing, setRemoving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    getNutritionStatus()
      .then((loaded) => {
        if (active) setStatus(loaded);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus({ available: false, customFoodCount: 0, requiredPlan: 'GROW' });
        notify(
          error instanceof ApiError ? error.message : 'Не вдалося завантажити харчування',
          'danger',
        );
      });

    return () => {
      active = false;
    };
  }, [notify]);

  useEffect(() => {
    if (status?.available !== true) return;

    let active = true;

    listPlans()
      .then((loaded) => {
        if (active) setPlans(loaded);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setPlans([]);
        notify(
          error instanceof ApiError ? error.message : 'Не вдалося завантажити плани',
          'danger',
        );
      });

    return () => {
      active = false;
    };
  }, [status, reloadKey, notify]);

  if (status === undefined) {
    return (
      <>
        <PageHeader title="Харчування" description="Плани харчування на день." />
        <RowsSkeleton count={4} />
      </>
    );
  }

  if (!status.available) {
    return (
      <>
        <PageHeader title="Харчування" description="Плани харчування на день." />
        <NutritionUpsell status={status} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Харчування"
        description="План — це один день. Розклад задається, коли ви надаєте його клієнту."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setForm({ open: true });
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Новий план
          </Button>
        }
      />

      <NutritionTabs active="/dashboard/nutrition/plans" />

      {plans === undefined ? (
        <RowsSkeleton count={3} />
      ) : plans.length === 0 ? (
        <EmptyState
          title="Планів ще немає"
          description="Складіть план дня зі страв — потім надасте його клієнтам."
          action={
            <Button
              variant="primary"
              onClick={() => {
                setForm({ open: true });
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Новий план
            </Button>
          }
        />
      ) : (
        <ul className="space-y-4">
          {plans.map((plan) => (
            <li key={plan.id}>
              <Card>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold tracking-[-0.02em] text-text">
                      {plan.name}
                    </h2>
                    <div className="mt-1">
                      <NutrientSummary nutrients={plan.nutrients} />
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setAssigning(plan);
                      }}
                    >
                      <UserPlus className="size-4" aria-hidden="true" />
                      Надати клієнту
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Редагувати ${plan.name}`}
                      onClick={() => {
                        setForm({ open: true, plan });
                      }}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Видалити ${plan.name}`}
                      onClick={() => {
                        setDeleting(plan);
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                <ul className="mt-3 space-y-1 text-sm text-text-secondary">
                  {plan.slots.map((slot) => (
                    <li key={slot.id}>
                      <span className="font-semibold text-text">
                        {slot.name ?? MEAL_SLOT_LABELS[slot.slot]}
                      </span>
                      {' — '}
                      {slot.meal.name}
                      {slot.servings !== '1.00' && ` × ${slot.servings}`}
                      <span className="tabular-nums"> · {slot.nutrients.kcal} ккал</span>
                    </li>
                  ))}
                </ul>

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
            </li>
          ))}
        </ul>
      )}

      {form.open && (
        <PlanFormModal
          open
          plan={form.plan}
          onClose={() => {
            setForm({ open: false });
          }}
          onSaved={() => {
            setForm({ open: false });
            setReloadKey((key) => key + 1);
            notify('Збережено', 'success');
          }}
        />
      )}

      {assigning !== undefined && (
        <AssignPlanModal
          open
          plan={assigning}
          onClose={() => {
            setAssigning(undefined);
          }}
          onAssigned={() => {
            setAssigning(undefined);
            notify('План надано клієнту', 'success');
          }}
        />
      )}

      <Modal
        open={deleting !== undefined}
        onClose={() => {
          setDeleting(undefined);
        }}
        title="Видалити план?"
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
                void deletePlan(target.id)
                  .then(() => {
                    setDeleting(undefined);
                    setReloadKey((key) => key + 1);
                    notify('План видалено', 'success');
                  })
                  .catch((error: unknown) => {
                    notify(
                      error instanceof ApiError ? error.message : 'Не вдалося видалити',
                      'danger',
                    );
                  })
                  .finally(() => {
                    setRemoving(false);
                  });
              }}
            >
              Видалити
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-text-secondary">
          «{deleting?.name}» буде видалено. Клієнти, яким його вже надано, збережуть свою копію —
          вона не залежить від шаблону.
        </p>
      </Modal>
    </>
  );
}
