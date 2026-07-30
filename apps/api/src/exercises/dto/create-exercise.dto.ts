import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MUSCLE_GROUPS, type MuscleGroup } from '@gart/shared';

import { trimmed } from '../../auth/dto/transforms';

export const EXERCISE_NAME_MAX_LENGTH = 120;
export const DESCRIPTION_MAX_LENGTH = 2000;
export const INSTRUCTIONS_MAX_LENGTH = 5000;
export const ID_MAX_LENGTH = 50;

export class CreateExerciseDto {
  @Transform(trimmed)
  @IsString({ message: 'Введіть назву вправи' })
  @MinLength(1, { message: 'Введіть назву вправи' })
  @MaxLength(EXERCISE_NAME_MAX_LENGTH, { message: 'Назва задовга' })
  name!: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Некоректний опис' })
  @MaxLength(DESCRIPTION_MAX_LENGTH, { message: 'Опис задовгий' })
  description?: string | null;

  @IsIn(MUSCLE_GROUPS, { message: "Некоректна група м'язів" })
  primaryMuscleGroup!: MuscleGroup;

  /** Secondary groups; the primary is not repeated here. */
  @IsOptional()
  @IsArray({ message: "Некоректний список груп м'язів" })
  @IsIn(MUSCLE_GROUPS, { each: true, message: "Некоректна група м'язів" })
  @ArrayMaxSize(MUSCLE_GROUPS.length, { message: "Забагато груп м'язів" })
  muscleGroups?: MuscleGroup[];

  @IsOptional()
  @IsString({ message: 'Некоректна категорія' })
  @MaxLength(ID_MAX_LENGTH, { message: 'Некоректна категорія' })
  categoryId?: string | null;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Некоректні інструкції' })
  @MaxLength(INSTRUCTIONS_MAX_LENGTH, { message: 'Інструкції задовгі' })
  textInstructions?: string | null;
}
