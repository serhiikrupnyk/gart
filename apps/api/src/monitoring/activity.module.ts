import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { ClientActivityService } from './client-activity.service';

/**
 * Kept separate from MonitoringModule so the clients list can use it without a
 * circular import: monitoring depends on ClientsService for its ownership gate,
 * and the clients list depends on this.
 */
@Module({
  imports: [DatabaseModule],
  providers: [ClientActivityService],
  exports: [ClientActivityService],
})
export class ActivityModule {}
