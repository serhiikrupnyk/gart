import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MESSAGE_BODY_MAX_LENGTH } from '@gart/shared';

import { trimmed } from '../../auth/dto/transforms';

export class OpenThreadDto {
  @IsString({ message: 'Некоректний клієнт' })
  @MaxLength(50, { message: 'Некоректний клієнт' })
  clientId!: string;
}

export class SendChatMessageDto {
  /** Trimmed first, so whitespace alone cannot pass for a message. */
  @Transform(trimmed)
  @IsString({ message: 'Некоректне повідомлення' })
  @MinLength(1, { message: 'Повідомлення не може бути порожнім' })
  @MaxLength(MESSAGE_BODY_MAX_LENGTH, { message: 'Повідомлення задовге' })
  body!: string;
}

export class HistoryQuery {
  /** A message id to page back from; absent means the newest page. */
  @IsOptional()
  @IsString({ message: 'Некоректна сторінка' })
  @MaxLength(50, { message: 'Некоректна сторінка' })
  before?: string;
}
