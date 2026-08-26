import { BadRequestException } from '@nestjs/common';
import {
  checkAtwater,
  GRAMS_PER_100G_MAX,
  isNutrientAmount,
  KCAL_MAX,
  NUTRIENT_LABELS,
  PORTION_GRAMS_MAX,
  PORTION_GRAMS_MIN,
  toCenti,
} from '@gart/shared';

import type { NutrientsDto, FoodPortionDto } from './dto/food.dto';

/**
 * Every rule about what a nutrient profile may say, in one place.
 *
 * They divide into two kinds, and the comments keep them apart because they
 * carry different authority. The bounds are PHYSICAL — a hundred grams cannot
 * contain a hundred and ten grams of anything, and fibre is a carbohydrate, so
 * a profile that breaks them is describing nothing real. The Atwater check is a
 * TYPO CATCHER: measured energy legitimately departs from 4/9/4, so it refuses
 * only figures that could not plausibly belong together, and says both numbers
 * when it does.
 */

function amount(value: string, field: string): number {
  if (!isNutrientAmount(value)) {
    throw new BadRequestException(
      `${field}: значення має бути числом із щонайбільше двома знаками після коми`,
    );
  }

  const centi = toCenti(value);

  if (centi === null) {
    throw new BadRequestException(`${field}: некоректне значення`);
  }

  return centi;
}

function optionalAmount(value: string | null | undefined, field: string): number | null {
  return value === undefined || value === null ? null : amount(value, field);
}

export interface ValidatedNutrients {
  kcal: string;
  protein: string;
  fat: string;
  carbs: string;
  fibre: string | null;
  sugars: string | null;
  saturatedFat: string | null;
  salt: string | null;
}

export function validateNutrients(dto: NutrientsDto): ValidatedNutrients {
  const kcal = amount(dto.kcal, NUTRIENT_LABELS.kcal);
  const protein = amount(dto.protein, NUTRIENT_LABELS.protein);
  const fat = amount(dto.fat, NUTRIENT_LABELS.fat);
  const carbs = amount(dto.carbs, NUTRIENT_LABELS.carbs);

  const fibre = optionalAmount(dto.fibre, NUTRIENT_LABELS.fibre);
  const sugars = optionalAmount(dto.sugars, NUTRIENT_LABELS.sugars);
  const saturatedFat = optionalAmount(dto.saturatedFat, NUTRIENT_LABELS.saturatedFat);
  const salt = optionalAmount(dto.salt, NUTRIENT_LABELS.salt);

  if (kcal > KCAL_MAX * 100) {
    throw new BadRequestException(
      `${NUTRIENT_LABELS.kcal}: не більше ${String(KCAL_MAX)} на 100 г`,
    );
  }

  // Physical: the macros are part of the hundred grams, not additional to it.
  const macros = protein + fat + carbs;

  if (macros > GRAMS_PER_100G_MAX * 100) {
    throw new BadRequestException(
      `Білки, жири та вуглеводи разом не можуть перевищувати ${String(GRAMS_PER_100G_MAX)} г на 100 г`,
    );
  }

  for (const [value, limit, message] of [
    [fibre, carbs, `${NUTRIENT_LABELS.fibre} не може перевищувати вуглеводи`],
    [sugars, carbs, `${NUTRIENT_LABELS.sugars} не можуть перевищувати вуглеводи`],
    [saturatedFat, fat, `${NUTRIENT_LABELS.saturatedFat} не можуть перевищувати жири`],
  ] as [number | null, number, string][]) {
    if (value !== null && value > limit) {
      throw new BadRequestException(message);
    }
  }

  // Fibre and sugars are DISJOINT subsets of total carbohydrate — starch is
  // what remains — so bounding each against carbs separately let
  // `carbs 50, fibre 50, sugars 50` through, which describes nothing real.
  if (fibre !== null && sugars !== null && fibre + sugars > carbs) {
    throw new BadRequestException(
      `${NUTRIENT_LABELS.fibre} і ${NUTRIENT_LABELS.sugars.toLowerCase()} разом не можуть перевищувати вуглеводи`,
    );
  }

  if (salt !== null && salt > GRAMS_PER_100G_MAX * 100) {
    throw new BadRequestException(
      `${NUTRIENT_LABELS.salt}: не більше ${String(GRAMS_PER_100G_MAX)} г на 100 г`,
    );
  }

  const nutrients: ValidatedNutrients = {
    kcal: dto.kcal,
    protein: dto.protein,
    fat: dto.fat,
    carbs: dto.carbs,
    fibre: dto.fibre ?? null,
    sugars: dto.sugars ?? null,
    saturatedFat: dto.saturatedFat ?? null,
    salt: dto.salt ?? null,
  };

  // Fibre is passed in, because energy cannot be judged without it: a
  // high-fibre food measures far below a naive 4/9/4 estimate.
  const atwater = checkAtwater(nutrients);

  if (atwater !== null && !atwater.withinTolerance) {
    // BOTH numbers, because «калорійність не сходиться» tells a trainer nothing
    // about which of four fields they mistyped.
    throw new BadRequestException(
      `Калорійність не сходиться з макронутрієнтами: вказано ${dto.kcal}, ` +
        `а з білків, жирів і вуглеводів виходить близько ${String(atwater.estimated)} ккал. ` +
        'Перевірте, будь ласка, значення.',
    );
  }

  return nutrients;
}

/** Portions: a real weight, and no two with the same name on one food. */
export function validatePortions(portions: FoodPortionDto[]): FoodPortionDto[] {
  const min = toCenti(PORTION_GRAMS_MIN) ?? 0;
  const max = toCenti(PORTION_GRAMS_MAX) ?? 0;
  const seen = new Set<string>();

  for (const portion of portions) {
    const grams = amount(portion.grams, `Порція «${portion.label}»`);

    if (grams < min || grams > max) {
      throw new BadRequestException(
        `Порція «${portion.label}»: вага має бути від ${PORTION_GRAMS_MIN} до ${PORTION_GRAMS_MAX} г`,
      );
    }

    // Case-folded, because «Склянка» and «склянка» are one measure to a person
    // and the database's unique index would let both through.
    const key = portion.label.toLocaleLowerCase('uk');

    if (seen.has(key)) {
      throw new BadRequestException(`Порція «${portion.label}» вже є у цьому продукті`);
    }

    seen.add(key);
  }

  return portions;
}
