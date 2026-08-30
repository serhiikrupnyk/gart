import {
  multiplyNutrients,
  scaleNutrients,
  sumNutrients,
  zeroNutrients,
  type Nutrients,
  type NutritionTargets,
  type PublicMeal,
  type PublicMealItem,
  type PublicAssignedMeal,
  type PublicAssignedPlan,
  type PublicMealPlan,
  type PublicPlanSlot,
  type TrainerAssignedPlan,
  type DayOfWeek,
} from '@gart/shared';

import type { Prisma } from '../generated/prisma/client.js';
import type {
  AssignedMealItemModel,
  AssignedMealModel,
  FoodModel,
  MealItemModel,
  MealModel,
  MealPlanAssignmentModel,
  MealPlanModel,
  MealPlanSlotModel,
} from '../generated/prisma/models.js';
import { toNutrients } from './food.mapper';

const SCALE = 2;

function decimal(value: Prisma.Decimal): string {
  return value.toFixed(SCALE);
}

function optional(value: Prisma.Decimal | null): string | null {
  return value === null ? null : decimal(value);
}

export type MealItemWithFood = MealItemModel & { food: FoodModel };
export type MealWithItems = MealModel & { items: MealItemWithFood[] };
export type PlanSlotWithMeal = MealPlanSlotModel & { meal: MealWithItems };
export type PlanWithSlots = MealPlanModel & { slots: PlanSlotWithMeal[] };
export type AssignedItemWithFood = AssignedMealItemModel & { food: FoodModel };
export type AssignedMealWithItems = AssignedMealModel & { items: AssignedItemWithFood[] };

/**
 * A line's contribution, scaled from its food's per-100 g profile.
 *
 * `grams` is the only quantity the arithmetic ever sees. The portion fields
 * beside it record how the trainer WROTE the amount and take no part in any
 * total, which is why renaming a portion later cannot restate a meal.
 */
function lineNutrients(food: FoodModel, grams: Prisma.Decimal): Nutrients | null {
  return scaleNutrients(toNutrients(food), decimal(grams));
}

/**
 * Totals, DERIVED on every read and never stored.
 *
 * A stored total is a second authority that goes stale the moment a food is
 * corrected — and Step 29 exists precisely so that correcting a food is a
 * normal thing to do. Unknowns propagate as `sumNutrients` already defines:
 * «unknown + 5» is unknown, not 5.
 *
 * Returns zeros for an empty composition rather than null: a meal with no
 * foods contains nothing, which is a known quantity.
 */
function totalOf(lines: (Nutrients | null)[]): Nutrients {
  const known = lines.filter((line): line is Nutrients => line !== null);

  if (known.length !== lines.length) {
    // Unreachable: every amount is regex-validated on the way in and the
    // rendering pattern is wide enough for any total those bounds can produce.
    // Zeros are the last resort for data that cannot exist rather than a
    // routine fallback — a total that silently dropped a line would be worse.
    return zeroNutrients();
  }

  return sumNutrients(known) ?? zeroNutrients();
}

function toPublicItem(item: MealItemWithFood): PublicMealItem {
  return {
    id: item.id,
    foodId: item.foodId,
    foodName: item.food.name,
    grams: decimal(item.grams),
    portionLabel: item.portionLabel,
    portionCount: optional(item.portionCount),
    nutrients: lineNutrients(item.food, item.grams) ?? zeroNutrients(),
  };
}

export function toPublicMeal(meal: MealWithItems): PublicMeal {
  const items = [...meal.items].sort((left, right) => left.order - right.order).map(toPublicItem);

  return {
    id: meal.id,
    name: meal.name,
    notes: meal.notes,
    items,
    nutrients: totalOf(items.map((item) => item.nutrients)),
    createdAt: meal.createdAt.toISOString(),
    updatedAt: meal.updatedAt.toISOString(),
  };
}

export function toTargets(plan: {
  targetKcal: Prisma.Decimal | null;
  targetProtein: Prisma.Decimal | null;
  targetFat: Prisma.Decimal | null;
  targetCarbs: Prisma.Decimal | null;
}): NutritionTargets {
  return {
    kcal: optional(plan.targetKcal),
    protein: optional(plan.targetProtein),
    fat: optional(plan.targetFat),
    carbs: optional(plan.targetCarbs),
  };
}

function toPublicSlot(slot: PlanSlotWithMeal): PublicPlanSlot {
  const meal = toPublicMeal(slot.meal);
  const servings = decimal(slot.servings);

  return {
    id: slot.id,
    slot: slot.slot,
    name: slot.name,
    servings,
    meal,
    nutrients: multiplyNutrients(meal.nutrients, servings) ?? zeroNutrients(),
  };
}

export function toPublicPlan(plan: PlanWithSlots): PublicMealPlan {
  const slots = [...plan.slots].sort((left, right) => left.order - right.order).map(toPublicSlot);

  return {
    id: plan.id,
    name: plan.name,
    targets: toTargets(plan),
    slots,
    nutrients: totalOf(slots.map((entry) => entry.nutrients)),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

/**
 * A frozen meal, presented as what it is.
 *
 * Its composition came from the snapshot; its FOODS are read live, so a
 * corrected nutrition figure reaches the client while a redesigned template
 * does not. It carries no timestamps of its own, because it has no template
 * identity behind it to have them.
 */
export function toPublicAssignedMeal(meal: AssignedMealWithItems): PublicAssignedMeal {
  const lines = [...meal.items]
    .sort((left, right) => left.order - right.order)
    .map((item) => ({
      id: item.id,
      foodId: item.foodId,
      foodName: item.food.name,
      grams: decimal(item.grams),
      portionLabel: item.portionLabel,
      portionCount: optional(item.portionCount),
      nutrients: lineNutrients(item.food, item.grams) ?? zeroNutrients(),
    }));
  const servings = decimal(meal.servings);
  const composition = totalOf(lines.map((line) => line.nutrients));

  return {
    id: meal.id,
    slot: meal.slot,
    name: meal.name,
    notes: meal.notes,
    servings,
    items: lines,
    nutrients: multiplyNutrients(composition, servings) ?? zeroNutrients(),
  };
}

export type AssignmentWithMeals = MealPlanAssignmentModel & { meals: AssignedMealWithItems[] };

export function toPublicAssignedPlan(assignment: AssignmentWithMeals): PublicAssignedPlan {
  const meals = [...assignment.meals]
    .sort((left, right) => left.order - right.order)
    .map(toPublicAssignedMeal);

  return {
    id: assignment.id,
    name: assignment.name,
    targets: toTargets(assignment),
    meals,
    nutrients: totalOf(meals.map((meal) => meal.nutrients)),
    startDate: toIsoDate(assignment.startDate),
    endDate: assignment.endDate === null ? null : toIsoDate(assignment.endDate),
    daysOfWeek: [...assignment.daysOfWeek].sort((left, right) => left - right) as DayOfWeek[],
    assignedAt: assignment.assignedAt.toISOString(),
  };
}

export function toTrainerAssignedPlan(
  assignment: AssignmentWithMeals & { client: { id: string; fullName: string } },
): TrainerAssignedPlan {
  return {
    ...toPublicAssignedPlan(assignment),
    clientId: assignment.client.id,
    clientName: assignment.client.fullName,
    sourcePlanId: assignment.sourcePlanId,
  };
}

/** 'YYYY-MM-DD' from a @db.Date column, which Prisma hands back at UTC midnight. */
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
