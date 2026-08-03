import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { HABIT_KINDS, HABIT_TARGET_MAX, HABIT_TARGET_MIN, type HabitKind } from '@gart/shared';

import { trimmed } from '../../auth/dto/transforms';

const NAME_MESSAGE = 'Некоректна назва';
const UNIT_MESSAGE = 'Некоректна одиниця';
const TARGET_MESSAGE = 'Некоректна ціль';
const DATE_MESSAGE = 'Дата має бути у форматі РРРР-ММ-ДД';

/** Cross-field coherence lives in habit-rules, where both fields are visible. */
export class CreateHabitDto {
  @Transform(trimmed)
  @IsString({ message: NAME_MESSAGE })
  @MinLength(1, { message: NAME_MESSAGE })
  @MaxLength(60, { message: 'Назва задовга' })
  name!: string;

  @IsIn(HABIT_KINDS, { message: 'Некоректний тип звички' })
  kind!: HabitKind;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: TARGET_MESSAGE })
  @Min(HABIT_TARGET_MIN, { message: TARGET_MESSAGE })
  @Max(HABIT_TARGET_MAX, { message: TARGET_MESSAGE })
  targetValue?: number;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: UNIT_MESSAGE })
  @MaxLength(16, { message: 'Одиниця задовга' })
  unit?: string | null;
}

export class UpdateHabitDto {
  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: NAME_MESSAGE })
  @MinLength(1, { message: NAME_MESSAGE })
  @MaxLength(60, { message: 'Назва задовга' })
  name?: string;

  @IsOptional()
  @IsIn(HABIT_KINDS, { message: 'Некоректний тип звички' })
  kind?: HabitKind;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: TARGET_MESSAGE })
  @Min(HABIT_TARGET_MIN, { message: TARGET_MESSAGE })
  @Max(HABIT_TARGET_MAX, { message: TARGET_MESSAGE })
  targetValue?: number;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: UNIT_MESSAGE })
  @MaxLength(16, { message: 'Одиниця задовга' })
  unit?: string | null;
}

/** «Сьогодні» is the device's date, so the caller supplies it. */
export class HabitsQuery {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  date?: string;
}

export class HabitLogParamsDto {
  @IsString({ message: 'Некоректна звичка' })
  @MaxLength(50, { message: 'Некоректна звичка' })
  id!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  date!: string;
}

export class LogHabitDto {
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Некоректне значення' })
  @Min(0, { message: 'Некоректне значення' })
  @Max(HABIT_TARGET_MAX, { message: 'Некоректне значення' })
  value!: number;
}
