import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { MESSAGE_MAX_LENGTH } from '@gart/shared';

import { trimmed } from '../../auth/dto/transforms';

export class SendMessageDto {
  /** Trimmed first, so whitespace alone cannot pass for a message. */
  @Transform(trimmed)
  @IsString({ message: 'Некоректне повідомлення' })
  @MinLength(1, { message: 'Повідомлення не може бути порожнім' })
  @MaxLength(MESSAGE_MAX_LENGTH, { message: 'Повідомлення задовге' })
  text!: string;
}
