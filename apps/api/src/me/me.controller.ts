import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import type { ClientAssignment, ClientWorkout, ClientWorkoutDay } from '@gart/shared';

import { type ClientAuthContext, CurrentClientAuth } from '../auth/client-auth-context';
import { ClientGuard } from '../auth/client.guard';
import { ClientWorkoutsService } from './client-workouts.service';
import { WorkoutsQueryDto } from './dto/workouts-query.dto';

/**
 * The client's own view — no ids in the path prefix because the tenant scope
 * IS the session: ClientGuard resolves the client and their trainer, and every
 * read below is pinned to that pair.
 */
@Controller('me')
@UseGuards(ClientGuard)
export class MeController {
  constructor(private readonly workouts: ClientWorkoutsService) {}

  @Get('workouts')
  async workoutsForDate(
    @CurrentClientAuth() auth: ClientAuthContext,
    @Query() query: WorkoutsQueryDto,
  ): Promise<ClientWorkoutDay> {
    return this.workouts.workoutsForDate(auth.trainer.id, auth.client.id, query.date);
  }

  @Get('assignments')
  async listAssignments(@CurrentClientAuth() auth: ClientAuthContext): Promise<ClientAssignment[]> {
    return this.workouts.listAssignments(auth.trainer.id, auth.client.id);
  }

  @Get('assignments/:id')
  async findAssignment(
    @CurrentClientAuth() auth: ClientAuthContext,
    @Param('id') id: string,
  ): Promise<ClientWorkout> {
    return this.workouts.findAssignment(auth.trainer.id, auth.client.id, id);
  }
}
