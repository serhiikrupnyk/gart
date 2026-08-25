import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PRODUCT_PRICE_MAX,
  PRODUCT_PRICE_MIN,
  type ProductStatusFilter,
  type PublicProduct,
} from '@gart/shared';

import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client.js';
import type { ProductModel } from '../generated/prisma/models.js';
import { parseAmount, toMoney } from '../common/money';
import type { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { resolveProductShape } from './product-rules';

const PRICE_RANGE_MESSAGE = `Ціна має бути від ${String(PRODUCT_PRICE_MIN)} до ${String(PRODUCT_PRICE_MAX)} ₴`;
const IN_USE_MESSAGE = 'Продукт уже продавався — його можна лише деактивувати';
/**
 * How many products one trainer may hold.
 *
 * The list is unpaged because a catalogue is small — but nothing was making
 * that true, and registration is self-serve. Without a bound, an account can
 * write rows until every subsequent list materialises tens of megabytes in a
 * process shared with every other tenant. A limit keeps the claim honest, and
 * refuses at the point of creation where the trainer can understand it, rather
 * than silently truncating a list they thought was complete.
 */
const PRODUCT_LIMIT = 200;
const TOO_MANY_MESSAGE = `Більше ніж ${String(PRODUCT_LIMIT)} продуктів — забагато для одного каталогу`;

const FK_CONSTRAINT_ERROR = 'P2003';

/**
 * The trainer's catalogue: what they sell, and for how much.
 *
 * The model arrived in Step 22 because a payment's amount has to come from
 * stored data rather than from the request. This step gives it the CRUD, which
 * is also what makes a product mutable for the first time — and why `Payment`
 * now snapshots the grant terms alongside the amount.
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(trainerId: string, dto: CreateProductDto): Promise<PublicProduct> {
    const shape = resolveProductShape(dto.kind, dto.period, dto.accessDays);

    if ((await this.prisma.product.count({ where: { trainerId } })) >= PRODUCT_LIMIT) {
      throw new BadRequestException(TOO_MANY_MESSAGE);
    }

    const created = await this.prisma.product.create({
      data: {
        trainerId,
        name: dto.name,
        description: emptyToNull(dto.description),
        ...shape,
        priceAmount: this.requirePrice(dto.price),
        currency: 'UAH',
      },
    });

    return toPublicProduct(created);
  }

  /** The trainer's own catalogue. Active first, then newest — the order a trainer works in. */
  async list(trainerId: string, status: ProductStatusFilter): Promise<PublicProduct[]> {
    const products = await this.prisma.product.findMany({
      where: {
        trainerId,
        ...(status === 'all' ? {} : { isActive: status === 'active' }),
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });

    return products.map(toPublicProduct);
  }

  async one(trainerId: string, productId: string): Promise<PublicProduct> {
    return toPublicProduct(await this.requireOwned(trainerId, productId));
  }

  async update(
    trainerId: string,
    productId: string,
    dto: UpdateProductDto,
  ): Promise<PublicProduct> {
    const product = await this.requireOwned(trainerId, productId);

    // Resolved against the MERGED product, not against the patch: sending only
    // `kind: 'SUBSCRIPTION'` has to be judged together with the period already
    // stored, or a coherent row could be turned incoherent one field at a time.
    const shape = resolveProductShape(
      dto.kind ?? product.kind,
      dto.period === undefined ? product.period : dto.period,
      dto.accessDays === undefined ? product.accessDays : dto.accessDays,
    );

    const updated = await this.prisma.product.update({
      where: { id: product.id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.description === undefined ? {} : { description: emptyToNull(dto.description) }),
        ...(dto.price === undefined ? {} : { priceAmount: this.requirePrice(dto.price) }),
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        ...shape,
      },
    });

    return toPublicProduct(updated);
  }

  /**
   * Removes a product that was never sold.
   *
   * The Step 7 delete contract, extended to money: Payment.productId and
   * Entitlement.productId are `onDelete: Restrict`, so the database refuses to
   * remove anything history refers to and the refusal becomes a clean 409. The
   * trainer is told to deactivate instead, which is the operation they actually
   * wanted — a retired product still has to be nameable by the payments that
   * bought it.
   */
  async remove(trainerId: string, productId: string): Promise<void> {
    const product = await this.requireOwned(trainerId, productId);

    await this.prisma.product.delete({ where: { id: product.id } }).catch((error: unknown) => {
      if ((error as { code?: unknown }).code === FK_CONSTRAINT_ERROR) {
        throw new ConflictException(IN_USE_MESSAGE);
      }
      throw error;
    });
  }

  private async requireOwned(trainerId: string, productId: string): Promise<ProductModel> {
    const product = await this.prisma.product.findFirst({ where: { id: productId, trainerId } });

    if (product === null) {
      throw new NotFoundException();
    }

    return product;
  }

  /**
   * The price, as an exact Decimal or not at all.
   *
   * Zero is refused here and by `parseAmount` before it: a free offer is a
   * different concept that must never touch the payment path, since no acquirer
   * can settle nothing and such a product could only ever produce a payment
   * stuck pending for ever.
   */
  private requirePrice(price: string): Prisma.Decimal {
    const parsed = parseAmount(price);

    if (
      parsed === null ||
      parsed.lessThan(PRODUCT_PRICE_MIN) ||
      parsed.greaterThan(PRODUCT_PRICE_MAX)
    ) {
      throw new BadRequestException(PRICE_RANGE_MESSAGE);
    }

    return parsed;
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === '' ? null : value;
}

export function toPublicProduct(product: ProductModel): PublicProduct {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    kind: product.kind,
    period: product.period,
    price: toMoney(product.priceAmount, product.currency),
    accessDays: product.accessDays,
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
  };
}
