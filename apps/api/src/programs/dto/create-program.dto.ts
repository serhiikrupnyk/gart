import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { WORKOUT_TYPES, type WorkoutType } from '@gart/shared';

import { trimmed } from '../../auth/dto/transforms';
import { MAX_SECTIONS, ProgramSectionDto } from './program-tree.dto';

export class CreateProgramDto {
  @Transform(trimmed)
  @IsString({ message: 'Введіть назву програми' })
  @MinLength(1, { message: 'Введіть назву програми' })
  @MaxLength(120, { message: 'Назва задовга' })
  name!: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Некоректний опис' })
  @MaxLength(2000, { message: 'Опис задовгий' })
  description?: string | null;

  @IsIn(WORKOUT_TYPES, { message: 'Некоректний тип програми' })
  type!: WorkoutType;

  /** An empty array is a valid draft — the builder saves early and often. */
  @IsArray({ message: 'Некоректний список секцій' })
  @ValidateNested({ each: true })
  @Type(() => ProgramSectionDto)
  @ArrayMaxSize(MAX_SECTIONS, { message: 'Забагато секцій' })
  sections!: ProgramSectionDto[];
}

/** Validate unless absent — so an explicit null on non-nullable fields still 400s. */
const ifPresent = (_object: object, value: unknown): boolean => value !== undefined;

/**
 * PATCH: meta fields update in place; a present `sections` array replaces the
 * whole tree in one transaction. Absent = unchanged, null clears description.
 */
export class UpdateProgramDto {
  @ValidateIf(ifPresent)
  @Transform(trimmed)
  @IsString({ message: 'Введіть назву програми' })
  @MinLength(1, { message: 'Введіть назву програми' })
  @MaxLength(120, { message: 'Назва задовга' })
  name?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Некоректний опис' })
  @MaxLength(2000, { message: 'Опис задовгий' })
  description?: string | null;

  @ValidateIf(ifPresent)
  @IsIn(WORKOUT_TYPES, { message: 'Некоректний тип програми' })
  type?: WorkoutType;

  @ValidateIf(ifPresent)
  @IsArray({ message: 'Некоректний список секцій' })
  @ValidateNested({ each: true })
  @Type(() => ProgramSectionDto)
  @ArrayMaxSize(MAX_SECTIONS, { message: 'Забагато секцій' })
  sections?: ProgramSectionDto[];
}

export class ListProgramsQuery {
  @Type(() => Number)
  @IsInt({ message: 'Некоректна сторінка' })
  @Min(1, { message: 'Некоректна сторінка' })
  page = 1;

  @Type(() => Number)
  @IsInt({ message: 'Некоректний розмір сторінки' })
  @Min(1, { message: 'Некоректний розмір сторінки' })
  @Max(100, { message: 'Не більше 100 на сторінку' })
  pageSize = 20;
}
