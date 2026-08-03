import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HABIT_LOG_WINDOW_DAYS,
  HABIT_STRIP_DAYS,
  type HabitDay,
  type HabitStatus,
  type HabitsView,
  type PublicHabit,
} from '@gart/shared';

import { ClientsService } from '../clients/clients.service';
import {
  addDays,
  differenceInDays,
  eachDay,
  parseIsoDate,
  toDateString,
  utcToday,
} from '../common/calendar';
import { PrismaService } from '../database/prisma.service';
import type { HabitLogModel, HabitModel } from '../generated/prisma/models.js';
import type { CreateHabitDto, HabitsQuery, LogHabitDto, UpdateHabitDto } from './dto/habit.dto';
import { resolveHabitShape } from './habit-rules';
import { computeStreaks } from './streaks';

const DUPLICATE_NAME_MESSAGE = 'Звичка з такою назвою вже є';
const OUT_OF_WINDOW_MESSAGE = `Відмічати можна протягом ${String(HABIT_LOG_WINDOW_DAYS)} днів`;
const FUTURE_MESSAGE = 'Не можна відмітити майбутній день';
const UNIQUE_CONSTRAINT_ERROR = 'P2002';

/** A device's calendar can run a day ahead of UTC; the same tolerance as logs. */
const FUTURE_TOLERANCE_DAYS = 1;

/** Long enough that a longer streak is a very good problem to have. */
const STREAK_WINDOW_DAYS = 365;

type HabitWithLogs = HabitModel & { logs: HabitLogModel[] };

/**
 * Habits and their daily records.
 *
 * The trainer defines and observes; the client logs. There is no trainer write
 * path for a day, because a habit is the client's own act — one fewer way to
 * get ownership wrong.
 *
 * Every read is scoped `{ trainerId, clientId }`, the refinement Step 16
 * settled: for data belonging to ONE client, the tenant alone is not enough of
 * a lens — a sibling client of the same trainer must be as far away as a
 * stranger.
 */
@Injectable()
export class HabitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
  ) {}

  async create(trainerId: string, clientId: string, dto: CreateHabitDto): Promise<PublicHabit> {
    const client = await this.clients.requireOwned(trainerId, clientId);
    const shape = resolveHabitShape(dto.kind, dto.targetValue, dto.unit);

    const created = await this.prisma.habit
      .create({ data: { trainerId, clientId: client.id, name: dto.name, ...shape } })
      .catch((error: unknown) => {
        if (isUniqueConstraintError(error)) {
          throw new ConflictException(DUPLICATE_NAME_MESSAGE);
        }
        throw error;
      });

    return toPublicHabit(created);
  }

  async update(trainerId: string, habitId: string, dto: UpdateHabitDto): Promise<PublicHabit> {
    const habit = await this.requireOwned(trainerId, habitId);

    // Validate the MERGED habit: changing only the kind must still leave a
    // coherent row, so the rules see what the habit will actually become.
    const shape = resolveHabitShape(
      dto.kind ?? habit.kind,
      dto.targetValue ?? (dto.kind === 'CHECK' ? undefined : Number(habit.targetValue)),
      dto.unit === undefined ? habit.unit : dto.unit,
    );

    const updated = await this.prisma.habit
      .update({
        where: { id: habit.id },
        data: { ...(dto.name === undefined ? {} : { name: dto.name }), ...shape },
      })
      .catch((error: unknown) => {
        if (isUniqueConstraintError(error)) {
          throw new ConflictException(DUPLICATE_NAME_MESSAGE);
        }
        throw error;
      });

    return toPublicHabit(updated);
  }

  async remove(trainerId: string, habitId: string): Promise<void> {
    const habit = await this.requireOwned(trainerId, habitId);

    // Cascade takes the days with it: a habit nobody tracks any more has no
    // history worth keeping without the habit itself.
    await this.prisma.habit.delete({ where: { id: habit.id } });
  }

  async forClient(trainerId: string, clientId: string, query: HabitsQuery): Promise<HabitsView> {
    const client = await this.clients.requireOwned(trainerId, clientId);

    return this.buildView(trainerId, client.id, query);
  }

  /** One shape for both audiences — the trainer's view and the client's own. */
  async buildView(trainerId: string, clientId: string, query: HabitsQuery): Promise<HabitsView> {
    const reference = query.date === undefined ? utcToday(new Date()) : parseIsoDate(query.date);

    const habits = await this.prisma.habit.findMany({
      where: { trainerId, clientId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        logs: { where: { date: { gte: addDays(reference, -STREAK_WINDOW_DAYS), lte: reference } } },
      },
    });

    return {
      date: toDateString(reference),
      habits: habits.map((habit) => toStatus(habit, reference)),
    };
  }

  /**
   * The client's own write. Scoped by the tenant pair, so another client's
   * habit is as absent as one that never existed.
   */
  async log(
    trainerId: string,
    clientId: string,
    habitId: string,
    date: string,
    dto: LogHabitDto,
  ): Promise<HabitDay> {
    const habit = await this.requireOwnedByClient(trainerId, clientId, habitId);
    const day = this.parseLoggableDate(date);

    const log = await this.prisma.habitLog.upsert({
      where: { habitId_date: { habitId: habit.id, date: day } },
      create: { habitId: habit.id, date: day, value: dto.value },
      update: { value: dto.value },
    });

    return toHabitDay(toDateString(day), log, Number(habit.targetValue));
  }

  /** Untapping removes the day rather than recording a zero nobody can read. */
  async removeLog(
    trainerId: string,
    clientId: string,
    habitId: string,
    date: string,
  ): Promise<void> {
    const habit = await this.requireOwnedByClient(trainerId, clientId, habitId);
    const day = this.parseLoggableDate(date);

    const { count } = await this.prisma.habitLog.deleteMany({
      where: { habitId: habit.id, date: day },
    });

    if (count === 0) {
      throw new NotFoundException();
    }
  }

  /** The trainer's gate: `{ id, trainerId }`, a miss is a bare 404. */
  private async requireOwned(trainerId: string, habitId: string): Promise<HabitModel> {
    const habit = await this.prisma.habit.findFirst({ where: { id: habitId, trainerId } });

    if (habit === null) {
      throw new NotFoundException();
    }

    return habit;
  }

  /** The client's gate: both ids, so a sibling client is as far away as a stranger. */
  private async requireOwnedByClient(
    trainerId: string,
    clientId: string,
    habitId: string,
  ): Promise<HabitModel> {
    const habit = await this.prisma.habit.findFirst({
      where: { id: habitId, trainerId, clientId },
    });

    if (habit === null) {
      throw new NotFoundException();
    }

    return habit;
  }

  private parseLoggableDate(date: string): Date {
    const day = parseIsoDate(date);
    const offset = differenceInDays(day, utcToday(new Date()));

    if (offset > FUTURE_TOLERANCE_DAYS) {
      throw new BadRequestException(FUTURE_MESSAGE);
    }
    if (offset < -HABIT_LOG_WINDOW_DAYS) {
      throw new BadRequestException(OUT_OF_WINDOW_MESSAGE);
    }

    return day;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_CONSTRAINT_ERROR
  );
}

function toPublicHabit(habit: HabitModel): PublicHabit {
  return {
    id: habit.id,
    name: habit.name,
    kind: habit.kind,
    targetValue: Number(habit.targetValue),
    unit: habit.unit,
  };
}

function toHabitDay(date: string, log: HabitLogModel | undefined, target: number): HabitDay {
  const value = log === undefined ? null : Number(log.value);

  // One comparison for every kind, which is the whole point of storing a
  // checkbox habit as a target of 1.
  return { date, value, met: value !== null && value >= target };
}

function toStatus(habit: HabitWithLogs, reference: Date): HabitStatus {
  const target = Number(habit.targetValue);
  const byDate = new Map(habit.logs.map((log) => [toDateString(log.date), log]));

  const met = new Set(
    [...byDate.entries()].filter(([, log]) => Number(log.value) >= target).map(([date]) => date),
  );

  const streaks = computeStreaks(met, reference);
  const stripStart = addDays(reference, -(HABIT_STRIP_DAYS - 1));
  const recentDays = eachDay(stripStart, reference).map((day) => {
    const date = toDateString(day);

    return toHabitDay(date, byDate.get(date), target);
  });

  return {
    ...toPublicHabit(habit),
    today:
      recentDays[recentDays.length - 1]?.value === null
        ? null
        : (recentDays[recentDays.length - 1] ?? null),
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    recentDays,
  };
}
