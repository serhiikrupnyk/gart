import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ASSIGNMENT_STATUSES, type AssignmentStatus, type DayOfWeek } from '@gart/shared';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'Некоректна дата (очікується РРРР-ММ-ДД)';

/** Validate unless absent — so an explicit null on non-nullable fields still 400s. */
const ifPresent = (_object: object, value: unknown): boolean => value !== undefined;

export class CreateAssignmentDto {
  @IsString({ message: 'Некоректна програма' })
  @MaxLength(50, { message: 'Некоректна програма' })
  programId!: string;

  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  startDate!: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  endDate?: string | null;

  /** ISO weekdays, Пн=1. Uniqueness and date ordering are service rules. */
  @IsArray({ message: 'Оберіть дні тижня' })
  @ArrayMinSize(1, { message: 'Оберіть щонайменше один день' })
  @ArrayMaxSize(7, { message: 'Забагато днів' })
  @IsInt({ each: true, message: 'Некоректний день тижня' })
  @Min(1, { each: true, message: 'Некоректний день тижня' })
  @Max(7, { each: true, message: 'Некоректний день тижня' })
  daysOfWeek!: DayOfWeek[];
}

/**
 * Schedule and status only — deliberately no way to express the tree. The
 * snapshot has no update path; per-client tree editing is a future feature
 * with its own invariants, not a PATCH away.
 */
export class UpdateAssignmentDto {
  @ValidateIf(ifPresent)
  @IsIn(ASSIGNMENT_STATUSES, { message: 'Некоректний статус' })
  status?: AssignmentStatus;

  @ValidateIf(ifPresent)
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  startDate?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: DATE_MESSAGE })
  endDate?: string | null;

  @ValidateIf(ifPresent)
  @IsArray({ message: 'Оберіть дні тижня' })
  @ArrayMinSize(1, { message: 'Оберіть щонайменше один день' })
  @ArrayMaxSize(7, { message: 'Забагато днів' })
  @IsInt({ each: true, message: 'Некоректний день тижня' })
  @Min(1, { each: true, message: 'Некоректний день тижня' })
  @Max(7, { each: true, message: 'Некоректний день тижня' })
  daysOfWeek?: DayOfWeek[];
}
