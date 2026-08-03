import { BadRequestException, Injectable } from '@nestjs/common';
import {
  HISTORY_DEFAULT_DAYS,
  HISTORY_MAX_DAYS,
  type ClientWorkoutHistory,
  type SessionState,
  type TrainerSessionExercise,
  type TrainerWorkoutSession,
  type WorkoutAdherence,
} from '@gart/shared';

import {
  toPublicProgramExercise,
  type AssignmentExerciseWithLibrary,
} from '../assignments/assignment.mapper';
import {
  addDays,
  differenceInDays,
  parseIsoDate,
  toDateString,
  utcToday,
} from '../common/calendar';
import { ClientsService } from '../clients/clients.service';
import { PrismaService } from '../database/prisma.service';
import type { WorkoutLogWithSets } from '../me/client-workout.mapper';
import { toClientWorkoutLog } from '../me/client-workout.mapper';
import type { HistoryQuery } from './dto/history.query';
import { exerciseState } from './log-state';
import { HISTORY_STATUSES, occurrenceDates } from './occurrences';

const RANGE_ORDER_MESSAGE = 'Дата завершення не може бути раніше за дату початку';
const RANGE_TOO_LONG_MESSAGE = `Період не може перевищувати ${String(HISTORY_MAX_DAYS)} днів`;

const HISTORY_INCLUDE = {
  sections: {
    orderBy: { order: 'asc' as const },
    include: {
      exercises: {
        orderBy: { order: 'asc' as const },
        include: {
          exercise: { select: { id: true, name: true, primaryMuscleGroup: true } },
          logs: { include: { sets: { orderBy: { order: 'asc' as const } } } },
        },
      },
    },
  },
};

/**
 * What the trainer sees: every session the schedule called for, with what the
 * client actually recorded laid over it.
 *
 * Ownership is the established gate — `ClientsService.requireOwned`, so a
 * client of another trainer answers exactly like one that does not exist. The
 * assignment query is scoped `{ trainerId, clientId }`, which puts every log
 * reached through it inside the tenant by construction.
 */
@Injectable()
export class WorkoutHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
  ) {}

  async forClient(
    trainerId: string,
    clientId: string,
    query: HistoryQuery,
  ): Promise<ClientWorkoutHistory> {
    const client = await this.clients.requireOwned(trainerId, clientId);
    const { from, to } = parseRange(query, new Date());

    const assignments = await this.prisma.assignment.findMany({
      where: {
        trainerId,
        clientId: client.id,
        status: { in: [...HISTORY_STATUSES] },
        startDate: { lte: to },
        OR: [{ endDate: null }, { endDate: { gte: from } }],
      },
      orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
      include: HISTORY_INCLUDE,
    });

    // A session scheduled for today has not been missed yet — the day is not
    // over. It appears only once the client records something.
    const today = utcToday(new Date());

    const sessions = assignments
      .flatMap((assignment) =>
        occurrenceDates(assignment, from, to).map(({ key }) => buildSession(assignment, key)),
      )
      .filter((session) => session !== null)
      .filter((session) => session.loggedAt !== null || session.date < toDateString(today))
      .sort(byDateDescending);

    return { from: toDateString(from), to: toDateString(to), adherence: tally(sessions), sessions };
  }
}

/** The tree shape the include above produces. */
interface AssignmentWithLogs {
  id: string;
  name: string;
  type: TrainerWorkoutSession['type'];
  startDate: Date;
  endDate: Date | null;
  daysOfWeek: number[];
  sections: { exercises: (AssignmentExerciseWithLibrary & { logs: WorkoutLogWithSets[] })[] }[];
}

function buildSession(assignment: AssignmentWithLogs, key: string): TrainerWorkoutSession | null {
  const lines = assignment.sections.flatMap((section) => section.exercises);

  if (lines.length === 0) {
    return null;
  }

  const exercises: TrainerSessionExercise[] = lines.map((line) => {
    const log = line.logs.find((row) => toDateString(row.date) === key);

    return {
      state: exerciseState(line, log),
      planned: toPublicProgramExercise(line),
      actual: log === undefined ? null : toClientWorkoutLog(log),
    };
  });

  const loggedAt = exercises
    .map((exercise) => exercise.actual?.loggedAt)
    .filter((value): value is string => value !== undefined)
    .sort()[0];

  return {
    assignmentId: assignment.id,
    date: key,
    name: assignment.name,
    type: assignment.type,
    state: sessionState(exercises),
    loggedAt: loggedAt ?? null,
    exercises,
  };
}

/**
 * Four shapes, one level up. `SKIPPED` and `MISSED` are kept apart on purpose:
 * a client who wrote «біль у коліні» against every exercise did something very
 * different from one who simply never appeared.
 */
function sessionState(exercises: TrainerSessionExercise[]): SessionState {
  const completed = exercises.filter(
    (exercise) => exercise.state === 'DONE' || exercise.state === 'DEVIATED',
  ).length;

  if (completed === exercises.length) {
    return 'DONE';
  }
  if (completed > 0) {
    return 'PARTIAL';
  }

  return exercises.some((exercise) => exercise.state === 'SKIPPED') ? 'SKIPPED' : 'MISSED';
}

function tally(sessions: TrainerWorkoutSession[]): WorkoutAdherence {
  const count = (state: SessionState): number =>
    sessions.filter((session) => session.state === state).length;

  return {
    scheduled: sessions.length,
    done: count('DONE'),
    partial: count('PARTIAL'),
    skipped: count('SKIPPED'),
    missed: count('MISSED'),
  };
}

function byDateDescending(a: TrainerWorkoutSession, b: TrainerWorkoutSession): number {
  return a.date === b.date
    ? a.assignmentId.localeCompare(b.assignmentId)
    : b.date.localeCompare(a.date);
}

/** The range is the pagination: bounded, and defaulted to the recent past. */
function parseRange(query: HistoryQuery, now: Date): { from: Date; to: Date } {
  const to = query.to === undefined ? utcToday(now) : parseIsoDate(query.to);
  const from =
    query.from === undefined ? addDays(to, -(HISTORY_DEFAULT_DAYS - 1)) : parseIsoDate(query.from);

  if (from.getTime() > to.getTime()) {
    throw new BadRequestException(RANGE_ORDER_MESSAGE);
  }
  if (differenceInDays(to, from) >= HISTORY_MAX_DAYS) {
    throw new BadRequestException(RANGE_TOO_LONG_MESSAGE);
  }

  return { from, to };
}
