import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ClientAssignment, ClientWorkout, ClientWorkoutDay } from '@gart/shared';

import { PrismaService } from '../database/prisma.service';
import {
  toClientAssignment,
  toClientWorkout,
  type ClientAssignmentTree,
} from './client-workout.mapper';

const INVALID_DATE_MESSAGE = 'Некоректна дата';

/** The live-exercise join the client view is built from; ordered like the snapshot. */
const CLIENT_TREE_INCLUDE = {
  sections: {
    orderBy: { order: 'asc' as const },
    include: {
      exercises: {
        orderBy: { order: 'asc' as const },
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
              primaryMuscleGroup: true,
              textInstructions: true,
              media: true,
            },
          },
        },
      },
    },
  },
};

/**
 * Client-facing reads. Every query is pinned to BOTH ids the guard attached —
 * `{ clientId, trainerId }` — so a client sees exactly their own assignments
 * and nothing else; a miss is a bare 404, identical for foreign and
 * nonexistent. The server never consults its own clock: «сьогодні» is whatever
 * date the device sends, because schedules live in the client's calendar.
 */
@Injectable()
export class ClientWorkoutsService {
  constructor(private readonly prisma: PrismaService) {}

  async workoutsForDate(
    trainerId: string,
    clientId: string,
    date: string,
  ): Promise<ClientWorkoutDay> {
    const day = parseDate(date);

    const assignments: ClientAssignmentTree[] = await this.prisma.assignment.findMany({
      where: {
        trainerId,
        clientId,
        status: 'ACTIVE',
        startDate: { lte: day },
        OR: [{ endDate: null }, { endDate: { gte: day } }],
        daysOfWeek: { has: isoWeekday(day) },
      },
      orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
      include: CLIENT_TREE_INCLUDE,
    });

    return { date, workouts: assignments.map(toClientWorkout) };
  }

  /** The plan view: ACTIVE assignments only, newest first. */
  async listAssignments(trainerId: string, clientId: string): Promise<ClientAssignment[]> {
    const assignments = await this.prisma.assignment.findMany({
      where: { trainerId, clientId, status: 'ACTIVE' },
      orderBy: [{ assignedAt: 'desc' }, { id: 'asc' }],
      include: { sections: { select: { _count: { select: { exercises: true } } } } },
    });

    return assignments.map(toClientAssignment);
  }

  async findAssignment(
    trainerId: string,
    clientId: string,
    assignmentId: string,
  ): Promise<ClientWorkout> {
    const assignment: ClientAssignmentTree | null = await this.prisma.assignment.findFirst({
      where: { id: assignmentId, trainerId, clientId },
      include: CLIENT_TREE_INCLUDE,
    });

    if (assignment === null) {
      throw new NotFoundException();
    }

    return toClientWorkout(assignment);
  }
}

/**
 * 'YYYY-MM-DD' → UTC midnight, matching the @db.Date columns. The DTO regex
 * lets impossible dates like 2026-02-31 through, and V8 quietly rolls those
 * over into March — the round-trip comparison rejects both cases.
 */
function parseDate(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(INVALID_DATE_MESSAGE);
  }

  return parsed;
}

/** ISO weekday of a UTC-midnight date: Пн=1 … Нд=7, matching daysOfWeek. */
function isoWeekday(day: Date): number {
  const weekday = day.getUTCDay();

  return weekday === 0 ? 7 : weekday;
}
