import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClientsModule } from '../clients/clients.module';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClientNutritionController } from './client-nutrition.controller';
import { FoodsController, NutritionStatusController } from './foods.controller';
import { FoodsService } from './foods.service';
import { MealPlanAssignmentsService } from './meal-plan-assignments.service';
import { MealPlansService } from './meal-plans.service';
import {
  ClientMealPlansController,
  MealPlansController,
  MealsController,
} from './meals.controller';
import { MealsService } from './meals.service';
import { NutritionGuard } from './nutrition.guard';

@Module({
  imports: [DatabaseModule, AuthModule, ClientsModule, NotificationsModule],
  controllers: [
    FoodsController,
    NutritionStatusController,
    MealsController,
    MealPlansController,
    ClientMealPlansController,
    ClientNutritionController,
  ],
  providers: [
    FoodsService,
    MealsService,
    MealPlansService,
    MealPlanAssignmentsService,
    NutritionGuard,
  ],
})
export class NutritionModule {}
