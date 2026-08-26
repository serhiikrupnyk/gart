import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  FOOD_BRAND_MAX_LENGTH,
  FOOD_GROUPS,
  FOOD_NAME_MAX_LENGTH,
  FOODS_PAGE_SIZE,
  MAX_PORTIONS_PER_FOOD,
  PORTION_LABEL_MAX_LENGTH,
  type FoodGroup,
} from '@gart/shared';

import { trimmed } from '../../auth/dto/transforms';

const AMOUNT_MESSAGE = 'Некоректне значення поживності';

/** The page-size ceiling, matching the exercise library's. */
export const MAX_FOODS_PAGE_SIZE = 100;

/**
 * «Absent» for a field that may be omitted but never nulled.
 *
 * `@IsOptional` skips every sibling validator on `null` as well as `undefined`,
 * which would wave `{"nutrients": null}` straight through to code that expects
 * an object — turning «clear this» into a 500 instead of a 400. The exercise
 * library's UpdateExerciseDto learned this already; the same rule applies here.
 */
const ifPresent = (_object: unknown, value: unknown): boolean => value !== undefined;

export class FoodPortionDto {
  @Transform(trimmed)
  @IsString({ message: 'Введіть назву порції' })
  @MinLength(1, { message: 'Введіть назву порції' })
  @MaxLength(PORTION_LABEL_MAX_LENGTH, { message: 'Назва порції задовга' })
  label!: string;

  @IsString({ message: 'Некоректна вага порції' })
  @MaxLength(12, { message: 'Некоректна вага порції' })
  grams!: string;
}

/**
 * The nutrient block, as strings.
 *
 * Optional fields accept null explicitly, because null means NOT MEASURED and
 * is a different statement from zero — a food nobody measured the fibre of is
 * not a food with no fibre.
 */
export class NutrientsDto {
  @IsString({ message: AMOUNT_MESSAGE })
  @MaxLength(12, { message: AMOUNT_MESSAGE })
  kcal!: string;

  @IsString({ message: AMOUNT_MESSAGE })
  @MaxLength(12, { message: AMOUNT_MESSAGE })
  protein!: string;

  @IsString({ message: AMOUNT_MESSAGE })
  @MaxLength(12, { message: AMOUNT_MESSAGE })
  fat!: string;

  @IsString({ message: AMOUNT_MESSAGE })
  @MaxLength(12, { message: AMOUNT_MESSAGE })
  carbs!: string;

  @IsOptional()
  @IsString({ message: AMOUNT_MESSAGE })
  @MaxLength(12, { message: AMOUNT_MESSAGE })
  fibre?: string | null;

  @IsOptional()
  @IsString({ message: AMOUNT_MESSAGE })
  @MaxLength(12, { message: AMOUNT_MESSAGE })
  sugars?: string | null;

  @IsOptional()
  @IsString({ message: AMOUNT_MESSAGE })
  @MaxLength(12, { message: AMOUNT_MESSAGE })
  saturatedFat?: string | null;

  @IsOptional()
  @IsString({ message: AMOUNT_MESSAGE })
  @MaxLength(12, { message: AMOUNT_MESSAGE })
  salt?: string | null;
}

export class CreateFoodDto {
  @Transform(trimmed)
  @IsString({ message: 'Введіть назву продукту' })
  @MinLength(1, { message: 'Введіть назву продукту' })
  @MaxLength(FOOD_NAME_MAX_LENGTH, { message: 'Назва задовга' })
  name!: string;

  @Transform(trimmed)
  @IsOptional()
  @IsString({ message: 'Некоректний бренд' })
  @MaxLength(FOOD_BRAND_MAX_LENGTH, { message: 'Назва бренду задовга' })
  brand?: string | null;

  @IsIn([...FOOD_GROUPS], { message: 'Оберіть групу продукту' })
  group!: FoodGroup;

  @IsObject({ message: AMOUNT_MESSAGE })
  @ValidateNested()
  @Type(() => NutrientsDto)
  nutrients!: NutrientsDto;

  @IsOptional()
  @IsArray({ message: 'Некоректні порції' })
  @ArrayMaxSize(MAX_PORTIONS_PER_FOOD, { message: 'Забагато порцій' })
  @ValidateNested({ each: true })
  @Type(() => FoodPortionDto)
  portions?: FoodPortionDto[];
}

/**
 * Every field optional, and a portions array REPLACES the whole set rather than
 * merging — a partial merge of an unordered list has no honest semantics, and
 * the editor sends the list it is showing.
 */
export class UpdateFoodDto {
  @Transform(trimmed)
  @ValidateIf(ifPresent)
  @IsString({ message: 'Введіть назву продукту' })
  @MinLength(1, { message: 'Введіть назву продукту' })
  @MaxLength(FOOD_NAME_MAX_LENGTH, { message: 'Назва задовга' })
  name?: string;

  @Transform(trimmed)
  @IsOptional()
  @IsString({ message: 'Некоректний бренд' })
  @MaxLength(FOOD_BRAND_MAX_LENGTH, { message: 'Назва бренду задовга' })
  brand?: string | null;

  @ValidateIf(ifPresent)
  @IsIn([...FOOD_GROUPS], { message: 'Оберіть групу продукту' })
  group?: FoodGroup;

  @ValidateIf(ifPresent)
  @IsObject({ message: AMOUNT_MESSAGE })
  @ValidateNested()
  @Type(() => NutrientsDto)
  nutrients?: NutrientsDto;

  @ValidateIf(ifPresent)
  @IsArray({ message: 'Некоректні порції' })
  @ArrayMaxSize(MAX_PORTIONS_PER_FOOD, { message: 'Забагато порцій' })
  @ValidateNested({ each: true })
  @Type(() => FoodPortionDto)
  portions?: FoodPortionDto[];
}

/** Mirrors ListExercisesQuery, including a client-settable, validated page size. */
export class ListFoodsQuery {
  @Type(() => Number)
  @IsInt({ message: 'Некоректна сторінка' })
  @Min(1, { message: 'Некоректна сторінка' })
  page: number = 1;

  @Type(() => Number)
  @IsInt({ message: 'Некоректний розмір сторінки' })
  @Min(1, { message: 'Некоректний розмір сторінки' })
  @Max(MAX_FOODS_PAGE_SIZE, { message: `Не більше ${String(MAX_FOODS_PAGE_SIZE)} на сторінку` })
  pageSize: number = FOODS_PAGE_SIZE;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Некоректний пошук' })
  @MaxLength(FOOD_NAME_MAX_LENGTH, { message: 'Пошуковий запит задовгий' })
  search?: string;

  @IsOptional()
  @IsIn([...FOOD_GROUPS], { message: 'Невідома група продуктів' })
  group?: FoodGroup;

  /** «Only my own», so a trainer can find what they added without scrolling the library. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean({ message: 'Некоректний фільтр' })
  mineOnly?: boolean;
}
