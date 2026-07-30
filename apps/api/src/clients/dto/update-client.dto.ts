import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { ClientStatus } from '@gart/shared';

import { trimmed } from '../../auth/dto/transforms';
import { FULL_NAME_MAX_LENGTH } from './create-client.dto';

const CLIENT_STATUSES: readonly ClientStatus[] = ['INVITED', 'ACTIVE', 'ARCHIVED'];

export class UpdateClientDto {
  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: "Введіть ім'я клієнта" })
  @MinLength(1, { message: "Введіть ім'я клієнта" })
  @MaxLength(FULL_NAME_MAX_LENGTH, { message: "Ім'я задовге" })
  fullName?: string;

  @IsOptional()
  @IsIn(CLIENT_STATUSES, { message: 'Некоректний статус' })
  status?: ClientStatus;
}
