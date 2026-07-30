import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { MUSCLE_GROUPS, type MuscleGroup } from '@gart/shared';

import { trimmed } from '../../auth/dto/transforms';
import {
  DESCRIPTION_MAX_LENGTH,
  EXERCISE_NAME_MAX_LENGTH,
  ID_MAX_LENGTH,
  INSTRUCTIONS_MAX_LENGTH,
} from './create-exercise.dto';

/** Validate unless the field is absent — so an explicit `null` still gets checked. */
const ifPresent = (_object: object, value: unknown): boolean => value !== undefined;

/**
 * PATCH semantics: absent = unchanged, null = cleared.
 *
 * Nullable columns use @IsOptional, which lets null through as the clear
 * signal. Non-nullable ones (name, muscle groups) use @ValidateIf instead —
 * @IsOptional would wave null through to Prisma, turning "clear my exercise
 * name" into a 500 instead of a 400.
 */
export class UpdateExerciseDto {
  @ValidateIf(ifPresent)
  @Transform(trimmed)
  @IsString({ message: 'Введіть назву вправи' })
  @MinLength(1, { message: 'Введіть назву вправи' })
  @MaxLength(EXERCISE_NAME_MAX_LENGTH, { message: 'Назва задовга' })
  name?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Некоректний опис' })
  @MaxLength(DESCRIPTION_MAX_LENGTH, { message: 'Опис задовгий' })
  description?: string | null;

  @ValidateIf(ifPresent)
  @IsIn(MUSCLE_GROUPS, { message: "Некоректна група м'язів" })
  primaryMuscleGroup?: MuscleGroup;

  @ValidateIf(ifPresent)
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
