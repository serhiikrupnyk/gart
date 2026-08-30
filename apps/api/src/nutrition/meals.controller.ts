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
import type { MealPage, PublicMeal, PublicMealPlan, TrainerAssignedPlan } from '@gart/shared';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { TrainerGuard } from '../auth/trainer.guard';
import { AssignMealPlanDto } from './dto/assign-plan.dto';
import {
  CreateMealDto,
  CreateMealPlanDto,
  ListMealsQuery,
  UpdateMealDto,
  UpdateMealPlanDto,
} from './dto/meal.dto';
import { MealPlanAssignmentsService } from './meal-plan-assignments.service';
import { MealPlansService } from './meal-plans.service';
import { MealsService } from './meals.service';
import { NutritionGuard } from './nutrition.guard';

/** Every controller here carries the same pair — see NutritionGuard. */
@Controller('nutrition/meals')
@UseGuards(TrainerGuard, NutritionGuard)
export class MealsController {
  constructor(private readonly meals: MealsService) {}

  @Get()
  async list(@CurrentAuth() auth: AuthContext, @Query() query: ListMealsQuery): Promise<MealPage> {
    return this.meals.list(auth.trainer.id, query);
  }

  @Get(':id')
  async find(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<PublicMeal> {
    return this.meals.find(auth.trainer.id, id);
  }

  @Post()
  async create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateMealDto): Promise<PublicMeal> {
    return this.meals.create(auth.trainer.id, dto);
  }

  @Patch(':id')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateMealDto,
  ): Promise<PublicMeal> {
    return this.meals.update(auth.trainer.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<void> {
    await this.meals.remove(auth.trainer.id, id);
  }
}

@Controller('nutrition/plans')
@UseGuards(TrainerGuard, NutritionGuard)
export class MealPlansController {
  constructor(
    private readonly plans: MealPlansService,
    private readonly assignments: MealPlanAssignmentsService,
  ) {}

  @Get()
  async list(@CurrentAuth() auth: AuthContext): Promise<PublicMealPlan[]> {
    return this.plans.list(auth.trainer.id);
  }

  @Get(':id')
  async find(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<PublicMealPlan> {
    return this.plans.find(auth.trainer.id, id);
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateMealPlanDto,
  ): Promise<PublicMealPlan> {
    return this.plans.create(auth.trainer.id, dto);
  }

  @Patch(':id')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateMealPlanDto,
  ): Promise<PublicMealPlan> {
    return this.plans.update(auth.trainer.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<void> {
    await this.plans.remove(auth.trainer.id, id);
  }

  /** Giving a plan to a client — copy-on-assign. */
  @Post('assign')
  async assign(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: AssignMealPlanDto,
  ): Promise<TrainerAssignedPlan> {
    return this.assignments.assign(auth.trainer.id, dto);
  }
}

/** What one client has been given, from the trainer's side. */
@Controller('clients/:clientId/nutrition-plans')
@UseGuards(TrainerGuard, NutritionGuard)
export class ClientMealPlansController {
  constructor(private readonly assignments: MealPlanAssignmentsService) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Param('clientId') clientId: string,
  ): Promise<TrainerAssignedPlan[]> {
    return this.assignments.listForClientOfTrainer(auth.trainer.id, clientId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param('clientId') clientId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.assignments.remove(auth.trainer.id, clientId, id);
  }
}
