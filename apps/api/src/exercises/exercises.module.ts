import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ExerciseMediaController, ExerciseMediaUrlController } from './exercise-media.controller';
import { ExerciseMediaService } from './exercise-media.service';
import { ExercisesController } from './exercises.controller';
import { ExercisesService } from './exercises.service';
import { MuscleGroupsController } from './muscle-groups.controller';

@Module({
  imports: [DatabaseModule, AuthModule, StorageModule],
  controllers: [
    ExercisesController,
    ExerciseMediaController,
    ExerciseMediaUrlController,
    CategoriesController,
    MuscleGroupsController,
  ],
  providers: [ExercisesService, ExerciseMediaService, CategoriesService],
})
export class ExercisesModule {}
