import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { FoodPage, NutritionStatus, PublicFood } from '@gart/shared';
import { NUTRITION_PLAN } from '@gart/shared';

import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client.js';
import type { CreateFoodDto, FoodPortionDto, ListFoodsQuery, UpdateFoodDto } from './dto/food.dto';
import { type FoodWithPortions, toPublicFood } from './food.mapper';
import { subscriptionHasNutrition } from './nutrition-access';
import { isForeignKeyError } from './prisma-errors';
import { validateNutrients, validatePortions } from './nutrients.validation';

/** Global rows and this trainer's own, never anybody else's. */
const WITH_PORTIONS = { portions: true } as const;

const FOOD_IN_USE_MESSAGE =
  'Цей продукт використовується у стравах або в наданих планах — приберіть його звідти спершу';

/**
 * The food library.
 *
 * Ownership is the exercise library's, deliberately unchanged: reads go through
 * `visibleTo` (global OR own), writes through `requireOwned`, whose
 * `{ id, trainerId }` clause cannot match a global row because a NULL trainerId
 * never equals a real id. Globals are immutable by construction — there is no
 * "if global" branch here to forget, and a foreign row and a nonexistent one
 * produce the identical 404.
 *
 * As everywhere: trainerId is the first parameter of every method and there is
 * no overload without it.
 */
@Injectable()
export class FoodsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(trainerId: string, query: ListFoodsQuery): Promise<FoodPage> {
    const where: Prisma.FoodWhereInput = {
      AND: [
        query.mineOnly === true ? { trainerId } : this.visibleTo(trainerId),
        ...(query.group === undefined ? [] : [{ group: query.group }]),
        ...(query.search === undefined || query.search === ''
          ? []
          : [
              {
                // `insensitive` is ILIKE, which folds Ukrainian case correctly
                // in a UTF-8 database — «греч» finds «Гречка» and «ГРЕЧ» finds
                // «гречка» with no special handling.
                OR: [
                  { name: { contains: query.search, mode: 'insensitive' as const } },
                  { brand: { contains: query.search, mode: 'insensitive' as const } },
                ],
              },
            ]),
      ],
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.food.findMany({
        where,
        include: WITH_PORTIONS,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.food.count({ where }),
    ]);

    return {
      items: items.map(toPublicFood),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async find(trainerId: string, foodId: string): Promise<PublicFood> {
    return toPublicFood(await this.requireVisible(trainerId, foodId));
  }

  async create(trainerId: string, dto: CreateFoodDto): Promise<PublicFood> {
    const nutrients = validateNutrients(dto.nutrients);
    const portions = validatePortions(dto.portions ?? []);

    const food = await this.prisma.food.create({
      data: {
        trainerId,
        name: dto.name,
        brand: dto.brand == null || dto.brand === '' ? null : dto.brand,
        group: dto.group,
        ...this.toColumns(nutrients),
        // A trainer's own entry says so plainly rather than borrowing an
        // authority it does not have.
        source: 'Власний запис тренера',
        portions: { create: portions.map(this.toPortionRow) },
      },
      include: WITH_PORTIONS,
    });

    return toPublicFood(food);
  }

  async update(trainerId: string, foodId: string, dto: UpdateFoodDto): Promise<PublicFood> {
    const existing = await this.requireOwned(trainerId, foodId);

    const nutrients = dto.nutrients === undefined ? undefined : validateNutrients(dto.nutrients);
    const portions = dto.portions === undefined ? undefined : validatePortions(dto.portions);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (portions !== undefined) {
        // An explicit row lock. Under READ COMMITTED a concurrent PATCH's
        // `deleteMany` reads a snapshot from before this one committed, so the
        // rows it should have removed survive — leaving two portion sets merged
        // where the contract says «replaced», or a unique-constraint 500.
        await tx.$queryRaw`SELECT 1 FROM "Food" WHERE "id" = ${existing.id} FOR UPDATE`;

        // Replaced wholesale, not merged: a partial merge of an unordered list
        // has no honest semantics, and the editor sends the list it is showing.
        await tx.foodPortion.deleteMany({ where: { foodId: existing.id } });
        await tx.foodPortion.createMany({
          data: portions.map((portion) => ({
            foodId: existing.id,
            ...this.toPortionRow(portion),
          })),
        });
      }

      return tx.food.update({
        where: { id: existing.id },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.brand === undefined
            ? {}
            : { brand: dto.brand === null || dto.brand === '' ? null : dto.brand }),
          ...(dto.group === undefined ? {} : { group: dto.group }),
          ...(nutrients === undefined ? {} : this.toColumns(nutrients)),
        },
        include: WITH_PORTIONS,
      });
    });

    return toPublicFood(updated);
  }

  async remove(trainerId: string, foodId: string): Promise<void> {
    const food = await this.requireOwned(trainerId, foodId);

    try {
      // Portions cascade with their food: they were never separately owned.
      await this.prisma.food.delete({ where: { id: food.id } });
    } catch (error: unknown) {
      // A meal or an assigned meal still holding this food keeps it with
      // Restrict — the same contract exercises have with programs, and 409 is
      // what «somebody else is relying on this» reads as at the boundary.
      if (isForeignKeyError(error)) {
        throw new ConflictException(FOOD_IN_USE_MESSAGE);
      }

      throw error;
    }
  }

  /**
   * What this trainer may know about nutrition whatever their plan.
   *
   * Deliberately OUTSIDE the guard. A trainer who has downgraded should be able
   * to verify their library is still there rather than take our word for it,
   * and a count discloses no nutrition data at all.
   */
  async status(trainerId: string): Promise<NutritionStatus> {
    const [subscription, customFoodCount] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { trainerId } }),
      this.prisma.food.count({ where: { trainerId } }),
    ]);

    return {
      // The same adapter the guard uses, so this can never say «available»
      // over an API that would answer 402.
      available: subscriptionHasNutrition(subscription, new Date()),
      customFoodCount,
      requiredPlan: NUTRITION_PLAN,
    };
  }

  private visibleTo(trainerId: string): Prisma.FoodWhereInput {
    return { OR: [{ trainerId: null }, { trainerId }] };
  }

  /** Read gate: global or own, else the same 404 a nonexistent id produces. */
  private async requireVisible(trainerId: string, foodId: string): Promise<FoodWithPortions> {
    const food = await this.prisma.food.findFirst({
      where: { id: foodId, ...this.visibleTo(trainerId) },
      include: WITH_PORTIONS,
    });

    if (food === null) {
      throw new NotFoundException();
    }

    return food;
  }

  /**
   * Write gate: `{ id, trainerId }` matches only this trainer's own rows — a
   * global row's NULL trainerId can never equal a real id, so globals and
   * foreign rows alike fall through to the same 404.
   */
  private async requireOwned(trainerId: string, foodId: string): Promise<FoodWithPortions> {
    const food = await this.prisma.food.findFirst({
      where: { id: foodId, trainerId },
      include: WITH_PORTIONS,
    });

    if (food === null) {
      throw new NotFoundException();
    }

    return food;
  }

  /** Decimal strings to Decimal columns — the value never becomes a number. */
  private toColumns(nutrients: {
    kcal: string;
    protein: string;
    fat: string;
    carbs: string;
    fibre: string | null;
    sugars: string | null;
    saturatedFat: string | null;
    salt: string | null;
  }) {
    const optional = (value: string | null): Prisma.Decimal | null =>
      value === null ? null : new Prisma.Decimal(value);

    return {
      kcal: new Prisma.Decimal(nutrients.kcal),
      protein: new Prisma.Decimal(nutrients.protein),
      fat: new Prisma.Decimal(nutrients.fat),
      carbs: new Prisma.Decimal(nutrients.carbs),
      fibre: optional(nutrients.fibre),
      sugars: optional(nutrients.sugars),
      saturatedFat: optional(nutrients.saturatedFat),
      salt: optional(nutrients.salt),
    };
  }

  private toPortionRow(portion: FoodPortionDto): { label: string; grams: Prisma.Decimal } {
    return { label: portion.label, grams: new Prisma.Decimal(portion.grams) };
  }
}
