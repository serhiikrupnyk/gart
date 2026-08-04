import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClientsModule } from '../clients/clients.module';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { ChatAttachmentsService } from './chat-attachments.service';
import { ChatStream } from './chat-stream.service';
import {
  ChatAttachmentController,
  ChatThreadController,
  ClientChatController,
  TrainerChatController,
} from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [DatabaseModule, AuthModule, ClientsModule, NotificationsModule, StorageModule],
  controllers: [
    TrainerChatController,
    ClientChatController,
    ChatThreadController,
    ChatAttachmentController,
  ],
  providers: [ChatService, ChatStream, ChatAttachmentsService],
})
export class ChatModule {}
