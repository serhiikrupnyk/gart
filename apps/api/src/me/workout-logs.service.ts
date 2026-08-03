import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ClientWorkoutLog } from '@gart/shared';

import { PrismaService } from '../database/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { toClientWorkoutLog } from './client-workout.mapper';
import type { LogWorkoutExerciseDto } from './dto/log-workout.dto';
import { parseIsoDate } from '../common/calendar';
import { assertWithinLogWindow, scheduledAssignmentWhere } from './schedule';

const NOT_SCHEDULED_MESSAGE = 'Тренування не заплановане на цей день';

/**
 * Recording what actually happened. The prescription is never touched: this
 * service only ever READS `AssignmentExercise`, to prove the line belongs to
 * the caller. Planned and actual live in different tables and cannot
 * contaminate each other.
 *
 * The write is an upsert keyed on (assignmentExerciseId, date) — a unique
 * constraint in the database, so editing today's record updates it and no
 * retried request can double-count volume in Phase 2's charts. Set rows are
 * replaced wholesale inside the same transaction, the same contract program
 * trees and assignment snapshots already use.
 */
@Injectable()
export class WorkoutLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async save(
    trainerId: string,
    clientId: string,
    assignmentExerciseId: string,
    date: string,
    dto: LogWorkoutExerciseDto,
  ): Promise<ClientWorkoutLog> {
    const day = parseIsoDate(date);

    await this.requireLoggable(trainerId, clientId, assignmentExerciseId, day);

    const sets = dto.sets.map((set, index) => ({
      order: index,
      reps: set.reps ?? null,
      loadKg: set.loadKg ?? null,
      durationSeconds: set.durationSeconds ?? null,
      distanceMeters: set.distanceMeters ?? null,
    }));
    const notes = dto.notes == null || dto.notes === '' ? null : dto.notes;

    // Read before writing so the notification can tell a new record from an
    // edit — five taps on one session must not become five notifications.
    const previous = await this.prisma.workoutLog.findUnique({
      where: { assignmentExerciseId_date: { assignmentExerciseId, date: day } },
      select: { completed: true },
    });

    // One transaction: the log and exactly the sets it was saved with.
    const log = await this.prisma.workoutLog.upsert({
      where: { assignmentExerciseId_date: { assignmentExerciseId, date: day } },
      create: {
        trainerId,
        clientId,
        assignmentExerciseId,
        date: day,
        completed: dto.completed,
        notes,
        sets: { create: sets },
      },
      update: {
        completed: dto.completed,
        notes,
        sets: { deleteMany: {}, create: sets },
      },
      include: { sets: { orderBy: { order: 'asc' } } },
    });

    await this.announce(trainerId, clientId, assignmentExerciseId, day, previous, dto, notes);

    return toClientWorkoutLog(log);
  }

  /**
   * What the trainer hears about. Best effort throughout — NotificationService
   * swallows its own failures, so nothing here can cost a client their record.
   */
  private async announce(
    trainerId: string,
    clientId: string,
    assignmentExerciseId: string,
    day: Date,
    previous: { completed: boolean } | null,
    dto: LogWorkoutExerciseDto,
    notes: string | null,
  ): Promise<void> {
    // A stated reason is the signal a trainer must act on, so it announces
    // itself the moment an exercise becomes skipped — but not again on edits.
    if (!dto.completed && notes !== null && previous?.completed !== false) {
      await this.notifications.notifyTrainer({
        trainerId,
        clientId,
        type: 'EXERCISE_SKIPPED',
        detail: notes,
      });

      return;
    }

    if (previous !== null) {
      return;
    }

    // The session announces itself once: only when this is the first record
    // for its (assignment, date).
    const line = await this.prisma.assignmentExercise.findUnique({
      where: { id: assignmentExerciseId },
      select: { section: { select: { assignmentId: true } } },
    });

    if (line === null) {
      return;
    }

    const recordsForSession = await this.prisma.workoutLog.count({
      where: {
        date: day,
        assignmentExercise: { section: { assignmentId: line.section.assignmentId } },
      },
    });

    if (recordsForSession === 1) {
      await this.notifications.notifyTrainer({ trainerId, clientId, type: 'WORKOUT_LOGGED' });
    }
  }

  async remove(
    trainerId: string,
    clientId: string,
    assignmentExerciseId: string,
    date: string,
  ): Promise<void> {
    const day = parseIsoDate(date);

    // Scoped by the tenant pair, so a foreign log is as absent as a missing one.
    const { count } = await this.prisma.workoutLog.deleteMany({
      where: { assignmentExerciseId, date: day, trainerId, clientId },
    });

    if (count === 0) {
      throw new NotFoundException();
    }
  }

  /**
   * Two gates, in this order. Ownership first: a snapshot line that is not the
   * caller's answers exactly like one that does not exist. Only then the
   * schedule, which may explain itself — it discloses nothing but the client's
   * own plan.
   */
  private async requireLoggable(
    trainerId: string,
    clientId: string,
    assignmentExerciseId: string,
    day: Date,
  ): Promise<void> {
    const owned = await this.prisma.assignmentExercise.findFirst({
      where: { id: assignmentExerciseId, section: { assignment: { trainerId, clientId } } },
      select: { id: true },
    });

    if (owned === null) {
      throw new NotFoundException();
    }

    assertWithinLogWindow(day, new Date());

    // You may log exactly what the day's workout view would have shown you.
    const scheduled = await this.prisma.assignmentExercise.findFirst({
      where: {
        id: assignmentExerciseId,
        section: { assignment: scheduledAssignmentWhere(trainerId, clientId, day) },
      },
      select: { id: true },
    });

    if (scheduled === null) {
      throw new BadRequestException(NOT_SCHEDULED_MESSAGE);
    }
  }
}
