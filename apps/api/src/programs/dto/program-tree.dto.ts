import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { LOAD_UNITS, WORKOUT_TYPES, type LoadUnit, type WorkoutType } from '@gart/shared';

import { trimmed } from '../../auth/dto/transforms';

export const MAX_SECTIONS = 30;
export const MAX_EXERCISES_PER_SECTION = 50;

/**
 * One prescribed line. No `order` and no `id`: the array position is the only
 * source of order, and the tree is replaced wholesale on save — there is
 * nothing for a client to reference or contradict.
 *
 * Cross-field coherence (load value ⇔ unit, per-type section structure) lives
 * in program-rules.ts, where it is a readable table rather than decorator soup.
 */
export class ProgramExerciseDto {
  @IsString({ message: 'Некоректна вправа' })
  @MaxLength(50, { message: 'Некоректна вправа' })
  exerciseId!: string;

  @IsOptional()
  @IsInt({ message: 'Некоректна кількість підходів' })
  @Min(1, { message: 'Некоректна кількість підходів' })
  @Max(100, { message: 'Некоректна кількість підходів' })
  sets?: number | null;

  @IsOptional()
  @IsInt({ message: 'Некоректна кількість повторень' })
  @Min(1, { message: 'Некоректна кількість повторень' })
  @Max(1000, { message: 'Некоректна кількість повторень' })
  reps?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Некоректне навантаження' })
  @Min(0, { message: 'Некоректне навантаження' })
  @Max(9999.99, { message: 'Некоректне навантаження' })
  loadValue?: number | null;

  @IsOptional()
  @IsIn(LOAD_UNITS, { message: 'Некоректна одиниця навантаження' })
  loadUnit?: LoadUnit | null;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Некоректне навантаження' })
  @MaxLength(100, { message: 'Опис навантаження задовгий' })
  loadText?: string | null;

  @IsOptional()
  @IsInt({ message: 'Некоректний відпочинок' })
  @Min(0, { message: 'Некоректний відпочинок' })
  @Max(3600, { message: 'Некоректний відпочинок' })
  restSeconds?: number | null;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Некоректний темп' })
  @MaxLength(20, { message: 'Темп задовгий' })
  tempo?: string | null;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Некоректні нотатки' })
  @MaxLength(500, { message: 'Нотатки задовгі' })
  notes?: string | null;

  @IsOptional()
  @IsInt({ message: 'Некоректна тривалість' })
  @Min(1, { message: 'Некоректна тривалість' })
  @Max(36000, { message: 'Некоректна тривалість' })
  durationSeconds?: number | null;

  @IsOptional()
  @IsInt({ message: 'Некоректна дистанція' })
  @Min(1, { message: 'Некоректна дистанція' })
  @Max(1_000_000, { message: 'Некоректна дистанція' })
  distanceMeters?: number | null;
}

export class ProgramSectionDto {
  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Некоректна назва секції' })
  @MaxLength(120, { message: 'Назва секції задовга' })
  name?: string | null;

  @IsIn(WORKOUT_TYPES, { message: 'Некоректний тип секції' })
  type!: WorkoutType;

  @IsOptional()
  @IsInt({ message: 'Некоректний ліміт часу' })
  @Min(10, { message: 'Некоректний ліміт часу' })
  @Max(14400, { message: 'Некоректний ліміт часу' })
  timeCapSeconds?: number | null;

  @IsOptional()
  @IsInt({ message: 'Некоректний інтервал' })
  @Min(10, { message: 'Некоректний інтервал' })
  @Max(3600, { message: 'Некоректний інтервал' })
  intervalSeconds?: number | null;

  @IsOptional()
  @IsInt({ message: 'Некоректна кількість раундів' })
  @Min(1, { message: 'Некоректна кількість раундів' })
  @Max(100, { message: 'Некоректна кількість раундів' })
  rounds?: number | null;

  @IsOptional()
  @IsInt({ message: 'Некоректний відпочинок між раундами' })
  @Min(0, { message: 'Некоректний відпочинок між раундами' })
  @Max(3600, { message: 'Некоректний відпочинок між раундами' })
  restBetweenRoundsSeconds?: number | null;

  @IsArray({ message: 'Некоректний список вправ' })
  @ValidateNested({ each: true })
  @Type(() => ProgramExerciseDto)
  @ArrayMaxSize(MAX_EXERCISES_PER_SECTION, { message: 'Забагато вправ у секції' })
  exercises!: ProgramExerciseDto[];
}
