import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ExercisesController } from './exercises.controller';
import { ExercisesService } from './exercises.service';
import { MuscleGroupsController } from './muscle-groups.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ExercisesController, CategoriesController, MuscleGroupsController],
  providers: [ExercisesService, CategoriesService],
})
export class ExercisesModule {}
