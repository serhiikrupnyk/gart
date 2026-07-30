import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { PublicCategory } from '@gart/shared';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { TrainerGuard } from '../auth/trainer.guard';
import { CategoriesService } from './categories.service';
import { CategoryDto } from './dto/category.dto';

@Controller('categories')
@UseGuards(TrainerGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  async list(@CurrentAuth() auth: AuthContext): Promise<PublicCategory[]> {
    return this.categories.list(auth.trainer.id);
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CategoryDto,
  ): Promise<PublicCategory> {
    return this.categories.create(auth.trainer.id, dto);
  }

  @Patch(':id')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CategoryDto,
  ): Promise<PublicCategory> {
    return this.categories.update(auth.trainer.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<void> {
    await this.categories.remove(auth.trainer.id, id);
  }
}
