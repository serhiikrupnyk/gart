import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { HabitDay, HabitsView, PublicHabit } from '@gart/shared';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { type ClientAuthContext, CurrentClientAuth } from '../auth/client-auth-context';
import { ClientGuard } from '../auth/client.guard';
import { TrainerGuard } from '../auth/trainer.guard';
import {
  CreateHabitDto,
  HabitLogParamsDto,
  HabitsQuery,
  LogHabitDto,
  UpdateHabitDto,
} from './dto/habit.dto';
import { HabitsService } from './habits.service';

@Controller('clients/:clientId/habits')
@UseGuards(TrainerGuard)
export class ClientHabitsController {
  constructor(private readonly habits: HabitsService) {}

  @Get()
  async forClient(
    @CurrentAuth() auth: AuthContext,
    @Param('clientId') clientId: string,
    @Query() query: HabitsQuery,
  ): Promise<HabitsView> {
    return this.habits.forClient(auth.trainer.id, clientId, query);
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Param('clientId') clientId: string,
    @Body() dto: CreateHabitDto,
  ): Promise<PublicHabit> {
    return this.habits.create(auth.trainer.id, clientId, dto);
  }
}

@Controller('habits')
@UseGuards(TrainerGuard)
export class HabitsController {
  constructor(private readonly habits: HabitsService) {}

  @Patch(':id')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateHabitDto,
  ): Promise<PublicHabit> {
    return this.habits.update(auth.trainer.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<void> {
    await this.habits.remove(auth.trainer.id, id);
  }
}

/** The client's own habits — the only place a day can be recorded. */
@Controller('me/habits')
@UseGuards(ClientGuard)
export class MeHabitsController {
  constructor(private readonly habits: HabitsService) {}

  @Get()
  async mine(
    @CurrentClientAuth() auth: ClientAuthContext,
    @Query() query: HabitsQuery,
  ): Promise<HabitsView> {
    return this.habits.buildView(auth.trainer.id, auth.client.id, query);
  }

  @Put(':id/logs/:date')
  async log(
    @CurrentClientAuth() auth: ClientAuthContext,
    @Param() params: HabitLogParamsDto,
    @Body() dto: LogHabitDto,
  ): Promise<HabitDay> {
    return this.habits.log(auth.trainer.id, auth.client.id, params.id, params.date, dto);
  }

  @Delete(':id/logs/:date')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeLog(
    @CurrentClientAuth() auth: ClientAuthContext,
    @Param() params: HabitLogParamsDto,
  ): Promise<void> {
    await this.habits.removeLog(auth.trainer.id, auth.client.id, params.id, params.date);
  }
}
