import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PublicAssignment, PublicAssignmentDetail } from '@gart/shared';

import { ClientsService } from '../clients/clients.service';
import { PrismaService } from '../database/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import type { AssignmentModel } from '../generated/prisma/models.js';
import type { ProgramTree } from '../programs/program.mapper';
import { ProgramsService } from '../programs/programs.service';
import {
  toPublicAssignment,
  toPublicAssignmentDetail,
  type AssignmentTree,
} from './assignment.mapper';
import type { CreateAssignmentDto, UpdateAssignmentDto } from './dto/assignment.dto';

/** Body reference, so a foreign template answers exactly like a nonexistent one. */
const PROGRAM_NOT_FOUND_MESSAGE = 'Програму не знайдено';
const CLIENT_ARCHIVED_MESSAGE = 'Клієнт в архіві';
const DATE_ORDER_MESSAGE = 'Дата завершення не може бути раніше за дату початку';
const DUPLICATE_DAYS_MESSAGE = 'Дні тижня не повинні повторюватись';

const TREE_INCLUDE = {
  sections: {
    orderBy: { order: 'asc' as const },
    include: {
      exercises: {
        orderBy: { order: 'asc' as const },
        include: {
          exercise: { select: { id: true, name: true, primaryMuscleGroup: true } },
        },
      },
    },
  },
};

/**
 * Copy-on-assign — THE invariant this module exists for. Assigning reads the
 * template through the programs gate and writes an independent snapshot in one
 * nested create; afterwards the template may be edited or deleted freely and
 * the assignment cannot change, because no code path updates the snapshot tree
 * and `sourceProgramId` is provenance only (SET NULL on template delete).
 *
 * Snapshot rows are written once, so their ids are durable — what Step 14's
 * logs will reference. Ownership follows the house pattern exactly: trainerId
 * first, `findFirst({ id, trainerId })`, misses are bare 404s; client and
 * program checks reuse the existing public gates rather than re-implementing.
 */
@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
    private readonly programs: ProgramsService,
    private readonly notifications: NotificationService,
  ) {}

  async create(
    trainerId: string,
    clientId: string,
    dto: CreateAssignmentDto,
  ): Promise<PublicAssignmentDetail> {
    const client = await this.clients.requireOwned(trainerId, clientId);

    if (client.status === 'ARCHIVED') {
      throw new BadRequestException(CLIENT_ARCHIVED_MESSAGE);
    }

    const schedule = parseSchedule(dto);

    // The template, through the same gate as every program read — but a body
    // reference answers 400, indistinguishable for foreign and nonexistent.
    const tree = await this.programs.getTree(trainerId, dto.programId).catch((error: unknown) => {
      if (error instanceof NotFoundException) {
        throw new BadRequestException(PROGRAM_NOT_FOUND_MESSAGE);
      }
      throw error;
    });

    // One nested create = one transaction: the whole snapshot or nothing.
    const created = await this.prisma.assignment.create({
      data: {
        trainerId,
        clientId: client.id,
        sourceProgramId: tree.id,
        name: tree.name,
        description: tree.description,
        type: tree.type,
        ...schedule,
        sections: { create: buildSnapshot(tree) },
      },
      select: { id: true },
    });

    // The one notification that travels the other way in this step: the client
    // learns their trainer has given them something to do.
    await this.notifications.notifyClient({
      trainerId,
      clientId: client.id,
      type: 'ASSIGNMENT_CREATED',
      title: 'Нова програма',
      body: tree.name,
    });

    return this.findOne(trainerId, created.id);
  }

  async listForClient(trainerId: string, clientId: string): Promise<PublicAssignment[]> {
    const client = await this.clients.requireOwned(trainerId, clientId);

    const assignments = await this.prisma.assignment.findMany({
      where: { trainerId, clientId: client.id },
      orderBy: [{ assignedAt: 'desc' }, { id: 'asc' }],
      include: { sections: { select: { _count: { select: { exercises: true } } } } },
    });

    return assignments.map(toPublicAssignment);
  }

  async findOne(trainerId: string, assignmentId: string): Promise<PublicAssignmentDetail> {
    await this.requireOwned(trainerId, assignmentId);

    const assignment: AssignmentTree = await this.prisma.assignment.findUniqueOrThrow({
      where: { id: assignmentId },
      include: TREE_INCLUDE,
    });

    return toPublicAssignmentDetail(assignment);
  }

  async update(
    trainerId: string,
    assignmentId: string,
    dto: UpdateAssignmentDto,
  ): Promise<PublicAssignmentDetail> {
    const assignment = await this.requireOwned(trainerId, assignmentId);

    const startDate = dto.startDate === undefined ? assignment.startDate : parseDate(dto.startDate);
    const endDate =
      dto.endDate === undefined
        ? assignment.endDate
        : dto.endDate === null
          ? null
          : parseDate(dto.endDate);

    assertDateOrder(startDate, endDate);

    if (dto.daysOfWeek !== undefined) {
      assertUniqueDays(dto.daysOfWeek);
    }

    await this.prisma.assignment.update({
      where: { id: assignment.id },
      data: {
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.startDate === undefined ? {} : { startDate }),
        ...(dto.endDate === undefined ? {} : { endDate }),
        ...(dto.daysOfWeek === undefined ? {} : { daysOfWeek: dto.daysOfWeek }),
      },
    });

    return this.findOne(trainerId, assignment.id);
  }

  async remove(trainerId: string, assignmentId: string): Promise<void> {
    const assignment = await this.requireOwned(trainerId, assignmentId);

    // Cascade takes the snapshot; Exercise and Program rows are untouched.
    await this.prisma.assignment.delete({ where: { id: assignment.id } });
  }

  /** The single tenant gate: `{ id, trainerId }`, a miss is a bare 404. */
  private async requireOwned(trainerId: string, assignmentId: string): Promise<AssignmentModel> {
    const assignment = await this.prisma.assignment.findFirst({
      where: { id: assignmentId, trainerId },
    });

    if (assignment === null) {
      throw new NotFoundException();
    }

    return assignment;
  }
}

/** 'YYYY-MM-DD' → UTC midnight, matching the @db.Date columns. */
function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function assertDateOrder(startDate: Date, endDate: Date | null): void {
  if (endDate !== null && endDate.getTime() < startDate.getTime()) {
    throw new BadRequestException(DATE_ORDER_MESSAGE);
  }
}

function assertUniqueDays(days: number[]): void {
  if (new Set(days).size !== days.length) {
    throw new BadRequestException(DUPLICATE_DAYS_MESSAGE);
  }
}

function parseSchedule(dto: CreateAssignmentDto): {
  startDate: Date;
  endDate: Date | null;
  daysOfWeek: number[];
} {
  assertUniqueDays(dto.daysOfWeek);

  const startDate = parseDate(dto.startDate);
  const endDate = dto.endDate == null ? null : parseDate(dto.endDate);

  assertDateOrder(startDate, endDate);

  return { startDate, endDate, daysOfWeek: dto.daysOfWeek };
}

/** The copy itself: every structural and prescription field, order included. */
function buildSnapshot(tree: ProgramTree) {
  return tree.sections.map((section) => ({
    name: section.name,
    type: section.type,
    order: section.order,
    timeCapSeconds: section.timeCapSeconds,
    intervalSeconds: section.intervalSeconds,
    rounds: section.rounds,
    restBetweenRoundsSeconds: section.restBetweenRoundsSeconds,
    exercises: {
      create: section.exercises.map((line) => ({
        exerciseId: line.exerciseId,
        order: line.order,
        sets: line.sets,
        reps: line.reps,
        loadValue: line.loadValue,
        loadUnit: line.loadUnit,
        loadText: line.loadText,
        restSeconds: line.restSeconds,
        tempo: line.tempo,
        notes: line.notes,
        durationSeconds: line.durationSeconds,
        distanceMeters: line.distanceMeters,
      })),
    },
  }));
}
