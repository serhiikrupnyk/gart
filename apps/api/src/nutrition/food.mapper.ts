import type { Nutrients, PublicFood, PublicFoodPortion } from '@gart/shared';

import type { FoodModel, FoodPortionModel } from '../generated/prisma/models.js';
import type { Prisma } from '../generated/prisma/client.js';

export type FoodWithPortions = FoodModel & { portions: FoodPortionModel[] };

/** Every nutrient carries two places, so nothing anywhere has to ask which. */
const SCALE = 2;

function decimal(value: Prisma.Decimal): string {
  return value.toFixed(SCALE);
}

function optional(value: Prisma.Decimal | null): string | null {
  return value === null ? null : decimal(value);
}

/**
 * Decimal columns to the decimal STRINGS the wire carries.
 *
 * `toFixed`, never `Number(...)`: these values are multiplied by portion
 * weights and summed across a meal plan, and a float that has been through
 * JSON has already lost whatever precision the column was chosen for.
 */
export function toNutrients(food: FoodModel): Nutrients {
  return {
    kcal: decimal(food.kcal),
    protein: decimal(food.protein),
    fat: decimal(food.fat),
    carbs: decimal(food.carbs),
    fibre: optional(food.fibre),
    sugars: optional(food.sugars),
    saturatedFat: optional(food.saturatedFat),
    salt: optional(food.salt),
  };
}

function toPublicPortion(portion: FoodPortionModel): PublicFoodPortion {
  return { id: portion.id, label: portion.label, grams: decimal(portion.grams) };
}

/**
 * `editable` is derived from ownership rather than stored: a global row has a
 * NULL trainerId and belongs to nobody, so nobody may edit it. The server tells
 * the screen this instead of letting the screen work it out — one authority,
 * and the same one the write gate uses.
 */
export function toPublicFood(food: FoodWithPortions): PublicFood {
  return {
    id: food.id,
    name: food.name,
    brand: food.brand,
    group: food.group,
    nutrients: toNutrients(food),
    source: food.source,
    portions: [...food.portions]
      .sort((left, right) => left.label.localeCompare(right.label, 'uk'))
      .map(toPublicPortion),
    editable: food.trainerId !== null,
    createdAt: food.createdAt.toISOString(),
    updatedAt: food.updatedAt.toISOString(),
  };
}
