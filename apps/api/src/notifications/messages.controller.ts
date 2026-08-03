import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { MESSAGE_MAX_LENGTH } from '@gart/shared';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { TrainerGuard } from '../auth/trainer.guard';
import { TrainerThrottlerGuard } from '../auth/trainer-throttler.guard';
import { ClientsService } from '../clients/clients.service';
import { SendMessageDto } from './dto/message.dto';
import { NotificationService } from './notification.service';

const MESSAGE_TITLE = 'Повідомлення від тренера';

/**
 * A trainer writing to one of their own clients. Guard order matters: the
 * tenant is attached first, so the rate limit that follows can count per
 * trainer rather than per address.
 *
 * Broadcasting to every client is deliberately not here — audience selection,
 * per-client wording and a delivery report make that a feature of its own
 * rather than a variation on this one.
 */
@Controller('clients/:clientId/messages')
@UseGuards(TrainerGuard, TrainerThrottlerGuard)
export class MessagesController {
  constructor(
    private readonly clients: ClientsService,
    private readonly notifications: NotificationService,
  ) {}

  @Post()
  async send(
    @CurrentAuth() auth: AuthContext,
    @Param('clientId') clientId: string,
    @Body() dto: SendMessageDto,
  ): Promise<{ sent: true }> {
    // The established gate: another trainer's client answers exactly like one
    // that does not exist.
    const client = await this.clients.requireOwned(auth.trainer.id, clientId);

    // Plain text all the way down: React escapes it in the panel and the
    // service worker hands it to showNotification as a string, so there is
    // nowhere for markup to be interpreted.
    await this.notifications.notifyClient({
      trainerId: auth.trainer.id,
      clientId: client.id,
      type: 'TRAINER_MESSAGE',
      title: MESSAGE_TITLE,
      body: dto.text.slice(0, MESSAGE_MAX_LENGTH),
    });

    return { sent: true };
  }
}
