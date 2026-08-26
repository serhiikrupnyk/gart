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
import type { FoodPage, NutritionStatus, PublicFood } from '@gart/shared';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { TrainerGuard } from '../auth/trainer.guard';
import { CreateFoodDto, ListFoodsQuery, UpdateFoodDto } from './dto/food.dto';
import { FoodsService } from './foods.service';
import { NutritionGuard } from './nutrition.guard';

/**
 * The food library.
 *
 * `NutritionGuard` sits on the CONTROLLER, after TrainerGuard, so every route
 * below is gated by the trainer's plan before it is written — not by a
 * decorator on each one that somebody has to remember. Steps 30 and 31 must
 * carry the same pair on their controllers.
 */
@Controller('nutrition/foods')
@UseGuards(TrainerGuard, NutritionGuard)
export class FoodsController {
  constructor(private readonly foods: FoodsService) {}

  @Get()
  async list(@CurrentAuth() auth: AuthContext, @Query() query: ListFoodsQuery): Promise<FoodPage> {
    return this.foods.list(auth.trainer.id, query);
  }

  @Get(':id')
  async find(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<PublicFood> {
    return this.foods.find(auth.trainer.id, id);
  }

  @Post()
  async create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateFoodDto): Promise<PublicFood> {
    return this.foods.create(auth.trainer.id, dto);
  }

  @Patch(':id')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateFoodDto,
  ): Promise<PublicFood> {
    return this.foods.update(auth.trainer.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<void> {
    await this.foods.remove(auth.trainer.id, id);
  }
}

/**
 * What a trainer may know about nutrition on ANY plan.
 *
 * Deliberately not behind NutritionGuard. A trainer who has downgraded is told
 * their library is intact — and this is what lets them CHECK that rather than
 * take our word for it. A count discloses no nutrition data, and a promise
 * somebody can verify is worth more than the same promise asserted.
 */
@Controller('nutrition/status')
@UseGuards(TrainerGuard)
export class NutritionStatusController {
  constructor(private readonly foods: FoodsService) {}

  @Get()
  async status(@CurrentAuth() auth: AuthContext): Promise<NutritionStatus> {
    return this.foods.status(auth.trainer.id);
  }
}
