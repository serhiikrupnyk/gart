import { Injectable, NotFoundException } from '@nestjs/common';
import type { ClientAssignment, ClientWorkout, ClientWorkoutDay } from '@gart/shared';

import { PrismaService } from '../database/prisma.service';
import {
  toClientAssignment,
  toClientWorkout,
  type ClientAssignmentTree,
} from './client-workout.mapper';
import { parseIsoDate } from '../common/calendar';
import { scheduledAssignmentWhere } from './schedule';

/** The live library fields a client sees — never the storage key. */
const EXERCISE_SELECT = {
  id: true,
  name: true,
  primaryMuscleGroup: true,
  textInstructions: true,
  media: true,
} as const;

const SECTION_ORDER = { order: 'asc' as const };

/** Reading a plan: prescriptions only. A log without a date has no meaning. */
const PLAN_TREE_INCLUDE = {
  sections: {
    orderBy: SECTION_ORDER,
    include: {
      exercises: {
        orderBy: SECTION_ORDER,
        include: { exercise: { select: EXERCISE_SELECT } },
      },
    },
  },
};

/** Reading a day: each prescription line carries that date's record, if any. */
function dayTreeInclude(day: Date) {
  return {
    sections: {
      orderBy: SECTION_ORDER,
      include: {
        exercises: {
          orderBy: SECTION_ORDER,
          include: {
            exercise: { select: EXERCISE_SELECT },
            logs: {
              where: { date: day },
              include: { sets: { orderBy: SECTION_ORDER } },
            },
          },
        },
      },
    },
  };
}

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
    const day = parseIsoDate(date);

    const assignments: ClientAssignmentTree[] = await this.prisma.assignment.findMany({
      where: scheduledAssignmentWhere(trainerId, clientId, day),
      orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
      include: dayTreeInclude(day),
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
      include: PLAN_TREE_INCLUDE,
    });

    if (assignment === null) {
      throw new NotFoundException();
    }

    return toClientWorkout(assignment);
  }
}
