import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { ChatHistory, ChatMessage, ChatStreamEvent, ChatThreadSummary } from '@gart/shared';
import { type Observable, map } from 'rxjs';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { ChatThrottlerGuard } from '../auth/chat-throttler.guard';
import { type ClientAuthContext, CurrentClientAuth } from '../auth/client-auth-context';
import { ClientGuard } from '../auth/client.guard';
import { TrainerGuard } from '../auth/trainer.guard';
import {
  CurrentViewerTenant,
  TrainerOrClientGuard,
  type ViewerTenant,
} from '../auth/trainer-or-client.guard';
import { ChatService, type ChatParticipant } from './chat.service';
import { ChatStream } from './chat-stream.service';
import { HistoryQuery, OpenThreadDto, SendChatMessageDto } from './dto/chat.dto';

/** Opening a conversation differs per hat; everything after it does not. */
@Controller('chat')
@UseGuards(TrainerGuard)
export class TrainerChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('threads')
  async listThreads(@CurrentAuth() auth: AuthContext): Promise<ChatThreadSummary[]> {
    return this.chat.listThreads(auth.trainer.id);
  }

  @Post('threads')
  async openThread(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: OpenThreadDto,
  ): Promise<ChatThreadSummary> {
    return this.chat.openThread(auth.trainer.id, dto.clientId);
  }
}

@Controller('chat')
@UseGuards(ClientGuard)
export class ClientChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('thread')
  async myThread(@CurrentClientAuth() auth: ClientAuthContext): Promise<ChatThreadSummary> {
    return this.chat.myThread(auth.trainer.id, auth.client.id);
  }
}

/**
 * The conversation itself, shared by both hats — including the live stream,
 * which is an ordinary guarded GET. That is the point of choosing SSE: the
 * real-time surface authenticates through the same session, the same guard and
 * the same uniform 401 as everything else, with no second scheme to get wrong.
 */
@Controller('chat/threads/:id')
@UseGuards(TrainerOrClientGuard)
export class ChatThreadController {
  constructor(
    private readonly chat: ChatService,
    private readonly chatStream: ChatStream,
  ) {}

  @Get('messages')
  async history(
    @CurrentViewerTenant() viewer: ViewerTenant,
    @Param('id') id: string,
    @Query() query: HistoryQuery,
  ): Promise<ChatHistory> {
    return this.chat.history(participantOf(viewer), id, query);
  }

  @Post('messages')
  @UseGuards(ChatThrottlerGuard)
  async send(
    @CurrentViewerTenant() viewer: ViewerTenant,
    @Param('id') id: string,
    @Body() dto: SendChatMessageDto,
  ): Promise<ChatMessage> {
    return this.chat.send(participantOf(viewer), id, dto);
  }

  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(
    @CurrentViewerTenant() viewer: ViewerTenant,
    @Param('id') id: string,
  ): Promise<void> {
    await this.chat.markRead(participantOf(viewer), id);
  }

  /**
   * Live delivery. Participation is proved before a single event flows, and
   * the subscription is filtered to this thread — a listener cannot be handed
   * another conversation's message even by mistake.
   */
  @Sse('stream')
  async stream(
    @CurrentViewerTenant() viewer: ViewerTenant,
    @Param('id') id: string,
  ): Promise<Observable<{ data: ChatStreamEvent }>> {
    const participant = participantOf(viewer);

    await this.chat.requireParticipant(participant, id);

    return this.chatStream.subscribe(id, participant.role).pipe(map((event) => ({ data: event })));
  }
}

/**
 * Which side of the conversation the caller is. A client session carries a
 * clientId; a trainer session does not — the same discriminator the
 * notification audience uses.
 */
function participantOf(viewer: ViewerTenant): ChatParticipant {
  return viewer.clientId === undefined
    ? { role: 'TRAINER', trainerId: viewer.trainerId }
    : { role: 'CLIENT', trainerId: viewer.trainerId, clientId: viewer.clientId };
}
