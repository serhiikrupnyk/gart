import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PROGRESS_DEFAULT_DAYS,
  type ExerciseLoadHistory,
  type ExerciseLoadPoint,
  type LoggedExerciseSummary,
} from '@gart/shared';

import { ClientsService } from '../clients/clients.service';
import { addDays, parseIsoDate, toDateString, utcToday } from '../common/calendar';
import { PrismaService } from '../database/prisma.service';
import type { ProgressRangeQuery } from './dto/progress.dto';

/** Beyond a dozen reps the Epley estimate stops meaning anything. */
const MAX_REPS_FOR_ESTIMATE = 12;

interface SetRow {
  reps: number | null;
  loadKg: unknown;
}

/**
 * Per-exercise load history — DERIVED from the client's own workout logs, never
 * stored. Every number here already exists in `WorkoutSetLog`; a second table
 * would be a copy that could disagree with it.
 *
 * The query reaches the rows through the columns denormalised onto
 * `WorkoutLog`, with a single relation filter for the exercise.
 */
@Injectable()
export class ExerciseHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
  ) {}

  /** The picker: exercises this client has actually recorded in the range. */
  async loggedExercises(
    trainerId: string,
    clientId: string,
    query: ProgressRangeQuery,
  ): Promise<LoggedExerciseSummary[]> {
    const client = await this.clients.requireOwned(trainerId, clientId);
    const { from, to } = parseRange(query, new Date());

    const logs = await this.prisma.workoutLog.findMany({
      where: {
        trainerId,
        clientId: client.id,
        completed: true,
        date: { gte: from, lte: to },
      },
      select: {
        date: true,
        assignmentExercise: {
          select: { exerciseId: true, exercise: { select: { name: true } } },
        },
      },
      orderBy: { date: 'asc' },
    });

    const summaries = new Map<string, LoggedExerciseSummary>();

    for (const log of logs) {
      const { exerciseId, exercise } = log.assignmentExercise;
      const current = summaries.get(exerciseId);
      const date = toDateString(log.date);

      if (current === undefined) {
        summaries.set(exerciseId, {
          id: exerciseId,
          name: exercise.name,
          sessions: 1,
          lastDate: date,
        });
        continue;
      }

      current.sessions += 1;
      current.lastDate = date;
    }

    return [...summaries.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  }

  async forExercise(
    trainerId: string,
    clientId: string,
    exerciseId: string,
    query: ProgressRangeQuery,
  ): Promise<ExerciseLoadHistory> {
    const client = await this.clients.requireOwned(trainerId, clientId);
    const { from, to } = parseRange(query, new Date());

    const logs = await this.prisma.workoutLog.findMany({
      where: {
        trainerId,
        clientId: client.id,
        completed: true,
        date: { gte: from, lte: to },
        assignmentExercise: { exerciseId },
      },
      select: {
        date: true,
        sets: { select: { reps: true, loadKg: true } },
        assignmentExercise: { select: { exercise: { select: { name: true } } } },
      },
      orderBy: { date: 'asc' },
    });

    if (logs.length === 0) {
      // Nothing recorded, or not this client's exercise — the same answer
      // either way, so nothing is disclosed by asking.
      throw new NotFoundException();
    }

    const byDate = new Map<string, SetRow[]>();

    for (const log of logs) {
      const date = toDateString(log.date);
      // Two assignments can carry the same exercise on one day; that is one
      // training day, so their sets merge into a single point.
      byDate.set(date, [...(byDate.get(date) ?? []), ...log.sets]);
    }

    const points = [...byDate.entries()]
      .map(([date, sets]) => toPoint(date, sets))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      exercise: {
        id: exerciseId,
        name: logs[0]?.assignmentExercise.exercise.name ?? '',
        sessions: byDate.size,
        lastDate: points[points.length - 1]?.date ?? toDateString(to),
      },
      points,
    };
  }
}

/**
 * Three metrics from one set of rows, because coaches read different questions
 * from the same session: what was heaviest, how much work was done, and what
 * it implies about a one-rep maximum.
 */
function toPoint(date: string, sets: SetRow[]): ExerciseLoadPoint {
  let topSetKg: number | null = null;
  let volumeKg: number | null = null;
  let estimate: number | null = null;

  for (const set of sets) {
    const load = set.loadKg === null || set.loadKg === undefined ? null : Number(set.loadKg);

    if (load === null) {
      continue;
    }

    topSetKg = topSetKg === null ? load : Math.max(topSetKg, load);

    if (set.reps === null) {
      continue;
    }

    volumeKg = (volumeKg ?? 0) + load * set.reps;

    if (set.reps >= 1 && set.reps <= MAX_REPS_FOR_ESTIMATE) {
      // Epley: what this set implies about a single maximal rep, which is what
      // makes 5×5 at 82,5 comparable with 3×3 at 92,5.
      const oneRepMax = load * (1 + set.reps / 30);

      estimate = estimate === null ? oneRepMax : Math.max(estimate, oneRepMax);
    }
  }

  return {
    date,
    topSetKg,
    volumeKg: volumeKg === null ? null : round2(volumeKg),
    estimatedOneRepMaxKg: estimate === null ? null : round2(estimate),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseRange(query: ProgressRangeQuery, now: Date): { from: Date; to: Date } {
  const to = query.to === undefined ? utcToday(now) : parseIsoDate(query.to);
  const from =
    query.from === undefined ? addDays(to, -(PROGRESS_DEFAULT_DAYS - 1)) : parseIsoDate(query.from);

  return { from, to };
}
