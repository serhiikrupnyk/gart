import { BadRequestException } from '@nestjs/common';
import { HABIT_TARGET_MAX, HABIT_TARGET_MIN, type HabitKind } from '@gart/shared';

const CHECK_TARGET_MESSAGE = 'Звичка «так або ні» не має цілі';
const CHECK_UNIT_MESSAGE = 'Звичка «так або ні» не має одиниці';
const AMOUNT_UNIT_MESSAGE = 'Вкажіть одиницю (склянок, кроків, год)';
const TARGET_RANGE_MESSAGE = 'Некоректна ціль';

export interface HabitShape {
  kind: HabitKind;
  targetValue: number;
  unit: string | null;
}

/**
 * The one place the two kinds are told apart, so a combination like «checkbox
 * habit with a target of 8» cannot reach the database. Same idea as the
 * program section rules: a readable table of what each kind may carry, rather
 * than decorators that can only see one field at a time.
 *
 * A CHECK habit is stored as a target of 1 — uniform storage is what lets
 * `value >= targetValue` decide every day for every kind.
 */
export function resolveHabitShape(
  kind: HabitKind,
  targetValue: number | undefined,
  unit: string | null | undefined,
): HabitShape {
  const cleanUnit = unit == null || unit === '' ? null : unit;

  if (kind === 'CHECK') {
    if (targetValue !== undefined && targetValue !== 1) {
      throw new BadRequestException(CHECK_TARGET_MESSAGE);
    }
    if (cleanUnit !== null) {
      throw new BadRequestException(CHECK_UNIT_MESSAGE);
    }

    return { kind, targetValue: 1, unit: null };
  }

  if (cleanUnit === null) {
    throw new BadRequestException(AMOUNT_UNIT_MESSAGE);
  }
  if (
    targetValue === undefined ||
    targetValue < HABIT_TARGET_MIN ||
    targetValue > HABIT_TARGET_MAX
  ) {
    throw new BadRequestException(TARGET_RANGE_MESSAGE);
  }

  return { kind, targetValue, unit: cleanUnit };
}
