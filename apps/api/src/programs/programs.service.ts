import { Injectable, NotFoundException } from '@nestjs/common';
import type { ProgramPage, PublicProgramDetail } from '@gart/shared';

import { PrismaService } from '../database/prisma.service';
import { ExercisesService } from '../exercises/exercises.service';
import type { ProgramModel } from '../generated/prisma/models.js';
import type {
  CreateProgramDto,
  ListProgramsQuery,
  UpdateProgramDto,
} from './dto/create-program.dto';
import type { ProgramSectionDto } from './dto/program-tree.dto';
import { toPublicProgram, toPublicProgramDetail, type ProgramTree } from './program.mapper';
import { validateProgramTree } from './program-rules';

/** The full nested read, ordered by the persisted order columns. */
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
 * Programs are the trainer's own templates — trainerId first parameter, single
 * rows through `{ id, trainerId }`, misses a bare 404, exactly the established
 * pattern. Exercise references in payloads validate through ExercisesService's
 * visibleTo gate: no parallel ownership code here.
 *
 * The tree is written wholesale: created nested in one statement, replaced
 * wholesale on update. Nothing durable may ever reference section or line ids
 * (assignments and logs snapshot prescriptions), so id churn on save is a
 * property of the design, not an accident.
 */
@Injectable()
export class ProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exercises: ExercisesService,
  ) {}

  async list(trainerId: string, query: ListProgramsQuery): Promise<ProgramPage> {
    const where = { trainerId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.program.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { sections: { select: { _count: { select: { exercises: true } } } } },
      }),
      this.prisma.program.count({ where }),
    ]);

    return {
      items: items.map(toPublicProgram),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findOne(trainerId: string, programId: string): Promise<PublicProgramDetail> {
    return toPublicProgramDetail(await this.getTree(trainerId, programId));
  }

  /**
   * The owned tree, raw. Public because copy-on-assign reads the template
   * through the same gate as every other access — no parallel ownership code
   * in the assignments module.
   */
  async getTree(trainerId: string, programId: string): Promise<ProgramTree> {
    await this.requireOwned(trainerId, programId);

    return this.prisma.program.findUniqueOrThrow({
      where: { id: programId },
      include: TREE_INCLUDE,
    });
  }

  async create(trainerId: string, dto: CreateProgramDto): Promise<PublicProgramDetail> {
    await this.validateTree(trainerId, dto.sections);

    // A single nested create is one implicit transaction: the whole tree
    // commits or none of it does. Order columns are the array indexes — the
    // payload's shape is the only source of ordering.
    const created = await this.prisma.program.create({
      data: {
        trainerId,
        name: dto.name,
        description: dto.description ?? null,
        type: dto.type,
        sections: { create: buildSectionsCreate(dto.sections) },
      },
      select: { id: true },
    });

    return this.findOne(trainerId, created.id);
  }

  async update(
    trainerId: string,
    programId: string,
    dto: UpdateProgramDto,
  ): Promise<PublicProgramDetail> {
    await this.requireOwned(trainerId, programId);

    if (dto.sections !== undefined) {
      await this.validateTree(trainerId, dto.sections);
    }

    const sections = dto.sections;

    await this.prisma.$transaction(async (tx) => {
      await tx.program.update({
        where: { id: programId },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.description === undefined ? {} : { description: dto.description }),
          ...(dto.type === undefined ? {} : { type: dto.type }),
        },
      });

      // Full replace: the saved array IS the program. Deleting cascades the
      // lines; the referenced Exercise rows are untouched by design.
      if (sections !== undefined) {
        await tx.programSection.deleteMany({ where: { programId } });
        await tx.program.update({
          where: { id: programId },
          data: { sections: { create: buildSectionsCreate(sections) } },
        });
      }
    });

    return this.findOne(trainerId, programId);
  }

  async remove(trainerId: string, programId: string): Promise<void> {
    const program = await this.requireOwned(trainerId, programId);

    // Cascade takes the sections and lines; Exercise rows stay.
    await this.prisma.program.delete({ where: { id: program.id } });
  }

  /** Structure rules first (pure, no I/O), then the cross-tenant reference gate. */
  private async validateTree(trainerId: string, sections: ProgramSectionDto[]): Promise<void> {
    validateProgramTree(sections);

    await this.exercises.assertAllVisible(
      trainerId,
      sections.flatMap((section) => section.exercises.map((exercise) => exercise.exerciseId)),
    );
  }

  /** The single tenant gate: `{ id, trainerId }`, a miss is a bare 404. */
  private async requireOwned(trainerId: string, programId: string): Promise<ProgramModel> {
    const program = await this.prisma.program.findFirst({ where: { id: programId, trainerId } });

    if (program === null) {
      throw new NotFoundException();
    }

    return program;
  }
}

function buildSectionsCreate(sections: ProgramSectionDto[]) {
  return sections.map((section, sectionIndex) => ({
    name: section.name ?? null,
    type: section.type,
    order: sectionIndex,
    timeCapSeconds: section.timeCapSeconds ?? null,
    intervalSeconds: section.intervalSeconds ?? null,
    rounds: section.rounds ?? null,
    restBetweenRoundsSeconds: section.restBetweenRoundsSeconds ?? null,
    exercises: {
      create: section.exercises.map((exercise, exerciseIndex) => ({
        exerciseId: exercise.exerciseId,
        order: exerciseIndex,
        sets: exercise.sets ?? null,
        reps: exercise.reps ?? null,
        loadValue: exercise.loadValue ?? null,
        loadUnit: exercise.loadUnit ?? null,
        loadText: exercise.loadText ?? null,
        restSeconds: exercise.restSeconds ?? null,
        tempo: exercise.tempo ?? null,
        notes: exercise.notes ?? null,
        durationSeconds: exercise.durationSeconds ?? null,
        distanceMeters: exercise.distanceMeters ?? null,
      })),
    },
  }));
}
