import { BadRequestException } from '@nestjs/common';
import {
  checkAtwater,
  ITEM_GRAMS_MAX,
  ITEM_GRAMS_MIN,
  isNutrientAmount,
  NUTRIENT_LABELS,
  SERVINGS_MAX,
  SERVINGS_MIN,
  TARGET_GRAMS_MAX,
  TARGET_KCAL_MAX,
  toCenti,
} from '@gart/shared';

import type { MealItemDto, PlanSlotDto, TargetsDto } from './dto/meal.dto';

/**
 * Every rule about the quantities a meal, a slot and a target may carry.
 *
 * Deliberately separate from the API's shape validation and from Step 29's
 * nutrient bounds: those say what a FOOD may claim about itself, these say how
 * much of it somebody may be given. The one thing they share is the parser —
 * `isNutrientAmount` is the single definition of a well-formed amount, so the
 * wire format and the arithmetic cannot disagree about what one is.
 */

function amount(value: string, field: string): number {
  const centi = isNutrientAmount(value) ? toCenti(value) : null;

  if (centi === null) {
    throw new BadRequestException(
      `${field}: значення має бути числом із щонайбільше двома знаками після коми`,
    );
  }

  return centi;
}

function bounded(value: string, field: string, min: string, max: string): number {
  const centi = amount(value, field);
  const low = toCenti(min) ?? 0;
  const high = toCenti(max) ?? 0;

  if (centi < low || centi > high) {
    throw new BadRequestException(`${field}: має бути від ${min} до ${max}`);
  }

  return centi;
}

/** How much of a food is on the plate. */
export function validateMealItems(items: MealItemDto[]): MealItemDto[] {
  items.forEach((item, index) => {
    const label = `Продукт №${String(index + 1)}`;

    bounded(item.grams, `${label}: вага`, ITEM_GRAMS_MIN, ITEM_GRAMS_MAX);

    if (item.portionCount != null && item.portionCount !== '') {
      bounded(item.portionCount, `${label}: кількість порцій`, SERVINGS_MIN, SERVINGS_MAX);
    }
  });

  return items;
}

/** How many of a meal a slot holds. */
export function validatePlanSlots(slots: PlanSlotDto[]): PlanSlotDto[] {
  slots.forEach((slot, index) => {
    if (slot.servings != null && slot.servings !== '') {
      bounded(
        slot.servings,
        `Прийом їжі №${String(index + 1)}: порції`,
        SERVINGS_MIN,
        SERVINGS_MAX,
      );
    }
  });

  return slots;
}

export interface ValidatedTargets {
  targetKcal: string | null;
  targetProtein: string | null;
  targetFat: string | null;
  targetCarbs: string | null;
}

/**
 * The trainer's own numbers, bounded — and cross-checked against each other
 * when all four are given.
 *
 * Gart computes no energy requirement and names no formula it has not earned;
 * these are the figures the trainer decided on. But four figures that cannot
 * belong together are a typo, and the same fibre-adjusted Atwater band Step 29
 * uses catches it — naming BOTH numbers, because «цілі не сходяться» tells
 * nobody which field to look at.
 */
export function validateTargets(dto: TargetsDto | null | undefined): ValidatedTargets {
  const empty = { targetKcal: null, targetProtein: null, targetFat: null, targetCarbs: null };

  // `== null` and not `=== undefined`: `@IsOptional` waves an explicit null
  // past every validator, and «clear all my targets» is a reasonable thing for
  // a screen to send. Reading it as «no targets» is both correct and the
  // difference between a 400-shaped answer and a stack trace.
  if (dto == null) {
    return empty;
  }

  const read = (value: string | null | undefined, field: string, max: string): string | null => {
    if (value == null || value === '') {
      return null;
    }

    bounded(value, field, '0', max);

    return value;
  };

  const kcalMax = `${String(TARGET_KCAL_MAX)}`;
  const gramsMax = `${String(TARGET_GRAMS_MAX)}`;

  const targets: ValidatedTargets = {
    targetKcal: read(dto.kcal, `Ціль: ${NUTRIENT_LABELS.kcal.toLowerCase()}`, kcalMax),
    targetProtein: read(dto.protein, `Ціль: ${NUTRIENT_LABELS.protein.toLowerCase()}`, gramsMax),
    targetFat: read(dto.fat, `Ціль: ${NUTRIENT_LABELS.fat.toLowerCase()}`, gramsMax),
    targetCarbs: read(dto.carbs, `Ціль: ${NUTRIENT_LABELS.carbs.toLowerCase()}`, gramsMax),
  };

  const complete =
    targets.targetKcal !== null &&
    targets.targetProtein !== null &&
    targets.targetFat !== null &&
    targets.targetCarbs !== null;

  if (complete) {
    const check = checkAtwater({
      kcal: targets.targetKcal ?? '0',
      protein: targets.targetProtein ?? '0',
      fat: targets.targetFat ?? '0',
      carbs: targets.targetCarbs ?? '0',
      // Targets carry no fibre figure, so the band runs unadjusted — which is
      // the generous direction for a target, since fibre only ever lowers the
      // estimate and a wider band refuses fewer honest plans.
      fibre: null,
    });

    if (check !== null && !check.withinTolerance) {
      throw new BadRequestException(
        `Цілі не сходяться між собою: ${targets.targetKcal ?? ''} ккал, ` +
          `а з білків, жирів і вуглеводів виходить близько ${String(check.estimated)} ккал. ` +
          'Перевірте, будь ласка, значення.',
      );
    }
  }

  return targets;
}
