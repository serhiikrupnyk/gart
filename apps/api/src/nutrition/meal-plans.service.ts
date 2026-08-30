import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PublicMealPlan } from '@gart/shared';

import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client.js';
import type { CreateMealPlanDto, PlanSlotDto, UpdateMealPlanDto } from './dto/meal.dto';
import { type PlanWithSlots, toPublicPlan } from './meal.mapper';
import { validatePlanSlots, validateTargets } from './quantities.validation';

const WITH_SLOTS = {
  slots: { include: { meal: { include: { items: { include: { food: true } } } } } },
} as const;

const MEAL_NOT_FOUND_MESSAGE = 'Страву не знайдено серед ваших';

/**
 * Meal plans: a DAY of eating, as a reusable template.
 *
 * One day and not a week, which is the Program precedent rather than a
 * shortcut — a Program is one workout and the schedule lives on the
 * assignment, so a trainer wanting a different Tuesday assigns a second one.
 *
 * Targets are the trainer's own numbers. Nothing here computes an energy
 * requirement or names a formula Gart has not earned the right to name.
 */
@Injectable()
export class MealPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list(trainerId: string): Promise<PublicMealPlan[]> {
    const plans = await this.prisma.mealPlan.findMany({
      where: { trainerId },
      include: WITH_SLOTS,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return plans.map(toPublicPlan);
  }

  async find(trainerId: string, planId: string): Promise<PublicMealPlan> {
    return toPublicPlan(await this.requireOwned(trainerId, planId));
  }

  async create(trainerId: string, dto: CreateMealPlanDto): Promise<PublicMealPlan> {
    const slots = validatePlanSlots(dto.slots);
    const targets = validateTargets(dto.targets);
    await this.assertMealsOwned(trainerId, slots);

    const plan = await this.prisma.mealPlan.create({
      data: {
        trainerId,
        name: dto.name,
        ...toTargetColumns(targets),
        slots: { create: slots.map((slot, index) => toSlotRow(slot, index)) },
      },
      include: WITH_SLOTS,
    });

    return toPublicPlan(plan);
  }

  async update(trainerId: string, planId: string, dto: UpdateMealPlanDto): Promise<PublicMealPlan> {
    const existing = await this.requireOwned(trainerId, planId);
    const slots = dto.slots === undefined ? undefined : validatePlanSlots(dto.slots);
    const targets = dto.targets === undefined ? undefined : validateTargets(dto.targets);

    if (slots !== undefined) {
      await this.assertMealsOwned(trainerId, slots);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (slots !== undefined) {
        await tx.$queryRaw`SELECT 1 FROM "MealPlan" WHERE "id" = ${existing.id} FOR UPDATE`;
        await tx.mealPlanSlot.deleteMany({ where: { planId: existing.id } });
        await tx.mealPlanSlot.createMany({
          data: slots.map((slot, index) => ({ planId: existing.id, ...toSlotRow(slot, index) })),
        });
      }

      return tx.mealPlan.update({
        where: { id: existing.id },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(targets === undefined ? {} : toTargetColumns(targets)),
        },
        include: WITH_SLOTS,
      });
    });

    return toPublicPlan(updated);
  }

  async remove(trainerId: string, planId: string): Promise<void> {
    const plan = await this.requireOwned(trainerId, planId);

    // Slots cascade; Meals are untouched. Assignments survive with a null
    // sourcePlanId — a client's copy is theirs, and deleting the template it
    // came from must never reach it.
    await this.prisma.mealPlan.delete({ where: { id: plan.id } });
  }

  /** `{ id, trainerId }` — a foreign or nonexistent id gives the identical bare 404. */
  async requireOwned(trainerId: string, planId: string): Promise<PlanWithSlots> {
    const plan = await this.prisma.mealPlan.findFirst({
      where: { id: planId, trainerId },
      include: WITH_SLOTS,
    });

    if (plan === null) {
      throw new NotFoundException();
    }

    return plan;
  }

  /**
   * A mealId in a request body is a cross-tenant reference vector. Meals have
   * no global rows, so unlike a foodId this must be the caller's OWN — 400,
   * with one body for «foreign» and «nonexistent» alike.
   */
  private async assertMealsOwned(trainerId: string, slots: PlanSlotDto[]): Promise<void> {
    const ids = [...new Set(slots.map((slot) => slot.mealId))];
    const owned = await this.prisma.meal.count({ where: { id: { in: ids }, trainerId } });

    if (owned !== ids.length) {
      throw new BadRequestException(MEAL_NOT_FOUND_MESSAGE);
    }
  }
}

function toSlotRow(slot: PlanSlotDto, index: number) {
  return {
    mealId: slot.mealId,
    slot: slot.slot,
    name: slot.name == null || slot.name === '' ? null : slot.name,
    order: index,
    servings:
      slot.servings == null || slot.servings === ''
        ? new Prisma.Decimal(1)
        : new Prisma.Decimal(slot.servings),
  };
}

function toTargetColumns(targets: {
  targetKcal: string | null;
  targetProtein: string | null;
  targetFat: string | null;
  targetCarbs: string | null;
}) {
  const decimal = (value: string | null): Prisma.Decimal | null =>
    value === null ? null : new Prisma.Decimal(value);

  return {
    targetKcal: decimal(targets.targetKcal),
    targetProtein: decimal(targets.targetProtein),
    targetFat: decimal(targets.targetFat),
    targetCarbs: decimal(targets.targetCarbs),
  };
}
