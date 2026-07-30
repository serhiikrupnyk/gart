import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MUSCLE_GROUPS, type MuscleGroup } from '@gart/shared';

import { trimmed } from '../../auth/dto/transforms';
import { ID_MAX_LENGTH } from './create-exercise.dto';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export class ListExercisesQuery {
  @Type(() => Number)
  @IsInt({ message: 'Некоректна сторінка' })
  @Min(1, { message: 'Некоректна сторінка' })
  page: number = 1;

  @Type(() => Number)
  @IsInt({ message: 'Некоректний розмір сторінки' })
  @Min(1, { message: 'Некоректний розмір сторінки' })
  @Max(MAX_PAGE_SIZE, { message: `Не більше ${String(MAX_PAGE_SIZE)} на сторінку` })
  pageSize: number = DEFAULT_PAGE_SIZE;

  /** Matches the primary or any secondary muscle group. */
  @IsOptional()
  @IsIn(MUSCLE_GROUPS, { message: "Некоректна група м'язів" })
  muscleGroup?: MuscleGroup;

  @IsOptional()
  @IsString({ message: 'Некоректна категорія' })
  @MaxLength(ID_MAX_LENGTH, { message: 'Некоректна категорія' })
  categoryId?: string;

  /** Case-insensitive substring match on the name. */
  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Некоректний пошук' })
  @MaxLength(100, { message: 'Запит задовгий' })
  search?: string;
}
