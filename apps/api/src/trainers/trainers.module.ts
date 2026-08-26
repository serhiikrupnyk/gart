import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { BrandController, BrandLogoController } from './brand.controller';
import { BrandService } from './brand.service';

@Module({
  imports: [DatabaseModule, AuthModule, StorageModule],
  controllers: [BrandController, BrandLogoController],
  providers: [BrandService],
})
export class TrainersModule {}
