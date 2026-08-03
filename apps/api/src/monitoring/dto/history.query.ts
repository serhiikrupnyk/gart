import { IsOptional, Matches } from 'class-validator';

const DATE_MESSAGE = 'Дата має бути у форматі РРРР-ММ-ДД';

/** The range is the pagination; calendar validity is checked on parse. */
export class HistoryQuery {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  to?: string;
}
