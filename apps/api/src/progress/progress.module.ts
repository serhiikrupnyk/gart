import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClientsModule } from '../clients/clients.module';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { ExerciseHistoryService } from './exercise-history.service';
import { ProgressPhotosService } from './progress-photos.service';
import {
  ClientProgressController,
  MeProgressController,
  ProgressController,
  ProgressPhotoUrlController,
} from './progress.controller';
import { ProgressService } from './progress.service';

@Module({
  imports: [DatabaseModule, AuthModule, ClientsModule, StorageModule],
  controllers: [
    ClientProgressController,
    ProgressController,
    ProgressPhotoUrlController,
    MeProgressController,
  ],
  providers: [ProgressService, ProgressPhotosService, ExerciseHistoryService],
})
export class ProgressModule {}
