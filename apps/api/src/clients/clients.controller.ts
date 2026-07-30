import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { ClientWithInvite, PublicClient } from '@gart/shared';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { TrainerGuard } from '../auth/trainer.guard';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientsQuery } from './dto/list-clients.query';
import { UpdateClientDto } from './dto/update-client.dto';

/**
 * Every route is behind TrainerGuard and passes `auth.trainer.id` into the service.
 * The tenant is never read from the path, the body or a query parameter — only
 * from the authenticated session.
 */
@Controller('clients')
@UseGuards(TrainerGuard)
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateClientDto,
  ): Promise<ClientWithInvite> {
    return this.clients.create(auth.trainer.id, dto);
  }

  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: ListClientsQuery,
  ): Promise<PublicClient[]> {
    return this.clients.list(auth.trainer.id, query);
  }

  @Get(':id')
  async findOne(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<PublicClient> {
    return this.clients.findOne(auth.trainer.id, id);
  }

  @Patch(':id')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ): Promise<PublicClient> {
    return this.clients.update(auth.trainer.id, id, dto);
  }

  @Post(':id/invite')
  async regenerateInvite(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ): Promise<ClientWithInvite> {
    return this.clients.regenerateInvite(auth.trainer.id, id);
  }
}
