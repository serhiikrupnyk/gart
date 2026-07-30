import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

import { EMAIL_MAX_LENGTH } from '../../auth/dto/register.dto';
import { normalizeEmail, trimmed } from '../../auth/dto/transforms';

export const FULL_NAME_MAX_LENGTH = 120;

export class CreateClientDto {
  @Transform(trimmed)
  @IsString({ message: "Введіть ім'я клієнта" })
  @MinLength(1, { message: "Введіть ім'я клієнта" })
  @MaxLength(FULL_NAME_MAX_LENGTH, { message: "Ім'я задовге" })
  fullName!: string;

  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Введіть коректну email-адресу' })
  @MaxLength(EMAIL_MAX_LENGTH, { message: 'Email-адреса задовга' })
  email!: string;
}
