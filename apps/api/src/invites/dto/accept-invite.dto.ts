import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../auth/dto/register.dto';

const TOKEN_MAX_LENGTH = 128;

export class AcceptInviteDto {
  @IsString({ message: 'Некоректне запрошення' })
  @IsNotEmpty({ message: 'Некоректне запрошення' })
  @MaxLength(TOKEN_MAX_LENGTH, { message: 'Некоректне запрошення' })
  token!: string;

  @IsString({ message: 'Введіть пароль' })
  @MinLength(PASSWORD_MIN_LENGTH, { message: 'Пароль має містити щонайменше 8 символів' })
  @MaxLength(PASSWORD_MAX_LENGTH, { message: 'Пароль задовгий' })
  password!: string;
}
