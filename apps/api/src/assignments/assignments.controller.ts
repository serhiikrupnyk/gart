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
  UseGuards,
} from '@nestjs/common';
import type { PublicAssignment, PublicAssignmentDetail } from '@gart/shared';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { TrainerGuard } from '../auth/trainer.guard';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto, UpdateAssignmentDto } from './dto/assignment.dto';

/** Per-client routes: create + list live under the client they belong to. */
@Controller('clients/:clientId/assignments')
@UseGuards(TrainerGuard)
export class ClientAssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Param('clientId') clientId: string,
    @Body() dto: CreateAssignmentDto,
  ): Promise<PublicAssignmentDetail> {
    return this.assignments.create(auth.trainer.id, clientId, dto);
  }

  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Param('clientId') clientId: string,
  ): Promise<PublicAssignment[]> {
    return this.assignments.listForClient(auth.trainer.id, clientId);
  }
}

@Controller('assignments')
@UseGuards(TrainerGuard)
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get(':id')
  async findOne(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<PublicAssignmentDetail> {
    return this.assignments.findOne(auth.trainer.id, id);
  }

  @Patch(':id')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentDto,
  ): Promise<PublicAssignmentDetail> {
    return this.assignments.update(auth.trainer.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<void> {
    await this.assignments.remove(auth.trainer.id, id);
  }
}
