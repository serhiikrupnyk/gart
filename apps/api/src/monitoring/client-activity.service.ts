import { Injectable } from '@nestjs/common';
import {
  ATTENTION_MISSED_THRESHOLD,
  ATTENTION_WINDOW_DAYS,
  type AttentionSignal,
} from '@gart/shared';

import { addDays, toDateString, utcToday } from '../common/calendar';
import { PrismaService } from '../database/prisma.service';
import { HISTORY_STATUSES, occurrenceDates } from './occurrences';

export interface ClientActivity {
  lastLoggedAt: string | null;
  attention: AttentionSignal | null;
}

/**
 * Why a client is worth opening, cheap enough to compute for a whole list.
 *
 * This is where `WorkoutLog`'s denormalised `trainerId`/`clientId` earn their
 * keep: last activity and recent skips are read straight off the log table with
 * no joins at all. Only the missed-session count needs the schedule, because
 * nothing records a session that did not happen.
 *
 * Deliberately not keyword-matching notes for «біль»: a stated reason is the
 * signal, and deciding what it means is the trainer's job, not a regex's.
 */
@Injectable()
export class ClientActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async forClients(trainerId: string, clientIds: string[]): Promise<Map<string, ClientActivity>> {
    const activity = new Map<string, ClientActivity>(
      clientIds.map((id) => [id, { lastLoggedAt: null, attention: null }]),
    );

    if (clientIds.length === 0) {
      return activity;
    }

    const today = utcToday(new Date());
    const since = addDays(today, -ATTENTION_WINDOW_DAYS);

    const logs = await this.prisma.workoutLog.findMany({
      where: { trainerId, clientId: { in: clientIds }, date: { gte: since } },
      select: {
        clientId: true,
        date: true,
        completed: true,
        loggedAt: true,
        assignmentExerciseId: true,
      },
    });

    const skipped = new Set<string>();
    const recorded = new Set<string>();

    for (const log of logs) {
      const current = activity.get(log.clientId);

      if (current === undefined) {
        continue;
      }

      if (current.lastLoggedAt === null || log.loggedAt.toISOString() > current.lastLoggedAt) {
        current.lastLoggedAt = log.loggedAt.toISOString();
      }
      if (!log.completed) {
        skipped.add(log.clientId);
      }
      recorded.add(`${log.assignmentExerciseId}|${toDateString(log.date)}`);
    }

    const missedCounts = await this.countMissed(trainerId, clientIds, since, today, recorded);

    for (const [clientId, current] of activity) {
      current.attention = skipped.has(clientId)
        ? 'SKIPPED'
        : (missedCounts.get(clientId) ?? 0) >= ATTENTION_MISSED_THRESHOLD
          ? 'MISSED'
          : null;
    }

    return activity;
  }

  /**
   * Sessions the schedule called for and nobody recorded. Today is excluded:
   * the day is not over, so it cannot have been missed yet.
   */
  private async countMissed(
    trainerId: string,
    clientIds: string[],
    since: Date,
    today: Date,
    recorded: ReadonlySet<string>,
  ): Promise<Map<string, number>> {
    const yesterday = addDays(today, -1);
    const counts = new Map<string, number>();

    if (yesterday.getTime() < since.getTime()) {
      return counts;
    }

    const assignments = await this.prisma.assignment.findMany({
      where: {
        trainerId,
        clientId: { in: clientIds },
        status: { in: [...HISTORY_STATUSES] },
        startDate: { lte: yesterday },
        OR: [{ endDate: null }, { endDate: { gte: since } }],
      },
      select: {
        clientId: true,
        startDate: true,
        endDate: true,
        daysOfWeek: true,
        sections: { select: { exercises: { select: { id: true } } } },
      },
    });

    for (const assignment of assignments) {
      const exerciseIds = assignment.sections.flatMap((section) =>
        section.exercises.map((exercise) => exercise.id),
      );

      if (exerciseIds.length === 0) {
        continue;
      }

      for (const { key } of occurrenceDates(assignment, since, yesterday)) {
        const touched = exerciseIds.some((id) => recorded.has(`${id}|${key}`));

        if (!touched) {
          counts.set(assignment.clientId, (counts.get(assignment.clientId) ?? 0) + 1);
        }
      }
    }

    return counts;
  }
}
