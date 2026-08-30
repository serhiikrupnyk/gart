import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { MealPage, PublicMeal } from '@gart/shared';

import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client.js';
import type { CreateMealDto, ListMealsQuery, MealItemDto, UpdateMealDto } from './dto/meal.dto';
import { type MealWithItems, toPublicMeal } from './meal.mapper';
import { isForeignKeyError } from './prisma-errors';
import { validateMealItems } from './quantities.validation';

const WITH_ITEMS = { items: { include: { food: true } } } as const;

const FOOD_NOT_FOUND_MESSAGE = 'Продукт не знайдено у вашій базі';

/**
 * Meals: a trainer's own compositions of foods.
 *
 * Trainer-owned with NO global rows, deliberately unlike Food — so there is no
 * `visibleTo` here, only `requireOwned`. A food is a fact; a meal is a
 * professional judgement, and Gart shipping one would be prescribing nutrition
 * rather than tooling it.
 *
 * Totals are never stored. They are derived in the mapper on every read, so a
 * food whose figures the trainer corrects cannot leave a meal quietly stale.
 */
@Injectable()
export class MealsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(trainerId: string, query: ListMealsQuery): Promise<MealPage> {
    const where: Prisma.MealWhereInput = {
      trainerId,
      ...(query.search === undefined || query.search === ''
        ? {}
        : { name: { contains: query.search, mode: 'insensitive' as const } }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.meal.findMany({
        where,
        include: WITH_ITEMS,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.meal.count({ where }),
    ]);

    return {
      items: items.map(toPublicMeal),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async find(trainerId: string, mealId: string): Promise<PublicMeal> {
    return toPublicMeal(await this.requireOwned(trainerId, mealId));
  }

  async create(trainerId: string, dto: CreateMealDto): Promise<PublicMeal> {
    const items = validateMealItems(dto.items);
    await this.assertFoodsUsable(trainerId, items);

    const meal = await this.prisma.meal.create({
      data: {
        trainerId,
        name: dto.name,
        notes: dto.notes == null || dto.notes === '' ? null : dto.notes,
        items: { create: items.map((item, index) => toItemRow(item, index)) },
      },
      include: WITH_ITEMS,
    });

    return toPublicMeal(meal);
  }

  async update(trainerId: string, mealId: string, dto: UpdateMealDto): Promise<PublicMeal> {
    const existing = await this.requireOwned(trainerId, mealId);
    const items = dto.items === undefined ? undefined : validateMealItems(dto.items);

    if (items !== undefined) {
      await this.assertFoodsUsable(trainerId, items);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (items !== undefined) {
        // Locked before the replace, so two concurrent edits cannot merge two
        // item sets where the contract says «replaced» — the same guard the
        // food library's portions carry.
        await tx.$queryRaw`SELECT 1 FROM "Meal" WHERE "id" = ${existing.id} FOR UPDATE`;
        await tx.mealItem.deleteMany({ where: { mealId: existing.id } });
        await tx.mealItem.createMany({
          data: items.map((item, index) => ({ mealId: existing.id, ...toItemRow(item, index) })),
        });
      }

      return tx.meal.update({
        where: { id: existing.id },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.notes === undefined
            ? {}
            : { notes: dto.notes === null || dto.notes === '' ? null : dto.notes }),
        },
        include: WITH_ITEMS,
      });
    });

    return toPublicMeal(updated);
  }

  async remove(trainerId: string, mealId: string): Promise<void> {
    const meal = await this.requireOwned(trainerId, mealId);

    try {
      // Items cascade; the Foods are untouched. A plan still referencing this
      // meal holds it with Restrict, which surfaces here as a 409.
      await this.prisma.meal.delete({ where: { id: meal.id } });
    } catch (error: unknown) {
      if (isForeignKeyError(error)) {
        throw new ConflictException(
          'Цю страву використовує план харчування — приберіть її звідти спершу',
        );
      }

      throw error;
    }
  }

  /**
   * The tenant gate. There is only one, because meals have no global rows:
   * `{ id, trainerId }` is both the read and the write gate, and a foreign or
   * nonexistent id produces the identical bare 404.
   */
  async requireOwned(trainerId: string, mealId: string): Promise<MealWithItems> {
    const meal = await this.prisma.meal.findFirst({
      where: { id: mealId, trainerId },
      include: WITH_ITEMS,
    });

    if (meal === null) {
      throw new NotFoundException();
    }

    return meal;
  }

  /**
   * A foodId in a request body is a cross-tenant reference vector: it must
   * resolve to a global food or the caller's own. 400 rather than 404 — the
   * record in question is fine, the request body is not — with one body for
   * «foreign» and «nonexistent» alike, exactly as the exercise library does.
   */
  private async assertFoodsUsable(trainerId: string, items: MealItemDto[]): Promise<void> {
    const ids = [...new Set(items.map((item) => item.foodId))];

    const usable = await this.prisma.food.count({
      where: { id: { in: ids }, OR: [{ trainerId: null }, { trainerId }] },
    });

    if (usable !== ids.length) {
      throw new BadRequestException(FOOD_NOT_FOUND_MESSAGE);
    }
  }
}

function toItemRow(item: MealItemDto, index = 0) {
  return {
    foodId: item.foodId,
    order: index,
    grams: new Prisma.Decimal(item.grams),
    portionLabel: item.portionLabel == null || item.portionLabel === '' ? null : item.portionLabel,
    portionCount:
      item.portionCount == null || item.portionCount === ''
        ? null
        : new Prisma.Decimal(item.portionCount),
  };
}
