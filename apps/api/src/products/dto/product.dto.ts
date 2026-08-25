import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  PRODUCT_ACCESS_DAYS_MAX,
  PRODUCT_ACCESS_DAYS_MIN,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_KINDS,
  PRODUCT_NAME_MAX,
  PRODUCT_STATUS_FILTERS,
  SUBSCRIPTION_PERIODS,
  type ProductKind,
  type ProductStatusFilter,
  type SubscriptionPeriod,
} from '@gart/shared';

import { trimmed } from '../../auth/dto/transforms';

const NAME_MESSAGE = 'Некоректна назва';
const PRICE_MESSAGE = 'Ціна має бути числом з двома знаками після коми';
const KIND_MESSAGE = 'Некоректний тип продукту';
const PERIOD_MESSAGE = 'Некоректна періодичність';
const ACCESS_DAYS_MESSAGE = 'Некоректна тривалість доступу';

/**
 * The price arrives as a STRING and is validated by shape here, by value in the
 * service. A `number` field would have put every price through a float on the
 * way in, which is the one thing Step 22 settled that money must never do —
 * and `@IsNumber({ maxDecimalPlaces: 2 })` would have validated the float, not
 * what the client actually sent.
 *
 * There is no `currency`: it is UAH, the server sets it, and the global pipe
 * runs forbidNonWhitelisted so a request that supplies one is a 400 rather than
 * a field quietly ignored.
 */
const PRICE_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;

export class CreateProductDto {
  @Transform(trimmed)
  @IsString({ message: NAME_MESSAGE })
  @MinLength(1, { message: NAME_MESSAGE })
  @MaxLength(PRODUCT_NAME_MAX, { message: 'Назва задовга' })
  name!: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Некоректний опис' })
  @MaxLength(PRODUCT_DESCRIPTION_MAX, { message: 'Опис задовгий' })
  description?: string | null;

  @IsIn(PRODUCT_KINDS, { message: KIND_MESSAGE })
  kind!: ProductKind;

  @IsOptional()
  @IsIn(SUBSCRIPTION_PERIODS, { message: PERIOD_MESSAGE })
  period?: SubscriptionPeriod | null;

  @Matches(PRICE_PATTERN, { message: PRICE_MESSAGE })
  price!: string;

  @IsOptional()
  @IsInt({ message: ACCESS_DAYS_MESSAGE })
  @Min(PRODUCT_ACCESS_DAYS_MIN, { message: ACCESS_DAYS_MESSAGE })
  @Max(PRODUCT_ACCESS_DAYS_MAX, { message: ACCESS_DAYS_MESSAGE })
  accessDays?: number | null;
}

export class UpdateProductDto {
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trimmed)
  @IsString({ message: NAME_MESSAGE })
  @MinLength(1, { message: NAME_MESSAGE })
  @MaxLength(PRODUCT_NAME_MAX, { message: 'Назва задовга' })
  name?: string;

  @IsOptional()
  @Transform(trimmed)
  @IsString({ message: 'Некоректний опис' })
  @MaxLength(PRODUCT_DESCRIPTION_MAX, { message: 'Опис задовгий' })
  description?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(PRODUCT_KINDS, { message: KIND_MESSAGE })
  kind?: ProductKind;

  @IsOptional()
  @IsIn(SUBSCRIPTION_PERIODS, { message: PERIOD_MESSAGE })
  period?: SubscriptionPeriod | null;

  @ValidateIf((_, value) => value !== undefined)
  @Matches(PRICE_PATTERN, { message: PRICE_MESSAGE })
  price?: string;

  @IsOptional()
  @IsInt({ message: ACCESS_DAYS_MESSAGE })
  @Min(PRODUCT_ACCESS_DAYS_MIN, { message: ACCESS_DAYS_MESSAGE })
  @Max(PRODUCT_ACCESS_DAYS_MAX, { message: ACCESS_DAYS_MESSAGE })
  accessDays?: number | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean({ message: 'Некоректний статус' })
  isActive?: boolean;
}

export class ProductListQuery {
  @IsOptional()
  @IsIn(PRODUCT_STATUS_FILTERS, { message: 'Некоректний фільтр' })
  status?: ProductStatusFilter;
}
