import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PROGRESS_DEFAULT_DAYS,
  PROGRESS_MAX_DAYS,
  type ClientProgress,
  type ProgressPoint,
  type PublicProgressVariable,
} from '@gart/shared';

import { ClientsService } from '../clients/clients.service';
import {
  addDays,
  differenceInDays,
  parseIsoDate,
  toDateString,
  utcToday,
} from '../common/calendar';
import { PrismaService } from '../database/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import type { ProgressVariableModel } from '../generated/prisma/models.js';
import type {
  CreateProgressVariableDto,
  ProgressRangeQuery,
  SaveProgressEntryDto,
  UpdateProgressVariableDto,
} from './dto/progress.dto';
import {
  toProgressPhotoInfo,
  toProgressPoint,
  toProgressSeries,
  toPublicVariable,
  type VariableWithEntries,
} from './progress.mapper';

const DUPLICATE_NAME_MESSAGE = 'Змінна з такою назвою вже є';
const RANGE_ORDER_MESSAGE = 'Дата завершення не може бути раніше за дату початку';
const RANGE_TOO_LONG_MESSAGE = 'Період завеликий';
const UNIQUE_CONSTRAINT_ERROR = 'P2002';

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_CONSTRAINT_ERROR
  );
}

/**
 * Progress variables, their measurements, and the client's whole progress view.
 *
 * Ownership follows the house pattern exactly: `trainerId` first, the client
 * reached through `ClientsService.requireOwned`, variables through a
 * `findFirst({ id, trainerId })` gate — a miss is a bare 404, identical for
 * foreign and nonexistent. Entries are addressed by (variable, date) and
 * upserted, so re-measuring corrects a value instead of stacking another one.
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
    private readonly notifications: NotificationService,
  ) {}

  async listVariables(trainerId: string, clientId: string): Promise<PublicProgressVariable[]> {
    const client = await this.clients.requireOwned(trainerId, clientId);

    const variables = await this.prisma.progressVariable.findMany({
      where: { trainerId, clientId: client.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return variables.map(toPublicVariable);
  }

  async createVariable(
    trainerId: string,
    clientId: string,
    dto: CreateProgressVariableDto,
  ): Promise<PublicProgressVariable> {
    const client = await this.clients.requireOwned(trainerId, clientId);

    const created = await this.prisma.progressVariable
      .create({
        data: {
          trainerId,
          clientId: client.id,
          name: dto.name,
          unit: dto.unit,
          selfLog: dto.selfLog ?? false,
        },
      })
      .catch((error: unknown) => {
        if (isUniqueConstraintError(error)) {
          throw new ConflictException(DUPLICATE_NAME_MESSAGE);
        }
        throw error;
      });

    return toPublicVariable(created);
  }

  async updateVariable(
    trainerId: string,
    variableId: string,
    dto: UpdateProgressVariableDto,
  ): Promise<PublicProgressVariable> {
    const variable = await this.requireOwnedVariable(trainerId, variableId);

    const updated = await this.prisma.progressVariable
      .update({
        where: { id: variable.id },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.unit === undefined ? {} : { unit: dto.unit }),
          ...(dto.selfLog === undefined ? {} : { selfLog: dto.selfLog }),
        },
      })
      .catch((error: unknown) => {
        if (isUniqueConstraintError(error)) {
          throw new ConflictException(DUPLICATE_NAME_MESSAGE);
        }
        throw error;
      });

    return toPublicVariable(updated);
  }

  async removeVariable(trainerId: string, variableId: string): Promise<void> {
    const variable = await this.requireOwnedVariable(trainerId, variableId);

    // Cascade takes the measurements with it: a dimension the trainer stopped
    // tracking has no history worth keeping without the dimension itself.
    await this.prisma.progressVariable.delete({ where: { id: variable.id } });
  }

  async saveEntry(
    trainerId: string,
    variableId: string,
    date: string,
    dto: SaveProgressEntryDto,
  ): Promise<ProgressPoint> {
    await this.requireOwnedVariable(trainerId, variableId);

    return this.upsertEntry(variableId, date, dto);
  }

  async removeEntry(trainerId: string, variableId: string, date: string): Promise<void> {
    await this.requireOwnedVariable(trainerId, variableId);

    const { count } = await this.prisma.progressEntry.deleteMany({
      where: { variableId, date: parseIsoDate(date) },
    });

    if (count === 0) {
      throw new NotFoundException();
    }
  }

  /** The trainer's view of a client's progress — the same shape the client gets. */
  async forClient(
    trainerId: string,
    clientId: string,
    query: ProgressRangeQuery,
  ): Promise<ClientProgress> {
    const client = await this.clients.requireOwned(trainerId, clientId);

    return this.buildProgress(trainerId, client.id, query);
  }

  /**
   * Shared by both audiences: the trainer reading a client's page and the
   * client reading their own. One query shape, one tenant rule.
   */
  async buildProgress(
    trainerId: string,
    clientId: string,
    query: ProgressRangeQuery,
  ): Promise<ClientProgress> {
    const { from, to } = parseRange(query, new Date());

    const [variables, photos] = await Promise.all([
      this.prisma.progressVariable.findMany({
        where: { trainerId, clientId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: {
          entries: { where: { date: { gte: from, lte: to } }, orderBy: { date: 'asc' } },
        },
      }),
      this.prisma.progressPhoto.findMany({
        where: { trainerId, clientId, date: { gte: from, lte: to } },
        orderBy: [{ date: 'desc' }, { uploadedAt: 'desc' }],
      }),
    ]);

    return {
      from: toDateString(from),
      to: toDateString(to),
      variables: (variables as VariableWithEntries[]).map(toProgressSeries),
      photos: photos.map(toProgressPhotoInfo),
    };
  }

  /** The client's own write path — only for variables the trainer opened up. */
  async saveOwnEntry(
    trainerId: string,
    clientId: string,
    variableId: string,
    date: string,
    dto: SaveProgressEntryDto,
  ): Promise<ProgressPoint> {
    // Not theirs, or not open to them, answers the same way: a client cannot
    // learn that a closed variable exists.
    const variable = await this.prisma.progressVariable.findFirst({
      where: { id: variableId, trainerId, clientId, selfLog: true },
      select: { id: true, name: true, unit: true },
    });

    if (variable === null) {
      throw new NotFoundException();
    }

    const point = await this.upsertEntry(variable.id, date, dto);

    // The trainer hears about measurements the client took themselves; the
    // ones the trainer entered are already theirs.
    await this.notifications.notifyTrainer({
      trainerId,
      clientId,
      type: 'PROGRESS_LOGGED',
      detail: `${variable.name} ${String(point.value)} ${variable.unit}`,
    });

    return point;
  }

  private async upsertEntry(
    variableId: string,
    date: string,
    dto: SaveProgressEntryDto,
  ): Promise<ProgressPoint> {
    const day = parseIsoDate(date);
    const notes = dto.notes == null || dto.notes === '' ? null : dto.notes;

    const entry = await this.prisma.progressEntry.upsert({
      where: { variableId_date: { variableId, date: day } },
      create: { variableId, date: day, value: dto.value, notes },
      update: { value: dto.value, notes },
    });

    return toProgressPoint(entry);
  }

  /** The single gate for reaching one variable: `{ id, trainerId }`, miss → 404. */
  private async requireOwnedVariable(
    trainerId: string,
    variableId: string,
  ): Promise<ProgressVariableModel> {
    const variable = await this.prisma.progressVariable.findFirst({
      where: { id: variableId, trainerId },
    });

    if (variable === null) {
      throw new NotFoundException();
    }

    return variable;
  }
}

/** Bounded like every other range in the codebase, just over a longer horizon. */
function parseRange(query: ProgressRangeQuery, now: Date): { from: Date; to: Date } {
  const to = query.to === undefined ? utcToday(now) : parseIsoDate(query.to);
  const from =
    query.from === undefined ? addDays(to, -(PROGRESS_DEFAULT_DAYS - 1)) : parseIsoDate(query.from);

  if (from.getTime() > to.getTime()) {
    throw new BadRequestException(RANGE_ORDER_MESSAGE);
  }
  if (differenceInDays(to, from) >= PROGRESS_MAX_DAYS) {
    throw new BadRequestException(RANGE_TOO_LONG_MESSAGE);
  }

  return { from, to };
}
