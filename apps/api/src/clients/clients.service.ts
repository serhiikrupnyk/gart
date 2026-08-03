import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ClientListItem, ClientWithInvite, PublicClient } from '@gart/shared';

import { PrismaService } from '../database/prisma.service';
import type { ClientModel } from '../generated/prisma/models.js';
import { InvitesService } from '../invites/invites.service';
import { ClientActivityService } from '../monitoring/client-activity.service';
import { toPublicClient } from './client.mapper';
import type { CreateClientDto } from './dto/create-client.dto';
import type { ListClientsQuery } from './dto/list-clients.query';
import type { UpdateClientDto } from './dto/update-client.dto';

const EMAIL_ACTIVE_MESSAGE = 'Клієнт із цим email вже є у вашому списку';
const EMAIL_ARCHIVED_MESSAGE = 'Клієнт із цим email є у вашому архіві — відновіть його';
const ALREADY_ACCEPTED_MESSAGE = 'Клієнт уже прийняв запрошення';
const CANNOT_ACTIVATE_MESSAGE = 'Клієнт ще не прийняв запрошення';

const UNIQUE_CONSTRAINT_ERROR = 'P2002';

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_CONSTRAINT_ERROR
  );
}

/**
 * Every method takes `trainerId` first, and there is no overload that omits it —
 * the type system, not diligence, is what keeps one tenant out of another's data.
 * The controller's only source for that value is the TrainerGuard.
 */
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invites: InvitesService,
    private readonly activity: ClientActivityService,
  ) {}

  async create(trainerId: string, dto: CreateClientDto): Promise<ClientWithInvite> {
    await this.assertEmailAvailable(trainerId, dto.email);

    const { client, inviteUrl } = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.client.create({
          data: { trainerId, fullName: dto.fullName, email: dto.email, status: 'INVITED' },
        });

        // Same transaction: a client is never left without the invite that is
        // the only way to reach them.
        const url = await this.invites.issue(tx, trainerId, created.id);

        return { client: created, inviteUrl: url };
      })
      .catch((error: unknown) => {
        // The check above races with a concurrent create; the unique index is
        // what actually guarantees it.
        if (isUniqueConstraintError(error)) {
          throw new ConflictException(EMAIL_ACTIVE_MESSAGE);
        }
        throw error;
      });

    return { client: toPublicClient(client), inviteUrl };
  }

  /**
   * The list carries just enough pulse to triage by — who logged last, and who
   * is worth opening. Computed for the whole page in a couple of queries, never
   * per row.
   */
  async list(trainerId: string, query: ListClientsQuery): Promise<ClientListItem[]> {
    const clients = await this.prisma.client.findMany({
      where: { trainerId, ...(query.status === undefined ? {} : { status: query.status }) },
      orderBy: { createdAt: 'desc' },
    });

    // Only clients being coached right now can need attention: the invited have
    // no plans yet, and the archived are no longer anyone's concern.
    const activity = await this.activity.forClients(
      trainerId,
      clients.filter((client) => client.status === 'ACTIVE').map((client) => client.id),
    );

    return clients.map((client) => ({
      ...toPublicClient(client),
      lastLoggedAt: activity.get(client.id)?.lastLoggedAt ?? null,
      attention: activity.get(client.id)?.attention ?? null,
    }));
  }

  async findOne(trainerId: string, clientId: string): Promise<PublicClient> {
    return toPublicClient(await this.requireOwned(trainerId, clientId));
  }

  async update(trainerId: string, clientId: string, dto: UpdateClientDto): Promise<PublicClient> {
    const client = await this.requireOwned(trainerId, clientId);

    // ACTIVE means "has an account", which only accepting an invite can produce.
    // Without this the trainer could assert a state the data does not support.
    if (dto.status === 'ACTIVE' && client.userId === null) {
      throw new BadRequestException(CANNOT_ACTIVATE_MESSAGE);
    }

    const updated = await this.prisma.client.update({
      where: { id: client.id },
      data: {
        ...(dto.fullName === undefined ? {} : { fullName: dto.fullName }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
      },
    });

    return toPublicClient(updated);
  }

  async regenerateInvite(trainerId: string, clientId: string): Promise<ClientWithInvite> {
    const client = await this.requireOwned(trainerId, clientId);

    if (client.userId !== null) {
      throw new ConflictException(ALREADY_ACCEPTED_MESSAGE);
    }

    const inviteUrl = await this.invites.issue(this.prisma, trainerId, client.id);

    return { client: toPublicClient(client), inviteUrl };
  }

  /**
   * The single gate for reaching one client.
   *
   * `findFirst` with both ids rather than `findUnique` by id plus a check: there
   * is no intermediate state in which the row has been fetched but not yet
   * verified, so no later edit can accidentally drop the check. A miss raises
   * 404 rather than 403, since 403 would confirm the row exists.
   * Public because assignments reuse it — one ownership model, not two.
   */
  async requireOwned(trainerId: string, clientId: string): Promise<ClientModel> {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, trainerId } });

    if (client === null) {
      throw new NotFoundException();
    }

    return client;
  }

  private async assertEmailAvailable(trainerId: string, email: string): Promise<void> {
    const existing = await this.prisma.client.findFirst({ where: { trainerId, email } });

    if (existing === null) {
      return;
    }

    throw new ConflictException(
      existing.status === 'ARCHIVED' ? EMAIL_ARCHIVED_MESSAGE : EMAIL_ACTIVE_MESSAGE,
    );
  }
}
