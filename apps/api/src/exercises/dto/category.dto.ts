import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { trimmed } from '../../auth/dto/transforms';

export const CATEGORY_NAME_MAX_LENGTH = 50;

/** Used for both create and rename — a category is nothing but its name. */
export class CategoryDto {
  @Transform(trimmed)
  @IsString({ message: 'Введіть назву категорії' })
  @MinLength(1, { message: 'Введіть назву категорії' })
  @MaxLength(CATEGORY_NAME_MAX_LENGTH, { message: 'Назва задовга' })
  name!: string;
}
