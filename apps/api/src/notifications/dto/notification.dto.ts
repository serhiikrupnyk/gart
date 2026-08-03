import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';

import { trimmed } from '../../auth/dto/transforms';

export class NotificationsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Некоректна сторінка' })
  @Min(1, { message: 'Некоректна сторінка' })
  page?: number;
}

export class SubscribePushDto {
  /**
   * The push service's own URL. Validated as an https URL: it is used verbatim
   * as the request target when delivering, so it must never be anything else.
   */
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'Некоректна підписка' })
  @MaxLength(500, { message: 'Некоректна підписка' })
  endpoint!: string;

  @IsString({ message: 'Некоректна підписка' })
  @MaxLength(200, { message: 'Некоректна підписка' })
  p256dh!: string;

  @IsString({ message: 'Некоректна підписка' })
  @MaxLength(200, { message: 'Некоректна підписка' })
  auth!: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Некоректний пристрій' })
  @MaxLength(200, { message: 'Некоректний пристрій' })
  userAgent?: string | null;
}

export class UnsubscribePushDto {
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'Некоректна підписка' })
  @MaxLength(500, { message: 'Некоректна підписка' })
  endpoint!: string;
}
