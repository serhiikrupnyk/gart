import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PublicCategory } from '@gart/shared';

import { PrismaService } from '../database/prisma.service';
import type { CategoryModel } from '../generated/prisma/models.js';
import type { CategoryDto } from './dto/category.dto';
import { toPublicCategory } from './exercise.mapper';

const NAME_TAKEN_MESSAGE = 'Категорія з такою назвою вже існує';

const UNIQUE_CONSTRAINT_ERROR = 'P2002';

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_CONSTRAINT_ERROR
  );
}

/**
 * Same global-vs-custom policy as exercises: reads see global + own, writes go
 * through `{ id, trainerId }` and therefore can never touch a global row or
 * another trainer's. A custom name may shadow a global one — kept simple on
 * purpose.
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(trainerId: string): Promise<PublicCategory[]> {
    const categories = await this.prisma.category.findMany({
      where: { OR: [{ trainerId: null }, { trainerId }] },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return categories.map(toPublicCategory);
  }

  async create(trainerId: string, dto: CategoryDto): Promise<PublicCategory> {
    const category = await this.prisma.category
      .create({ data: { trainerId, name: dto.name } })
      .catch((error: unknown) => {
        if (isUniqueConstraintError(error)) {
          throw new ConflictException(NAME_TAKEN_MESSAGE);
        }
        throw error;
      });

    return toPublicCategory(category);
  }

  async update(trainerId: string, categoryId: string, dto: CategoryDto): Promise<PublicCategory> {
    const category = await this.requireOwned(trainerId, categoryId);

    const updated = await this.prisma.category
      .update({ where: { id: category.id }, data: { name: dto.name } })
      .catch((error: unknown) => {
        if (isUniqueConstraintError(error)) {
          throw new ConflictException(NAME_TAKEN_MESSAGE);
        }
        throw error;
      });

    return toPublicCategory(updated);
  }

  async remove(trainerId: string, categoryId: string): Promise<void> {
    const category = await this.requireOwned(trainerId, categoryId);

    // Referencing exercises keep living: the FK is onDelete: SetNull, so they
    // simply become uncategorised.
    await this.prisma.category.delete({ where: { id: category.id } });
  }

  /** Write gate — globals (NULL trainerId) and foreign rows fall to the same 404. */
  private async requireOwned(trainerId: string, categoryId: string): Promise<CategoryModel> {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, trainerId },
    });

    if (category === null) {
      throw new NotFoundException();
    }

    return category;
  }
}
