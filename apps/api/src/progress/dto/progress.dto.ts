import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PROGRESS_PHOTO_RULES, PROGRESS_VALUE_MAX, PROGRESS_VALUE_MIN } from '@gart/shared';

import { trimmed } from '../../auth/dto/transforms';

const DATE_MESSAGE = 'Дата має бути у форматі РРРР-ММ-ДД';
const NAME_MESSAGE = 'Некоректна назва';
const UNIT_MESSAGE = 'Некоректна одиниця';
const VALUE_MESSAGE = 'Некоректне значення';

export class CreateProgressVariableDto {
  @Transform(trimmed)
  @IsString({ message: NAME_MESSAGE })
  @MinLength(1, { message: NAME_MESSAGE })
  @MaxLength(60, { message: 'Назва задовга' })
  name!: string;

  @Transform(trimmed)
  @IsString({ message: UNIT_MESSAGE })
  @MinLength(1, { message: UNIT_MESSAGE })
  @MaxLength(16, { message: 'Одиниця задовга' })
  unit!: string;

  @IsOptional()
  @IsBoolean({ message: 'Некоректний доступ клієнта' })
  selfLog?: boolean;
}

export class UpdateProgressVariableDto {
  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: NAME_MESSAGE })
  @MinLength(1, { message: NAME_MESSAGE })
  @MaxLength(60, { message: 'Назва задовга' })
  name?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: UNIT_MESSAGE })
  @MinLength(1, { message: UNIT_MESSAGE })
  @MaxLength(16, { message: 'Одиниця задовга' })
  unit?: string;

  @IsOptional()
  @IsBoolean({ message: 'Некоректний доступ клієнта' })
  selfLog?: boolean;
}

/** The date is the other half of the entry's address, so it lives in the path. */
export class EntryParamsDto {
  @IsString({ message: 'Некоректна змінна' })
  @MaxLength(50, { message: 'Некоректна змінна' })
  id!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  date!: string;
}

export class SaveProgressEntryDto {
  @IsNumber({ maxDecimalPlaces: 2 }, { message: VALUE_MESSAGE })
  @Min(PROGRESS_VALUE_MIN, { message: VALUE_MESSAGE })
  @Max(PROGRESS_VALUE_MAX, { message: VALUE_MESSAGE })
  value!: number;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Некоректна нотатка' })
  @MaxLength(300, { message: 'Нотатка задовга' })
  notes?: string | null;
}

export class ProgressRangeQuery {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  to?: string;
}

export class PresignProgressPhotoDto {
  @IsString({ message: 'Некоректний тип файлу' })
  @MaxLength(100, { message: 'Некоректний тип файлу' })
  contentType!: string;

  @IsInt({ message: 'Некоректний розмір файлу' })
  @Min(1, { message: 'Некоректний розмір файлу' })
  @Max(PROGRESS_PHOTO_RULES.maxSizeBytes, { message: 'Файл завеликий' })
  sizeBytes!: number;
}

export class FinalizeProgressPhotoDto {
  @IsString({ message: 'Некоректне завантаження' })
  @MaxLength(300, { message: 'Некоректне завантаження' })
  key!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  date!: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Некоректна підпис' })
  @MaxLength(60, { message: 'Підпис задовгий' })
  label?: string | null;
}
