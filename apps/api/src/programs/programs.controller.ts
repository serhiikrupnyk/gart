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
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ProgramPage, PublicProgramDetail } from '@gart/shared';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { TrainerGuard } from '../auth/trainer.guard';
import { CreateProgramDto, ListProgramsQuery, UpdateProgramDto } from './dto/create-program.dto';
import { ProgramsService } from './programs.service';

/** The tenant comes from the session, never from the request — as everywhere. */
@Controller('programs')
@UseGuards(TrainerGuard)
export class ProgramsController {
  constructor(private readonly programs: ProgramsService) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: ListProgramsQuery,
  ): Promise<ProgramPage> {
    return this.programs.list(auth.trainer.id, query);
  }

  @Get(':id')
  async findOne(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<PublicProgramDetail> {
    return this.programs.findOne(auth.trainer.id, id);
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateProgramDto,
  ): Promise<PublicProgramDetail> {
    return this.programs.create(auth.trainer.id, dto);
  }

  @Patch(':id')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateProgramDto,
  ): Promise<PublicProgramDetail> {
    return this.programs.update(auth.trainer.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<void> {
    await this.programs.remove(auth.trainer.id, id);
  }
}
