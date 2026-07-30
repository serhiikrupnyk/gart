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
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ExercisePage, PublicExercise } from '@gart/shared';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { TrainerGuard } from '../auth/trainer.guard';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { ListExercisesQuery } from './dto/list-exercises.query';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import { ExercisesService } from './exercises.service';

/**
 * Every route passes `auth.trainer.id` into the service — the tenant is never
 * read from the path, body or query, only from the authenticated session.
 */
@Controller('exercises')
@UseGuards(TrainerGuard)
export class ExercisesController {
  constructor(private readonly exercises: ExercisesService) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: ListExercisesQuery,
  ): Promise<ExercisePage> {
    return this.exercises.list(auth.trainer.id, query);
  }

  @Get(':id')
  async findOne(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<PublicExercise> {
    return this.exercises.findOne(auth.trainer.id, id);
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateExerciseDto,
  ): Promise<PublicExercise> {
    return this.exercises.create(auth.trainer.id, dto);
  }

  @Patch(':id')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateExerciseDto,
  ): Promise<PublicExercise> {
    return this.exercises.update(auth.trainer.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<void> {
    await this.exercises.remove(auth.trainer.id, id);
  }
}
