import { Injectable, Logger } from '@nestjs/common';
import { INACTIVITY_DAYS } from '@gart/shared';

import { addDays, differenceInDays, utcToday } from '../common/calendar';
import { PrismaService } from '../database/prisma.service';
import { HISTORY_STATUSES, occurrenceDates } from '../monitoring/occurrences';
import { NotificationService } from './notification.service';

/**
 * Who has gone quiet.
 *
 * A client is inactive when they have recorded NOTHING for more than
 * INACTIVITY_DAYS — no workout, no habit, no measurement — AND there was
 * something for them to be doing. That second clause is what keeps the alert
 * worth reading: a client invited last week with no programme and no habits is
 * a fact about the trainer's backlog, not about the client.
 *
 * Every date compared here is a `@db.Date` holding the CLIENT's own calendar
 * day, which is what Steps 13–17 stored. Date-to-date comparison is therefore
 * honest whatever hour the server keeps.
 *
 * Deliberately a plain service the worker merely calls, so the whole rule is
 * testable without Redis.
 */
@Injectable()
export class InactivityService {
  private readonly logger = new Logger(InactivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  /** Returns how many alerts were emitted, which is what the worker logs. */
  async sweep(now = new Date()): Promise<number> {
    const today = utcToday(now);
    // Activity on or after this date means the client is not silent.
    const cutoff = addDays(today, -INACTIVITY_DAYS);

    const clients = await this.prisma.client.findMany({
      // Only someone who can actually log in can be silent in a meaningful way.
      where: { status: 'ACTIVE', userId: { not: null } },
      select: { id: true, trainerId: true, createdAt: true },
    });

    if (clients.length === 0) {
      return 0;
    }

    const clientIds = clients.map((client) => client.id);
    const lastActivity = await this.lastActivityByClient(clientIds);
    const eligible = await this.eligibleByClient(clientIds, cutoff, today);

    const candidates = clients.filter((client) => {
      if (!eligible.has(client.id)) {
        return false;
      }

      const last = lastActivity.get(client.id);

      // Silence of MORE than N days: recording exactly N days ago is not a
      // lapse yet, and a client who has never recorded anything is judged
      // from when they were taken on.
      return last === undefined
        ? differenceInDays(today, utcToday(client.createdAt)) > INACTIVITY_DAYS
        : last.getTime() < cutoff.getTime();
    });

    if (candidates.length === 0) {
      return 0;
    }

    const alreadyAlerted = await this.latestAlertByClient(candidates.map((client) => client.id));
    let emitted = 0;

    for (const client of candidates) {
      // The episode anchor: everything before it belongs to a lapse already
      // reported. Derived rather than stored, so nothing can drift out of step
      // with the logs it describes.
      const anchor = lastActivity.get(client.id) ?? client.createdAt;
      const alerted = alreadyAlerted.get(client.id);

      if (alerted !== undefined && alerted.getTime() > anchor.getTime()) {
        continue;
      }

      const days = differenceInDays(
        today,
        lastActivity.get(client.id) ?? utcToday(client.createdAt),
      );

      await this.notifications.notifyTrainer({
        trainerId: client.trainerId,
        clientId: client.id,
        type: 'CLIENT_INACTIVE',
        detail: `${String(days)} днів`,
      });

      emitted += 1;
    }

    if (emitted > 0) {
      this.logger.log(`Inactivity sweep alerted on ${String(emitted)} client(s).`);
    }

    return emitted;
  }

  /** The most recent day each client recorded anything, across all three logs. */
  private async lastActivityByClient(clientIds: string[]): Promise<Map<string, Date>> {
    const [habits, variables] = await Promise.all([
      this.prisma.habit.findMany({
        where: { clientId: { in: clientIds } },
        select: { id: true, clientId: true },
      }),
      this.prisma.progressVariable.findMany({
        where: { clientId: { in: clientIds } },
        select: { id: true, clientId: true },
      }),
    ]);

    const [workouts, habitLogs, entries] = await Promise.all([
      this.prisma.workoutLog.groupBy({
        by: ['clientId'],
        where: { clientId: { in: clientIds } },
        _max: { date: true },
      }),
      this.prisma.habitLog.groupBy({
        by: ['habitId'],
        where: { habitId: { in: habits.map((habit) => habit.id) } },
        _max: { date: true },
      }),
      this.prisma.progressEntry.groupBy({
        by: ['variableId'],
        where: { variableId: { in: variables.map((variable) => variable.id) } },
        _max: { date: true },
      }),
    ]);

    const latest = new Map<string, Date>();
    const remember = (clientId: string | undefined, date: Date | null): void => {
      if (clientId === undefined || date === null) {
        return;
      }

      const current = latest.get(clientId);

      if (current === undefined || date.getTime() > current.getTime()) {
        latest.set(clientId, date);
      }
    };

    const habitOwner = new Map(habits.map((habit) => [habit.id, habit.clientId]));
    const variableOwner = new Map(variables.map((variable) => [variable.id, variable.clientId]));

    for (const row of workouts) {
      remember(row.clientId, row._max.date);
    }
    for (const row of habitLogs) {
      remember(habitOwner.get(row.habitId), row._max.date);
    }
    for (const row of entries) {
      remember(variableOwner.get(row.variableId), row._max.date);
    }

    return latest;
  }

  /**
   * Clients who had something to do in the window: a scheduled session — the
   * Step 15 expansion, so COMPLETED plans still count and ARCHIVED ones stop
   * counting — or any habit at all.
   */
  private async eligibleByClient(clientIds: string[], from: Date, to: Date): Promise<Set<string>> {
    const [assignments, habits] = await Promise.all([
      this.prisma.assignment.findMany({
        where: {
          clientId: { in: clientIds },
          status: { in: [...HISTORY_STATUSES] },
          startDate: { lte: to },
          OR: [{ endDate: null }, { endDate: { gte: from } }],
        },
        select: { clientId: true, startDate: true, endDate: true, daysOfWeek: true },
      }),
      this.prisma.habit.findMany({
        where: { clientId: { in: clientIds } },
        select: { clientId: true },
      }),
    ]);

    const eligible = new Set(habits.map((habit) => habit.clientId));

    for (const assignment of assignments) {
      if (occurrenceDates(assignment, from, to).length > 0) {
        eligible.add(assignment.clientId);
      }
    }

    return eligible;
  }

  private async latestAlertByClient(clientIds: string[]): Promise<Map<string, Date>> {
    const alerts = await this.prisma.notification.findMany({
      where: { type: 'CLIENT_INACTIVE', clientId: { in: clientIds } },
      select: { clientId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const latest = new Map<string, Date>();

    for (const alert of alerts) {
      if (alert.clientId !== null && !latest.has(alert.clientId)) {
        latest.set(alert.clientId, alert.createdAt);
      }
    }

    return latest;
  }
}
