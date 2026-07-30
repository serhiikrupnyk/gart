import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH } from './register.dto';
import { normalizeEmail } from './transforms';

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Введіть коректну email-адресу' })
  @MaxLength(EMAIL_MAX_LENGTH, { message: 'Email-адреса задовга' })
  email!: string;

  /**
   * Deliberately no minimum length. A password that is merely too short must
   * fail exactly like a wrong one — a 400 here would behave differently from the
   * 401 a real bad password produces, which is a distinction worth denying.
   */
  @IsString({ message: 'Введіть пароль' })
  @IsNotEmpty({ message: 'Введіть пароль' })
  @MaxLength(PASSWORD_MAX_LENGTH, { message: 'Пароль задовгий' })
  password!: string;
}
