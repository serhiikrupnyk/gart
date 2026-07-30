import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

import { normalizeEmail, trimmed } from './transforms';

export const PASSWORD_MIN_LENGTH = 8;
/** Caps argon2's input. Not a truncation issue as with bcrypt — purely a DoS bound. */
export const PASSWORD_MAX_LENGTH = 128;
/** RFC 5321 maximum path length. */
export const EMAIL_MAX_LENGTH = 254;
export const DISPLAY_NAME_MAX_LENGTH = 100;

export class RegisterDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Введіть коректну email-адресу' })
  @MaxLength(EMAIL_MAX_LENGTH, { message: 'Email-адреса задовга' })
  email!: string;

  @IsString({ message: 'Введіть пароль' })
  @MinLength(PASSWORD_MIN_LENGTH, { message: 'Пароль має містити щонайменше 8 символів' })
  @MaxLength(PASSWORD_MAX_LENGTH, { message: 'Пароль задовгий' })
  password!: string;

  @Transform(trimmed)
  @IsString({ message: "Введіть ім'я" })
  @MinLength(1, { message: "Введіть ім'я" })
  @MaxLength(DISPLAY_NAME_MAX_LENGTH, { message: "Ім'я задовге" })
  displayName!: string;
}
