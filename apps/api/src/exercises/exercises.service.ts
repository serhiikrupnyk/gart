import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ExercisePage, PublicExercise } from '@gart/shared';

import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client.js';
import type { ExerciseMediaModel, ExerciseModel } from '../generated/prisma/models.js';
import { toPublicExercise } from './exercise.mapper';
import type { CreateExerciseDto } from './dto/create-exercise.dto';
import type { ListExercisesQuery } from './dto/list-exercises.query';
import type { UpdateExerciseDto } from './dto/update-exercise.dto';

/** Same body whether the category is foreign or nonexistent — no leak either way. */
const CATEGORY_NOT_FOUND_MESSAGE = 'Категорію не знайдено';

/** An exercise with its media rows — what the gates return and the mapper takes. */
export type ExerciseWithMedia = ExerciseModel & { media: ExerciseMediaModel[] };

/**
 * The entire global-vs-custom policy lives in the three private members at the
 * bottom. Reads go through `visibleTo`/`requireVisible` (global OR own); writes
 * go through `requireOwned`, whose where clause `{ id, trainerId }` can never
 * match a global row — its trainerId is NULL — nor another trainer's. Globals
 * are immutable by construction, with no "if global" branch to forget.
 *
 * As everywhere: trainerId is the first parameter of every method and there is
 * no overload without it.
 */
@Injectable()
export class ExercisesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(trainerId: string, query: ListExercisesQuery): Promise<ExercisePage> {
    const where: Prisma.ExerciseWhereInput = {
      AND: [
        this.visibleTo(trainerId),
        ...(query.muscleGroup === undefined
          ? []
          : [
              {
                OR: [
                  { primaryMuscleGroup: query.muscleGroup },
                  { muscleGroups: { has: query.muscleGroup } },
                ],
              },
            ]),
        ...(query.categoryId === undefined ? [] : [{ categoryId: query.categoryId }]),
        ...(query.search === undefined || query.search === ''
          ? []
          : [{ name: { contains: query.search, mode: 'insensitive' as const } }]),
      ],
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.exercise.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { media: true },
      }),
      this.prisma.exercise.count({ where }),
    ]);

    return {
      items: items.map(toPublicExercise),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findOne(trainerId: string, exerciseId: string): Promise<PublicExercise> {
    return toPublicExercise(await this.requireVisible(trainerId, exerciseId));
  }

  async create(trainerId: string, dto: CreateExerciseDto): Promise<PublicExercise> {
    if (dto.categoryId != null) {
      await this.assertCategoryUsable(trainerId, dto.categoryId);
    }

    const exercise = await this.prisma.exercise.create({
      data: {
        trainerId,
        name: dto.name,
        description: dto.description ?? null,
        primaryMuscleGroup: dto.primaryMuscleGroup,
        muscleGroups: dto.muscleGroups ?? [],
        categoryId: dto.categoryId ?? null,
        textInstructions: dto.textInstructions ?? null,
      },
      include: { media: true },
    });

    return toPublicExercise(exercise);
  }

  async update(
    trainerId: string,
    exerciseId: string,
    dto: UpdateExerciseDto,
  ): Promise<PublicExercise> {
    const exercise = await this.requireOwned(trainerId, exerciseId);

    if (dto.categoryId != null) {
      await this.assertCategoryUsable(trainerId, dto.categoryId);
    }

    // Absent = unchanged, null = cleared (nullable columns only — the DTO
    // rejects null for the rest).
    const updated = await this.prisma.exercise.update({
      where: { id: exercise.id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.description === undefined ? {} : { description: dto.description }),
        ...(dto.primaryMuscleGroup === undefined
          ? {}
          : { primaryMuscleGroup: dto.primaryMuscleGroup }),
        ...(dto.muscleGroups === undefined ? {} : { muscleGroups: dto.muscleGroups }),
        ...(dto.categoryId === undefined ? {} : { categoryId: dto.categoryId }),
        ...(dto.textInstructions === undefined ? {} : { textInstructions: dto.textInstructions }),
      },
      include: { media: true },
    });

    return toPublicExercise(updated);
  }

  async remove(trainerId: string, exerciseId: string): Promise<void> {
    const exercise = await this.requireOwned(trainerId, exerciseId);

    // Step 10: ProgramExercise will reference exercises with onDelete: Restrict.
    // This delete must then map the FK violation (P2003) to a 409
    // «Вправа використовується у програмі» instead of letting it become a 500.
    await this.prisma.exercise.delete({ where: { id: exercise.id } });
  }

  /** What this trainer may read: the global library plus their own rows. */
  private visibleTo(trainerId: string): Prisma.ExerciseWhereInput {
    return { OR: [{ trainerId: null }, { trainerId }] };
  }

  /**
   * Read gate: global or own, else the same 404 a nonexistent id produces.
   * Public because the media service reuses it — one ownership model, not two.
   */
  async requireVisible(trainerId: string, exerciseId: string): Promise<ExerciseWithMedia> {
    const exercise = await this.prisma.exercise.findFirst({
      where: { id: exerciseId, ...this.visibleTo(trainerId) },
      include: { media: true },
    });

    if (exercise === null) {
      throw new NotFoundException();
    }

    return exercise;
  }

  /**
   * Write gate: `{ id, trainerId }` matches only this trainer's own rows —
   * a global row's NULL trainerId can never equal a real id, so globals and
   * foreign rows alike fall through to the same 404.
   * Public because the media service reuses it — one ownership model, not two.
   */
  async requireOwned(trainerId: string, exerciseId: string): Promise<ExerciseWithMedia> {
    const exercise = await this.prisma.exercise.findFirst({
      where: { id: exerciseId, trainerId },
      include: { media: true },
    });

    if (exercise === null) {
      throw new NotFoundException();
    }

    return exercise;
  }

  /**
   * A categoryId in a request body is a cross-tenant reference vector: it must
   * resolve to a global category or the caller's own. 400 rather than 404 —
   * the record in question is fine, the request body is not — with one body
   * for "foreign" and "nonexistent" alike.
   */
  private async assertCategoryUsable(trainerId: string, categoryId: string): Promise<void> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, OR: [{ trainerId: null }, { trainerId }] },
    });

    if (category === null) {
      throw new BadRequestException(CATEGORY_NOT_FOUND_MESSAGE);
    }
  }
}
