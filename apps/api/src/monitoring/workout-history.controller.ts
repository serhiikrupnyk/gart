import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import type { ClientWorkoutHistory } from '@gart/shared';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { TrainerGuard } from '../auth/trainer.guard';
import { HistoryQuery } from './dto/history.query';
import { WorkoutHistoryService } from './workout-history.service';

@Controller('clients/:clientId/workout-history')
@UseGuards(TrainerGuard)
export class WorkoutHistoryController {
  constructor(private readonly history: WorkoutHistoryService) {}

  @Get()
  async forClient(
    @CurrentAuth() auth: AuthContext,
    @Param('clientId') clientId: string,
    @Query() query: HistoryQuery,
  ): Promise<ClientWorkoutHistory> {
    return this.history.forClient(auth.trainer.id, clientId, query);
  }
}
