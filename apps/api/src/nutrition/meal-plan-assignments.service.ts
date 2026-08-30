import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PublicAssignedPlan, TrainerAssignedPlan } from '@gart/shared';

import { ClientsService } from '../clients/clients.service';
import { parseIsoDate } from '../common/calendar';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client.js';
import { NotificationService } from '../notifications/notification.service';
import type { AssignMealPlanDto } from './dto/assign-plan.dto';
import { MealPlansService } from './meal-plans.service';
import { isForeignKeyError } from './prisma-errors';
import {
  type AssignmentWithMeals,
  type PlanWithSlots,
  toPublicAssignedPlan,
  toTrainerAssignedPlan,
} from './meal.mapper';

const WITH_MEALS = {
  meals: { include: { items: { include: { food: true } } } },
} as const;

const BAD_RANGE_MESSAGE = 'Дата завершення не може бути раніше за дату початку';
const CLIENT_ARCHIVED_MESSAGE = 'Цей клієнт в архіві — відновіть його, щоб надати план';

/** Midnight UTC, matching how @db.Date columns come back. */
function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Giving a plan to a client.
 *
 * COPY-ON-ASSIGN is the invariant this module exists for, inherited unchanged
 * from Step 12's workout assignments: assigning reads the template through the
 * plans gate and writes an independent snapshot in one nested create.
 * Afterwards the plan and its meals may be edited or deleted freely and this
 * cannot change, because no code path updates the snapshot tree and
 * `sourcePlanId` is provenance only (SET NULL on template delete).
 *
 * The FOODS are deliberately NOT snapshotted. A trainer correcting гречка from
 * 92 to 95 kcal is fixing a FACT, and it should reach the client — exactly as
 * an exercise's corrected video does. Swapping гречка for рис in the template
 * is a REDESIGN and must not. Composition frozen, library live.
 */
@Injectable()
export class MealPlanAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: MealPlansService,
    private readonly clients: ClientsService,
    private readonly notifications: NotificationService,
  ) {}

  async assign(trainerId: string, dto: AssignMealPlanDto): Promise<TrainerAssignedPlan> {
    const client = await this.clients.requireOwned(trainerId, dto.clientId);

    // The workout path refuses this and so must this one: the screen filters
    // archived clients out of the dropdown, but the dropdown is not the gate.
    // An archived client cannot even sign in, so the snapshot would be one
    // nobody could ever read.
    if (client.status === 'ARCHIVED') {
      throw new BadRequestException(CLIENT_ARCHIVED_MESSAGE);
    }

    const plan = await this.plans.requireOwned(trainerId, dto.planId);

    const startDate = parseIsoDate(dto.startDate);
    const endDate = dto.endDate == null || dto.endDate === '' ? null : parseIsoDate(dto.endDate);

    if (endDate !== null && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException(BAD_RANGE_MESSAGE);
    }

    // One nested create = one transaction: the whole snapshot or nothing.
    //
    // The plan was read a moment ago through its own gate, so a foreign-key
    // failure here can only mean it was deleted in between — which is a 404,
    // not the 500 an uncaught P2003 would have produced.
    const created = await this.createSnapshot(trainerId, client.id, plan, {
      startDate,
      endDate,
      daysOfWeek: [...dto.daysOfWeek].sort((left, right) => left - right),
    });

    // The same event type a workout assignment raises: from the client's side
    // «your trainer gave you something» is one kind of news, and splitting it
    // would mean two notification preferences for one idea.
    await this.notifications.notifyClient({
      trainerId,
      clientId: client.id,
      type: 'ASSIGNMENT_CREATED',
      title: 'Новий план харчування',
      body: plan.name,
      url: '/client/nutrition',
    });

    return this.findForTrainer(trainerId, created.id);
  }

  /** The nested create, with the one race it can lose mapped to a 404. */
  private async createSnapshot(
    trainerId: string,
    clientId: string,
    plan: PlanWithSlots,
    schedule: { startDate: Date; endDate: Date | null; daysOfWeek: number[] },
  ): Promise<{ id: string }> {
    try {
      return await this.prisma.mealPlanAssignment.create({
        data: {
          trainerId,
          clientId,
          sourcePlanId: plan.id,
          name: plan.name,
          targetKcal: plan.targetKcal,
          targetProtein: plan.targetProtein,
          targetFat: plan.targetFat,
          targetCarbs: plan.targetCarbs,
          ...schedule,
          meals: { create: buildSnapshot(plan) },
        },
        select: { id: true },
      });
    } catch (error: unknown) {
      if (isForeignKeyError(error)) {
        throw new NotFoundException();
      }

      throw error;
    }
  }

  async listForClientOfTrainer(
    trainerId: string,
    clientId: string,
  ): Promise<TrainerAssignedPlan[]> {
    const client = await this.clients.requireOwned(trainerId, clientId);

    const assignments = await this.prisma.mealPlanAssignment.findMany({
      where: { trainerId, clientId: client.id },
      include: { ...WITH_MEALS, client: { select: { id: true, fullName: true } } },
      orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
    });

    return assignments.map(toTrainerAssignedPlan);
  }

  async findForTrainer(trainerId: string, assignmentId: string): Promise<TrainerAssignedPlan> {
    const assignment = await this.prisma.mealPlanAssignment.findFirst({
      where: { id: assignmentId, trainerId },
      include: { ...WITH_MEALS, client: { select: { id: true, fullName: true } } },
    });

    if (assignment === null) {
      throw new NotFoundException();
    }

    return toTrainerAssignedPlan(assignment);
  }

  async remove(trainerId: string, clientId: string, assignmentId: string): Promise<void> {
    // Scoped by the client in the URL as well as the trainer — a path that
    // names a client and then ignores it asserts something it does not check.
    const assignment = await this.prisma.mealPlanAssignment.findFirst({
      where: { id: assignmentId, trainerId, clientId },
      select: { id: true },
    });

    if (assignment === null) {
      throw new NotFoundException();
    }

    // Cascade takes the snapshot; Meal, MealPlan and Food rows are untouched.
    await this.prisma.mealPlanAssignment.delete({ where: { id: assignment.id } });
  }

  /**
   * What this client has been given.
   *
   * Scoped by BOTH the owning trainer and the client, which is the client
   * app's tenant lens: a client can only ever ask about themselves, and the
   * trainer id comes from their session rather than from a parameter.
   */
  async listForClient(trainerId: string, clientId: string): Promise<PublicAssignedPlan[]> {
    // Only what applies NOW. A plan whose window has closed is not a plan the
    // client should still be reading, and one that has not started is not
    // theirs yet — without this a client accumulates every plan they were ever
    // given, with nothing on screen saying which is current.
    const today = startOfUtcDay(new Date());

    const assignments = await this.prisma.mealPlanAssignment.findMany({
      where: {
        trainerId,
        clientId,
        startDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
      include: WITH_MEALS,
      orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
    });

    return assignments.map((assignment: AssignmentWithMeals) => toPublicAssignedPlan(assignment));
  }
}

/**
 * The template tree, flattened into snapshot rows.
 *
 * Ordering is re-derived from the template's own order rather than copied, so
 * a snapshot can never inherit a gap. `servings` is frozen here; the foods are
 * referenced, not copied.
 */
function buildSnapshot(plan: PlanWithSlots): Prisma.AssignedMealCreateWithoutAssignmentInput[] {
  return [...plan.slots]
    .sort((left, right) => left.order - right.order)
    .map((slot, index) => ({
      slot: slot.slot,
      // The slot's own name if the trainer gave it one, else the meal's — a
      // client should never see a blank line where a meal name belongs.
      name: slot.name ?? slot.meal.name,
      notes: slot.meal.notes,
      order: index,
      servings: slot.servings,
      items: {
        create: [...slot.meal.items]
          .sort((left, right) => left.order - right.order)
          .map((item, itemIndex) => ({
            foodId: item.foodId,
            order: itemIndex,
            grams: item.grams,
            portionLabel: item.portionLabel,
            portionCount: item.portionCount,
          })),
      },
    }));
}
