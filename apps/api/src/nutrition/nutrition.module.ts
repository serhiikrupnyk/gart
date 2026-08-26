import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { FoodsController, NutritionStatusController } from './foods.controller';
import { FoodsService } from './foods.service';
import { NutritionGuard } from './nutrition.guard';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [FoodsController, NutritionStatusController],
  providers: [FoodsService, NutritionGuard],
})
export class NutritionModule {}
