import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
import {
  MAX_ITEMS_PER_MEAL,
  MAX_SLOTS_PER_PLAN,
  MEAL_NAME_MAX_LENGTH,
  MEAL_SLOTS,
  MEALS_PAGE_SIZE,
  PLAN_NAME_MAX_LENGTH,
  SLOT_NAME_MAX_LENGTH,
  type MealSlot,
} from '@gart/shared';

import { trimmed } from '../../auth/dto/transforms';

/** «Absent», for a field that may be omitted but never nulled — see UpdateFoodDto. */
const ifPresent = (_object: unknown, value: unknown): boolean => value !== undefined;

const ID_MAX_LENGTH = 40;
const AMOUNT_MESSAGE = 'Некоректна кількість';

export class MealItemDto {
  @IsString({ message: 'Оберіть продукт' })
  @MaxLength(ID_MAX_LENGTH, { message: 'Оберіть продукт' })
  foodId!: string;

  @IsString({ message: AMOUNT_MESSAGE })
  @MaxLength(12, { message: AMOUNT_MESSAGE })
  grams!: string;

  @Transform(trimmed)
  @IsOptional()
  @IsString({ message: 'Некоректна порція' })
  @MaxLength(60, { message: 'Назва порції задовга' })
  portionLabel?: string | null;

  @IsOptional()
  @IsString({ message: AMOUNT_MESSAGE })
  @MaxLength(12, { message: AMOUNT_MESSAGE })
  portionCount?: string | null;
}

export class CreateMealDto {
  @Transform(trimmed)
  @IsString({ message: 'Введіть назву страви' })
  @MinLength(1, { message: 'Введіть назву страви' })
  @MaxLength(MEAL_NAME_MAX_LENGTH, { message: 'Назва задовга' })
  name!: string;

  @Transform(trimmed)
  @IsOptional()
  @IsString({ message: 'Некоректна нотатка' })
  @MaxLength(500, { message: 'Нотатка задовга' })
  notes?: string | null;

  @IsArray({ message: 'Додайте продукти' })
  @ArrayMinSize(1, { message: 'Страва має містити хоча б один продукт' })
  @ArrayMaxSize(MAX_ITEMS_PER_MEAL, { message: 'Забагато продуктів' })
  @ValidateNested({ each: true })
  @Type(() => MealItemDto)
  items!: MealItemDto[];
}

/** Items REPLACE the whole set — a partial merge of an ordered list has no honest semantics. */
export class UpdateMealDto {
  @Transform(trimmed)
  @ValidateIf(ifPresent)
  @IsString({ message: 'Введіть назву страви' })
  @MinLength(1, { message: 'Введіть назву страви' })
  @MaxLength(MEAL_NAME_MAX_LENGTH, { message: 'Назва задовга' })
  name?: string;

  @Transform(trimmed)
  @IsOptional()
  @IsString({ message: 'Некоректна нотатка' })
  @MaxLength(500, { message: 'Нотатка задовга' })
  notes?: string | null;

  @ValidateIf(ifPresent)
  @IsArray({ message: 'Додайте продукти' })
  @ArrayMinSize(1, { message: 'Страва має містити хоча б один продукт' })
  @ArrayMaxSize(MAX_ITEMS_PER_MEAL, { message: 'Забагато продуктів' })
  @ValidateNested({ each: true })
  @Type(() => MealItemDto)
  items?: MealItemDto[];
}

export class ListMealsQuery {
  @Type(() => Number)
  @IsInt({ message: 'Некоректна сторінка' })
  @Min(1, { message: 'Некоректна сторінка' })
  page: number = 1;

  @Type(() => Number)
  @IsInt({ message: 'Некоректний розмір сторінки' })
  @Min(1, { message: 'Некоректний розмір сторінки' })
  @Max(100, { message: 'Не більше 100 на сторінку' })
  pageSize: number = MEALS_PAGE_SIZE;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Некоректний пошук' })
  @MaxLength(MEAL_NAME_MAX_LENGTH, { message: 'Пошуковий запит задовгий' })
  search?: string;
}

export class TargetsDto {
  @IsOptional()
  @IsString({ message: AMOUNT_MESSAGE })
  @MaxLength(12, { message: AMOUNT_MESSAGE })
  kcal?: string | null;

  @IsOptional()
  @IsString({ message: AMOUNT_MESSAGE })
  @MaxLength(12, { message: AMOUNT_MESSAGE })
  protein?: string | null;

  @IsOptional()
  @IsString({ message: AMOUNT_MESSAGE })
  @MaxLength(12, { message: AMOUNT_MESSAGE })
  fat?: string | null;

  @IsOptional()
  @IsString({ message: AMOUNT_MESSAGE })
  @MaxLength(12, { message: AMOUNT_MESSAGE })
  carbs?: string | null;
}

export class PlanSlotDto {
  @IsIn([...MEAL_SLOTS], { message: 'Оберіть прийом їжі' })
  slot!: MealSlot;

  @Transform(trimmed)
  @IsOptional()
  @IsString({ message: 'Некоректна назва' })
  @MaxLength(SLOT_NAME_MAX_LENGTH, { message: 'Назва задовга' })
  name?: string | null;

  @IsString({ message: 'Оберіть страву' })
  @MaxLength(ID_MAX_LENGTH, { message: 'Оберіть страву' })
  mealId!: string;

  @IsOptional()
  @IsString({ message: AMOUNT_MESSAGE })
  @MaxLength(12, { message: AMOUNT_MESSAGE })
  servings?: string;
}

export class CreateMealPlanDto {
  @Transform(trimmed)
  @IsString({ message: 'Введіть назву плану' })
  @MinLength(1, { message: 'Введіть назву плану' })
  @MaxLength(PLAN_NAME_MAX_LENGTH, { message: 'Назва задовга' })
  name!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TargetsDto)
  targets?: TargetsDto;

  @IsArray({ message: 'Додайте прийоми їжі' })
  @ArrayMinSize(1, { message: 'План має містити хоча б один прийом їжі' })
  @ArrayMaxSize(MAX_SLOTS_PER_PLAN, { message: 'Забагато прийомів їжі' })
  @ValidateNested({ each: true })
  @Type(() => PlanSlotDto)
  slots!: PlanSlotDto[];
}

export class UpdateMealPlanDto {
  @Transform(trimmed)
  @ValidateIf(ifPresent)
  @IsString({ message: 'Введіть назву плану' })
  @MinLength(1, { message: 'Введіть назву плану' })
  @MaxLength(PLAN_NAME_MAX_LENGTH, { message: 'Назва задовга' })
  name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TargetsDto)
  targets?: TargetsDto;

  @ValidateIf(ifPresent)
  @IsArray({ message: 'Додайте прийоми їжі' })
  @ArrayMinSize(1, { message: 'План має містити хоча б один прийом їжі' })
  @ArrayMaxSize(MAX_SLOTS_PER_PLAN, { message: 'Забагато прийомів їжі' })
  @ValidateNested({ each: true })
  @Type(() => PlanSlotDto)
  slots?: PlanSlotDto[];
}
