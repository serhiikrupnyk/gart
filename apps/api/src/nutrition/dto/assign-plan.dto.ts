import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';
import { DAYS_OF_WEEK, type DayOfWeek } from '@gart/shared';

const ID_MAX_LENGTH = 40;
const DATE_MESSAGE = 'Дата має бути у форматі РРРР-ММ-ДД';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class AssignMealPlanDto {
  @IsString({ message: 'Оберіть план' })
  @MaxLength(ID_MAX_LENGTH, { message: 'Оберіть план' })
  planId!: string;

  @IsString({ message: 'Оберіть клієнта' })
  @MaxLength(ID_MAX_LENGTH, { message: 'Оберіть клієнта' })
  clientId!: string;

  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  startDate!: string;

  @IsOptional()
  @Matches(ISO_DATE, { message: DATE_MESSAGE })
  endDate?: string | null;

  @IsArray({ message: 'Оберіть дні тижня' })
  @ArrayMinSize(1, { message: 'Оберіть хоча б один день' })
  @ArrayMaxSize(7, { message: 'Забагато днів' })
  @ArrayUnique({ message: 'Дні тижня повторюються' })
  @IsIn(DAYS_OF_WEEK, { each: true, message: 'Некоректний день тижня' })
  daysOfWeek!: DayOfWeek[];
}
