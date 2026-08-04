import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CHAT_ATTACHMENT_KINDS,
  MESSAGE_BODY_MAX_LENGTH,
  VOICE_MAX_SECONDS,
  type ChatAttachmentKind,
} from '@gart/shared';

import { trimmed } from '../../auth/dto/transforms';

export class OpenThreadDto {
  @IsString({ message: 'Некоректний клієнт' })
  @MaxLength(50, { message: 'Некоректний клієнт' })
  clientId!: string;
}

export class ChatAttachmentUploadDto {
  @IsString({ message: 'Некоректне завантаження' })
  @MaxLength(300, { message: 'Некоректне завантаження' })
  key!: string;

  @IsIn(CHAT_ATTACHMENT_KINDS, { message: 'Некоректний тип вкладення' })
  kind!: ChatAttachmentKind;

  @IsOptional()
  @IsInt({ message: 'Некоректна тривалість' })
  @Min(1, { message: 'Некоректна тривалість' })
  @Max(VOICE_MAX_SECONDS, { message: 'Некоректна тривалість' })
  durationSeconds?: number | null;
}

/**
 * Either half may be absent, but not both — that rule needs to see the whole
 * message, so it lives in the service beside the other cross-field rules
 * rather than in a decorator that can only see one field.
 */
export class SendChatMessageDto {
  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Некоректне повідомлення' })
  @MaxLength(MESSAGE_BODY_MAX_LENGTH, { message: 'Повідомлення задовге' })
  body?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChatAttachmentUploadDto)
  attachment?: ChatAttachmentUploadDto;
}

export class PresignChatAttachmentDto {
  @IsIn(CHAT_ATTACHMENT_KINDS, { message: 'Некоректний тип вкладення' })
  kind!: ChatAttachmentKind;

  @IsString({ message: 'Некоректний тип файлу' })
  @MaxLength(100, { message: 'Некоректний тип файлу' })
  contentType!: string;

  @IsInt({ message: 'Некоректний розмір файлу' })
  @Min(1, { message: 'Некоректний розмір файлу' })
  sizeBytes!: number;
}

export class HistoryQuery {
  /** A message id to page back from; absent means the newest page. */
  @IsOptional()
  @IsString({ message: 'Некоректна сторінка' })
  @MaxLength(50, { message: 'Некоректна сторінка' })
  before?: string;
}
