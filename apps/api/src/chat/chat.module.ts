import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClientsModule } from '../clients/clients.module';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatStream } from './chat-stream.service';
import {
  ChatThreadController,
  ClientChatController,
  TrainerChatController,
} from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [DatabaseModule, AuthModule, ClientsModule, NotificationsModule],
  controllers: [TrainerChatController, ClientChatController, ChatThreadController],
  providers: [ChatService, ChatStream],
})
export class ChatModule {}
