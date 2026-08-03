import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { ClientWorkoutLog } from '@gart/shared';

import { type ClientAuthContext, CurrentClientAuth } from '../auth/client-auth-context';
import { ClientGuard } from '../auth/client.guard';
import { LogParamsDto, LogWorkoutExerciseDto } from './dto/log-workout.dto';
import { WorkoutLogsService } from './workout-logs.service';

/**
 * A log is addressed by (snapshot exercise, date) — so that pair is the URI and
 * the write is a PUT: idempotent by construction, safe to retry on gym wifi.
 */
@Controller('me/assignment-exercises/:id/logs')
@UseGuards(ClientGuard)
export class WorkoutLogsController {
  constructor(private readonly logs: WorkoutLogsService) {}

  @Put(':date')
  async save(
    @CurrentClientAuth() auth: ClientAuthContext,
    @Param() params: LogParamsDto,
    @Body() dto: LogWorkoutExerciseDto,
  ): Promise<ClientWorkoutLog> {
    return this.logs.save(auth.trainer.id, auth.client.id, params.id, params.date, dto);
  }

  @Delete(':date')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentClientAuth() auth: ClientAuthContext,
    @Param() params: LogParamsDto,
  ): Promise<void> {
    await this.logs.remove(auth.trainer.id, auth.client.id, params.id, params.date);
  }
}
