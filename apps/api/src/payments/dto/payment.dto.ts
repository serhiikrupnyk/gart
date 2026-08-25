import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PAYMENT_STATUS_FILTERS, type PaymentStatusFilter } from '@gart/shared';

const PRODUCT_MESSAGE = 'Некоректний продукт';

/**
 * Everything a checkout needs, which is a product and nothing else.
 *
 * There is deliberately no `amount` here. The server reads the price from the
 * stored product, so a request cannot propose what it would like to pay. The
 * global pipe runs `forbidNonWhitelisted`, so an amount that arrives anyway is
 * a 400 rather than a silently ignored field — and no code path exists that
 * would read one even if it were.
 */
export class CreateCheckoutDto {
  @IsString({ message: PRODUCT_MESSAGE })
  @MinLength(1, { message: PRODUCT_MESSAGE })
  @MaxLength(64, { message: PRODUCT_MESSAGE })
  productId!: string;
}

export class PaymentListQuery {
  @IsOptional()
  @IsIn(PAYMENT_STATUS_FILTERS, { message: 'Некоректний фільтр' })
  status?: PaymentStatusFilter;
}
