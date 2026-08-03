import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { trimmed } from '../../auth/dto/transforms';

export const MAX_SETS_PER_LOG = 50;

/**
 * One actual set. No `order` and no `id`: array position is the order and the
 * list is replaced wholesale on save — the same contract as program trees and
 * assignment snapshots, so there is one replace semantics in the codebase.
 *
 * A `reps: 0` set is legitimate — a failed attempt is data, not an error.
 */
export class WorkoutSetDto {
  @IsOptional()
  @IsInt({ message: 'Некоректна кількість повторень' })
  @Min(0, { message: 'Некоректна кількість повторень' })
  @Max(1000, { message: 'Некоректна кількість повторень' })
  reps?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Некоректна вага' })
  @Min(0, { message: 'Некоректна вага' })
  @Max(1000, { message: 'Некоректна вага' })
  loadKg?: number | null;

  @IsOptional()
  @IsInt({ message: 'Некоректна тривалість' })
  @Min(0, { message: 'Некоректна тривалість' })
  @Max(36000, { message: 'Некоректна тривалість' })
  durationSeconds?: number | null;

  @IsOptional()
  @IsInt({ message: 'Некоректна дистанція' })
  @Min(0, { message: 'Некоректна дистанція' })
  @Max(1_000_000, { message: 'Некоректна дистанція' })
  distanceMeters?: number | null;
}

export class LogWorkoutExerciseDto {
  @IsBoolean({ message: 'Некоректна відмітка виконання' })
  completed!: boolean;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Некоректні нотатки' })
  @MaxLength(500, { message: 'Нотатки задовгі' })
  notes?: string | null;

  @IsArray({ message: 'Некоректний список підходів' })
  @ValidateNested({ each: true })
  @Type(() => WorkoutSetDto)
  @ArrayMaxSize(MAX_SETS_PER_LOG, { message: 'Забагато підходів' })
  sets!: WorkoutSetDto[];
}

/**
 * The log's address: a snapshot exercise and a date. Both path params live in
 * one DTO because the global pipe whitelists — a DTO covering only half of
 * them would reject the other half. Calendar validity is checked on parse.
 */
export class LogParamsDto {
  @IsString({ message: 'Некоректна вправа' })
  @MaxLength(50, { message: 'Некоректна вправа' })
  id!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Дата має бути у форматі РРРР-ММ-ДД' })
  date!: string;
}
