import type { DayOfWeek } from './assignment';

/**
 * Nutrient amounts cross the wire as decimal STRINGS, never as numbers, and
 * every sum and scaling below is integer arithmetic.
 *
 * The same rule money follows, for the same reason. These values are not
 * displayed and forgotten: Step 30 multiplies them by portion weights and adds
 * up a day's worth, so an error introduced at 100 g compounds across a meal
 * plan. `0.1 + 0.2` is as wrong here as it is in a payment, and a value that
 * has been through JSON as a float has already lost the argument.
 */

/** How many decimal places a nutrient carries, matching Decimal(_, 2). */
const SCALE = 2;

/** Everything is held internally as an integer number of hundredths. */
const CENTI = 100;

/** A per-100 g nutrient profile, or one scaled to a portion. */
export interface Nutrients {
  kcal: string;
  protein: string;
  fat: string;
  carbs: string;
  /**
   * Null means NOT KNOWN, and is different from zero.
   *
   * A food whose fibre nobody measured is not a food with no fibre, and the
   * arithmetic below keeps that distinction rather than quietly reporting a
   * total that omitted whatever it could not see.
   */
  fibre: string | null;
  sugars: string | null;
  saturatedFat: string | null;
  salt: string | null;
}

/** The four every food must carry; the rest are optional. */
export const REQUIRED_NUTRIENTS = ['kcal', 'protein', 'fat', 'carbs'] as const;
export const OPTIONAL_NUTRIENTS = ['fibre', 'sugars', 'saturatedFat', 'salt'] as const;

export type RequiredNutrient = (typeof REQUIRED_NUTRIENTS)[number];
export type OptionalNutrient = (typeof OPTIONAL_NUTRIENTS)[number];

export const NUTRIENT_LABELS: Record<RequiredNutrient | OptionalNutrient, string> = {
  kcal: 'Калорії',
  protein: 'Білки',
  fat: 'Жири',
  carbs: 'Вуглеводи',
  fibre: 'Клітковина',
  sugars: 'Цукри',
  saturatedFat: 'Насичені жири',
  salt: 'Сіль',
};

/** «г» for everything except energy, which is «ккал». */
export const NUTRIENT_UNITS: Record<RequiredNutrient | OptionalNutrient, string> = {
  kcal: 'ккал',
  protein: 'г',
  fat: 'г',
  carbs: 'г',
  fibre: 'г',
  sugars: 'г',
  saturatedFat: 'г',
  salt: 'г',
};

/**
 * A plain decimal string with at most two places, and never negative.
 *
 * Nine integer digits and not seven. Seven bounded a single AMOUNT, which is
 * right — but the same parser renders TOTALS, and a day's total is the product
 * of every cap multiplied together. At seven digits a large enough plan summed
 * past the pattern, `fromCenti` refused it, and the total silently reported
 * itself as zero. Every real bound (KCAL_MAX, ITEM_GRAMS_MAX, the target caps)
 * is checked separately and unchanged; this only widens what can be WRITTEN
 * DOWN.
 */
const DECIMAL_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;

export function isNutrientAmount(value: string): boolean {
  return DECIMAL_PATTERN.test(value);
}

/**
 * A decimal string to an integer number of hundredths, or null.
 *
 * The one door into the arithmetic. Everything past this point is integers, so
 * no intermediate value is ever a float that could carry a representation error
 * into a total.
 */
export function toCenti(value: string): number | null {
  if (!isNutrientAmount(value)) {
    return null;
  }

  const [whole = '0', fraction = ''] = value.split('.');

  return Number(whole) * CENTI + Number(fraction.padEnd(SCALE, '0'));
}

/**
 * An integer number of hundredths back to the wire's decimal string.
 *
 * Guarded rather than trusting its callers. Every producer today is a
 * non-negative integer, but the first thing Step 30 will want to express is
 * «target minus consumed» — and unguarded, `fromCenti(-1)` returns "-1.99".
 */
export function fromCenti(centi: number): string {
  if (!Number.isInteger(centi) || centi < 0) {
    throw new RangeError(`Not a whole number of hundredths: ${String(centi)}`);
  }

  const whole = Math.floor(centi / CENTI);

  return `${String(whole)}.${String(centi - whole * CENTI).padStart(SCALE, '0')}`;
}

/**
 * `value` × `factorCenti` ÷ `divisor`, rounded half-up, in integers throughout.
 *
 * The one multiplication routine both public helpers go through, so scaling to
 * a weight and multiplying by a serving count cannot round differently.
 *
 * `+ divisor / 2` before the floor is half-up rounding without ever dividing in
 * floating point: the numerator is an exact integer product, and every input is
 * non-negative, so there is no negative-half ambiguity.
 */
function scaleBy(valueCenti: number, factorCenti: number, divisor: number): number {
  return Math.floor((valueCenti * factorCenti + divisor / 2) / divisor);
}

/**
 * A per-100 g profile scaled to `grams`.
 *
 * Null stays null: scaling something unmeasured produces something unmeasured,
 * not zero. Returns null if any amount is malformed — a caller handed bad input
 * should find out, not receive a plausible-looking answer.
 */
export function scaleNutrients(nutrients: Nutrients, grams: string): Nutrients | null {
  const gramsCenti = toCenti(grams);

  if (gramsCenti === null) {
    return null;
  }

  const scaleOne = (value: string): string | null => {
    const centi = toCenti(value);

    // grams is already a hundredth-scaled percentage of 100 g, so the divisor
    // carries both the per-100 basis and the centi scale.
    return centi === null ? null : fromCenti(scaleBy(centi, gramsCenti, CENTI * CENTI));
  };

  // `undefined` is «malformed», distinct from the `null` that means «not
  // measured» — without the coalesce, a bad value came back as null and was
  // indistinguishable from an honest unknown, which the checks below could
  // then never catch.
  const scaleOptional = (value: string | null): string | null | undefined =>
    value === null ? null : (scaleOne(value) ?? undefined);

  const kcal = scaleOne(nutrients.kcal);
  const protein = scaleOne(nutrients.protein);
  const fat = scaleOne(nutrients.fat);
  const carbs = scaleOne(nutrients.carbs);

  if (kcal === null || protein === null || fat === null || carbs === null) {
    return null;
  }

  const fibre = scaleOptional(nutrients.fibre);
  const sugars = scaleOptional(nutrients.sugars);
  const saturatedFat = scaleOptional(nutrients.saturatedFat);
  const salt = scaleOptional(nutrients.salt);

  if (fibre === undefined || sugars === undefined) {
    return null;
  }
  if (saturatedFat === undefined || salt === undefined) {
    return null;
  }

  return { kcal, protein, fat, carbs, fibre, sugars, saturatedFat, salt };
}

/**
 * A profile multiplied by a plain factor — «1.5 servings of this».
 *
 * Distinct from `scaleNutrients`, which converts a per-100 g profile to a
 * weight. This one takes something already whole and takes more or less of it,
 * so the units differ even though the integer routine underneath is shared.
 * Collapsing them into one function taking «a percentage» would have made every
 * call site say which meaning it intended in a comment.
 *
 * Null stays null, and a malformed amount returns null rather than a
 * plausible-looking answer — the same contract as scaling.
 */
export function multiplyNutrients(nutrients: Nutrients, factor: string): Nutrients | null {
  const factorCenti = toCenti(factor);

  if (factorCenti === null) {
    return null;
  }

  const multiplyOne = (value: string): string | null => {
    const centi = toCenti(value);

    return centi === null ? null : fromCenti(scaleBy(centi, factorCenti, CENTI));
  };

  const multiplyOptional = (value: string | null): string | null | undefined =>
    value === null ? null : (multiplyOne(value) ?? undefined);

  const kcal = multiplyOne(nutrients.kcal);
  const protein = multiplyOne(nutrients.protein);
  const fat = multiplyOne(nutrients.fat);
  const carbs = multiplyOne(nutrients.carbs);

  if (kcal === null || protein === null || fat === null || carbs === null) {
    return null;
  }

  const fibre = multiplyOptional(nutrients.fibre);
  const sugars = multiplyOptional(nutrients.sugars);
  const saturatedFat = multiplyOptional(nutrients.saturatedFat);
  const salt = multiplyOptional(nutrients.salt);

  if (fibre === undefined || sugars === undefined) {
    return null;
  }
  if (saturatedFat === undefined || salt === undefined) {
    return null;
  }

  return { kcal, protein, fat, carbs, fibre, sugars, saturatedFat, salt };
}

/** A profile of all zeros — the identity `sumNutrients` starts from. */
export function zeroNutrients(): Nutrients {
  return {
    kcal: '0.00',
    protein: '0.00',
    fat: '0.00',
    carbs: '0.00',
    fibre: '0.00',
    sugars: '0.00',
    saturatedFat: '0.00',
    salt: '0.00',
  };
}

/**
 * Adds profiles together.
 *
 * An optional nutrient is null in the total if ANY contributor's is null, and
 * that is the point: «unknown + 5» is unknown. Treating it as zero would report
 * a day's fibre that silently left out every food nobody had measured, which is
 * worse than reporting that the figure is not known.
 */
export function sumNutrients(profiles: readonly Nutrients[]): Nutrients | null {
  const totals = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  const optional: Record<OptionalNutrient, number | null> = {
    fibre: 0,
    sugars: 0,
    saturatedFat: 0,
    salt: 0,
  };

  for (const profile of profiles) {
    for (const key of REQUIRED_NUTRIENTS) {
      const centi = toCenti(profile[key]);

      if (centi === null) {
        return null;
      }

      totals[key] += centi;
    }

    for (const key of OPTIONAL_NUTRIENTS) {
      const value = profile[key];

      if (value === null) {
        optional[key] = null;
        continue;
      }

      const centi = toCenti(value);

      if (centi === null) {
        return null;
      }

      const running = optional[key];
      optional[key] = running === null ? null : running + centi;
    }
  }

  const render = (centi: number | null): string | null =>
    centi === null ? null : fromCenti(centi);

  return {
    kcal: fromCenti(totals.kcal),
    protein: fromCenti(totals.protein),
    fat: fromCenti(totals.fat),
    carbs: fromCenti(totals.carbs),
    fibre: render(optional.fibre),
    sugars: render(optional.sugars),
    saturatedFat: render(optional.saturatedFat),
    salt: render(optional.salt),
  };
}

/**
 * What a food is, coarsely. A closed set the trainer does not extend, so an
 * enum rather than a table — the same call MuscleGroup makes, and for the same
 * reasons: no join, no seed prerequisite, filterable, and Ukrainian labels that
 * live here rather than in the database.
 *
 * Deliberately NOT the exercise library's Category model: «Сила» has no
 * business appearing in a list of food groups.
 */
export const FOOD_GROUPS = [
  'GRAINS',
  'MEAT',
  'FISH',
  'DAIRY',
  'EGGS',
  'VEGETABLES',
  'FRUIT',
  'NUTS_SEEDS',
  'LEGUMES',
  'FATS_OILS',
  'BAKERY',
  'SWEETS',
  'BEVERAGES',
  'SAUCES',
  'OTHER',
] as const;

export type FoodGroup = (typeof FOOD_GROUPS)[number];

export const FOOD_GROUP_LABELS: Record<FoodGroup, string> = {
  GRAINS: 'Крупи та каші',
  MEAT: "М'ясо",
  FISH: 'Риба та морепродукти',
  DAIRY: 'Молочні продукти',
  EGGS: 'Яйця',
  VEGETABLES: 'Овочі',
  FRUIT: 'Фрукти та ягоди',
  NUTS_SEEDS: 'Горіхи та насіння',
  LEGUMES: 'Бобові',
  FATS_OILS: 'Олії та жири',
  BAKERY: 'Хліб та випічка',
  SWEETS: 'Солодощі',
  BEVERAGES: 'Напої',
  SAUCES: 'Соуси та приправи',
  OTHER: 'Інше',
};

export const FOOD_NAME_MAX_LENGTH = 120;
export const FOOD_BRAND_MAX_LENGTH = 80;
export const PORTION_LABEL_MAX_LENGTH = 60;

/** Nothing edible exceeds this per 100 g; pure fat is 900. */
export const KCAL_MAX = 1000;

/** Grams of anything per 100 g of it. */
export const GRAMS_PER_100G_MAX = 100;

/** A named portion's weight. Generous enough for «одна пачка», bounded so a typo cannot pass. */
export const PORTION_GRAMS_MIN = '0.01';
export const PORTION_GRAMS_MAX = '5000';

/** How many named portions one food may carry, so the list stays a list. */
export const MAX_PORTIONS_PER_FOOD = 12;

/**
 * Atwater factors, used ONLY to catch typos.
 *
 * `fibre` is 2 kcal/g and not the 4 that carbohydrate carries, which is the EU
 * labelling convention and the physiological reality: fibre is counted inside
 * total carbohydrate but yields about half its energy. Leaving it at 4 made
 * this band refuse real food — wheat bran, at 42.8 g of fibre per 100 g,
 * measures 216 kcal against a naive estimate of 358, and was rejected.
 *
 * Even so this is a sanity band, never a correctness rule: measured energy
 * departs from any formula, and the job here is to catch a protein figure typed
 * into the calorie field, not to second-guess a laboratory.
 */
export const ATWATER = { protein: 4, fat: 9, carbs: 4, fibre: 2 };

/** How far measured energy may sit from the Atwater estimate before it reads as a typo. */
export const ATWATER_TOLERANCE = 0.25;

/** Below this the relative band is meaningless — celery at 14 kcal would fail on rounding alone. */
const ATWATER_FLOOR_KCAL = 50;

export interface AtwaterCheck {
  /** What the macros imply, rounded to whole kcal. */
  estimated: number;
  withinTolerance: boolean;
}

/**
 * Whether the stated energy is plausible for the stated macros.
 *
 * Returns the estimate as well as the verdict, so a refusal can name BOTH
 * numbers. «Калорійність не сходиться» tells a trainer nothing; «вказано 900,
 * а з макронутрієнтів виходить близько 320» tells them which field to look at.
 */
export function checkAtwater(nutrients: {
  kcal: string;
  protein: string;
  fat: string;
  carbs: string;
  fibre?: string | null;
}): AtwaterCheck | null {
  const kcal = toCenti(nutrients.kcal);
  const protein = toCenti(nutrients.protein);
  const fat = toCenti(nutrients.fat);
  const carbs = toCenti(nutrients.carbs);

  if (kcal === null || protein === null || fat === null || carbs === null) {
    return null;
  }

  // Fibre is part of total carbohydrate, so it is counted OUT of the 4 kcal/g
  // band and back in at 2 — not added on top.
  const fibre =
    nutrients.fibre === undefined || nutrients.fibre === null
      ? 0
      : Math.min(toCenti(nutrients.fibre) ?? 0, carbs);

  const estimatedCenti =
    protein * ATWATER.protein +
    fat * ATWATER.fat +
    (carbs - fibre) * ATWATER.carbs +
    fibre * ATWATER.fibre;
  const estimated = Math.round(estimatedCenti / CENTI);
  const allowance = Math.max(estimatedCenti * ATWATER_TOLERANCE, ATWATER_FLOOR_KCAL * CENTI);

  return { estimated, withinTolerance: Math.abs(kcal - estimatedCenti) <= allowance };
}

/** A named measure of a food, with what it actually weighs. */
export interface PublicFoodPortion {
  id: string;
  label: string;
  grams: string;
}

/** One entry in the food library. */
export interface PublicFood {
  id: string;
  name: string;
  brand: string | null;
  group: FoodGroup;
  /** Per 100 g, always — so nothing anywhere has to ask «per what?». */
  nutrients: Nutrients;
  /**
   * Where the numbers came from, per row.
   *
   * On the record because a food catalogue without provenance is a set of
   * assertions. Global rows say which database they were taken from; a
   * trainer's own say so plainly rather than borrowing an authority.
   */
  source: string | null;
  portions: PublicFoodPortion[];
  /** False for the shared library, true for this trainer's own. */
  editable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FoodPage {
  items: PublicFood[];
  total: number;
  page: number;
  pageSize: number;
}

export const FOODS_PAGE_SIZE = 20;

export interface FoodPortionInput {
  label: string;
  grams: string;
}

export interface CreateFoodRequest {
  name: string;
  brand?: string | null;
  group: FoodGroup;
  nutrients: Nutrients;
  portions?: FoodPortionInput[];
}

export type UpdateFoodRequest = Partial<CreateFoodRequest>;

/**
 * What a trainer may see about nutrition whatever their plan.
 *
 * Reachable on every plan, deliberately. It is what lets a trainer who has
 * downgraded VERIFY that their library is still there rather than take our word
 * for it — a count gives away no nutrition data, and a promise somebody can
 * check is worth more than the same promise asserted.
 */
export interface NutritionStatus {
  available: boolean;
  /** The trainer's own foods, still stored whatever their plan. */
  customFoodCount: number;
  /** The plan that unlocks nutrition, so the upsell names it from one source. */
  requiredPlan: 'GROW';
}

/**
 * When in the day a meal sits.
 *
 * A closed vocabulary beside a free name, exactly as ProgramSection carries a
 * WorkoutType beside its own optional name: the enum drives ordering, labels
 * and — in Step 31 — what a client is asked they ate, while «Перекус після
 * тренування» stays the trainer's own words.
 */
export const MEAL_SLOTS = ['BREAKFAST', 'SNACK', 'LUNCH', 'DINNER'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  BREAKFAST: 'Сніданок',
  SNACK: 'Перекус',
  LUNCH: 'Обід',
  DINNER: 'Вечеря',
};

export const MEAL_NAME_MAX_LENGTH = 120;
export const PLAN_NAME_MAX_LENGTH = 120;
export const SLOT_NAME_MAX_LENGTH = 60;

/** How much of one food is in a meal. Bounded so a typo cannot pass. */
export const ITEM_GRAMS_MIN = '0.01';
export const ITEM_GRAMS_MAX = '5000';

/** How many of a meal a slot may hold. */
export const SERVINGS_MIN = '0.01';
export const SERVINGS_MAX = '20';

export const MAX_ITEMS_PER_MEAL = 40;
export const MAX_SLOTS_PER_PLAN = 12;

/** A day's targets, generous enough for an athlete and bounded against a typo. */
export const TARGET_KCAL_MAX = 10000;
export const TARGET_GRAMS_MAX = 2000;

/** One food inside a meal, with what it weighs and how the trainer wrote it. */
export interface PublicMealItem {
  id: string;
  foodId: string;
  foodName: string;
  /** Canonical. Every total is computed from this and nothing else. */
  grams: string;
  /**
   * How the amount was EXPRESSED, when it was not written in grams.
   *
   * Snapshotted strings rather than a reference: a trainer who later renames or
   * removes a portion cannot restate a meal that was already composed, and
   * there is no dangling row to guard.
   */
  portionLabel: string | null;
  portionCount: string | null;
  /** This line's contribution, scaled from the food's per-100 g profile. */
  nutrients: Nutrients;
}

/** A composition of foods. Trainer-owned: a food is a fact, a meal is a judgement. */
export interface PublicMeal {
  id: string;
  name: string;
  notes: string | null;
  items: PublicMealItem[];
  /** DERIVED on every read, never stored — so a corrected food is never stale. */
  nutrients: Nutrients;
  createdAt: string;
  updatedAt: string;
}

export interface MealPage {
  items: PublicMeal[];
  total: number;
  page: number;
  pageSize: number;
}

export const MEALS_PAGE_SIZE = 20;

export interface MealItemInput {
  foodId: string;
  grams: string;
  portionLabel?: string | null;
  portionCount?: string | null;
}

export interface CreateMealRequest {
  name: string;
  notes?: string | null;
  items: MealItemInput[];
}

export type UpdateMealRequest = Partial<CreateMealRequest>;

/** A day's targets. Every one optional — a trainer may set none. */
export interface NutritionTargets {
  kcal: string | null;
  protein: string | null;
  fat: string | null;
  carbs: string | null;
}

/** One meal in a plan's day, at a time of day. */
export interface PublicPlanSlot {
  id: string;
  slot: MealSlot;
  name: string | null;
  servings: string;
  meal: PublicMeal;
  /** The meal's profile times `servings`. */
  nutrients: Nutrients;
}

/**
 * A day's eating, as a reusable template.
 *
 * ONE DAY and not a week, which is the Program precedent rather than a
 * shortcut: a Program is one workout and the schedule lives on the assignment,
 * so a trainer wanting a different Tuesday assigns a second one. Nutrition
 * takes the identical shape.
 */
export interface PublicMealPlan {
  id: string;
  name: string;
  targets: NutritionTargets;
  slots: PublicPlanSlot[];
  /** The whole day, derived. */
  nutrients: Nutrients;
  createdAt: string;
  updatedAt: string;
}

export interface PlanSlotInput {
  slot: MealSlot;
  name?: string | null;
  mealId: string;
  servings?: string;
}

export interface CreateMealPlanRequest {
  name: string;
  targets?: Partial<NutritionTargets>;
  slots: PlanSlotInput[];
}

export type UpdateMealPlanRequest = Partial<CreateMealPlanRequest>;

/**
 * What a plan delivers against what it aims at.
 *
 * Arithmetic on the trainer's OWN numbers, not a formula. Gart names no
 * clinical authority it has not earned: the target is whatever the trainer
 * decided, and this is the subtraction they would otherwise do by hand.
 */
export interface TargetComparison {
  target: string | null;
  planned: string;
  /** planned − target, signed, or null when no target is set. */
  difference: string | null;
}

export interface PlanTargetReport {
  kcal: TargetComparison;
  protein: TargetComparison;
  fat: TargetComparison;
  carbs: TargetComparison;
}

/**
 * planned − target as a signed decimal string, or null without a target.
 *
 * The one place a nutrition figure may be negative, and it is a difference
 * rather than an amount — which is why `fromCenti` refuses negatives and this
 * renders the sign itself.
 */
export function compareToTarget(planned: string, target: string | null): TargetComparison {
  if (target === null) {
    return { target: null, planned, difference: null };
  }

  const plannedCenti = toCenti(planned);
  const targetCenti = toCenti(target);

  if (plannedCenti === null || targetCenti === null) {
    return { target, planned, difference: null };
  }

  const delta = plannedCenti - targetCenti;
  const rendered = fromCenti(Math.abs(delta));

  return { target, planned, difference: delta < 0 ? `-${rendered}` : rendered };
}

/**
 * One frozen meal in a client's assigned day.
 *
 * Deliberately NOT a `PublicMeal`: an assigned meal has no template identity
 * behind it — the composition is the snapshot — so it carries no created or
 * updated timestamps of its own, and inventing them to satisfy a shared type
 * would be a fiction the client app could read.
 */
export interface PublicAssignedMeal {
  id: string;
  slot: MealSlot;
  name: string;
  /** Preparation guidance the trainer wrote, snapshotted with the rest. */
  notes: string | null;
  servings: string;
  items: PublicMealItem[];
  /** The composition times `servings`. */
  nutrients: Nutrients;
}

/**
 * A plan as a client has it: an independent copy, not a view of a template.
 *
 * `sourcePlanId` is provenance only. Nothing here changes when the trainer
 * edits or deletes the plan it came from — but the FOODS are read live, so a
 * corrected nutrition figure does reach it.
 */
export interface PublicAssignedPlan {
  id: string;
  name: string;
  targets: NutritionTargets;
  meals: PublicAssignedMeal[];
  /** The whole day, derived. */
  nutrients: Nutrients;
  startDate: string;
  endDate: string | null;
  daysOfWeek: DayOfWeek[];
  assignedAt: string;
}

/** The trainer's view of one assignment, with who it went to. */
export interface TrainerAssignedPlan extends PublicAssignedPlan {
  clientId: string;
  clientName: string;
  sourcePlanId: string | null;
}

export interface AssignMealPlanRequest {
  planId: string;
  clientId: string;
  startDate: string;
  endDate?: string | null;
  daysOfWeek: DayOfWeek[];
}

/**
 * The nutrition section as a client sees it.
 *
 * `available` is DATA rather than a refusal, and that is the point. Nutrition
 * is a tier their trainer buys, so it can stop — but a client is not the payer
 * and must never be handed a 402, an error, or anything about somebody else's
 * billing. The app renders «Розділ харчування зараз недоступний»: honest about
 * the section, silent about the reason, and blaming nobody.
 *
 * Their plans are untouched underneath and return the moment it is available
 * again.
 */
export interface ClientNutrition {
  available: boolean;
  plans: PublicAssignedPlan[];
}
