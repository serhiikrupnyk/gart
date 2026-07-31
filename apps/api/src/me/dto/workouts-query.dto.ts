import { Matches } from 'class-validator';

export class WorkoutsQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Дата має бути у форматі РРРР-ММ-ДД' })
  date!: string;
}
