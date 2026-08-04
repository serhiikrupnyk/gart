import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CHAT_ATTACHMENT_LABELS,
  MESSAGE_PREVIEW_LENGTH,
  MESSAGES_PER_PAGE,
  type ChatHistory,
  type ChatMessage,
  type ChatRole,
  type ChatThreadSummary,
} from '@gart/shared';

import { ClientsService } from '../clients/clients.service';
import { PrismaService } from '../database/prisma.service';
import type {
  ChatAttachmentModel,
  ChatMessageModel,
  ChatThreadModel,
} from '../generated/prisma/models.js';
import { NotificationService } from '../notifications/notification.service';
import type { VerifiedAttachment } from './chat-attachments.service';
import { ChatStream } from './chat-stream.service';
import type { HistoryQuery, SendChatMessageDto } from './dto/chat.dto';

const EMPTY_MESSAGE = 'Повідомлення не може бути порожнім';

/** The message as it is read back: prescription-free, metadata only. */
type MessageWithAttachment = ChatMessageModel & { attachment: ChatAttachmentModel | null };

/**
 * Which side the caller is, and what pins their access. A trainer participates
 * in every thread of their tenant; a client in exactly one. Making that a
 * union rather than an optional field means «a trainer with no client id»
 * cannot be written as an empty string and quietly match nothing.
 */
export type ChatParticipant =
  { role: 'TRAINER'; trainerId: string } | { role: 'CLIENT'; trainerId: string; clientId: string };

/**
 * One conversation per (trainer, client).
 *
 * Every read and write is scoped by BOTH ids — the Step 16 rule — so a sibling
 * client of the same trainer is as far from a thread as a stranger, and a
 * non-participant's request is a bare 404 identical to a nonexistent thread.
 *
 * Persistence is the contract; live delivery is an enhancement published after
 * the row is safely written.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
    private readonly stream: ChatStream,
    private readonly notifications: NotificationService,
  ) {}

  /** Idempotent: the conversation with someone either exists or begins now. */
  async openThread(trainerId: string, clientId: string): Promise<ChatThreadSummary> {
    const client = await this.clients.requireOwned(trainerId, clientId);

    const thread = await this.prisma.chatThread.upsert({
      where: { trainerId_clientId: { trainerId, clientId: client.id } },
      create: { trainerId, clientId: client.id },
      update: {},
    });

    return this.summarise(thread, 'TRAINER', client.fullName);
  }

  /** The client's single conversation with their trainer. */
  async myThread(trainerId: string, clientId: string): Promise<ChatThreadSummary> {
    const [thread, trainer] = await Promise.all([
      this.prisma.chatThread.upsert({
        where: { trainerId_clientId: { trainerId, clientId } },
        create: { trainerId, clientId },
        update: {},
      }),
      this.prisma.trainer.findUnique({
        where: { id: trainerId },
        select: { displayName: true, brandName: true },
      }),
    ]);

    return this.summarise(thread, 'CLIENT', trainer?.brandName ?? trainer?.displayName ?? 'Тренер');
  }

  async listThreads(trainerId: string): Promise<ChatThreadSummary[]> {
    const threads = await this.prisma.chatThread.findMany({
      where: { trainerId },
      // Nulls last, explicitly: Postgres puts them first on a DESC sort, which
      // would float never-used conversations above active ones.
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: { client: { select: { fullName: true } } },
    });

    return Promise.all(
      threads.map((thread) => this.summarise(thread, 'TRAINER', thread.client.fullName)),
    );
  }

  async history(
    participant: ChatParticipant,
    threadId: string,
    query: HistoryQuery,
  ): Promise<ChatHistory> {
    const thread = await this.requireParticipant(participant, threadId);

    // Keyset pagination on (createdAt, id) rather than on the id alone: two
    // messages can share a timestamp, and the cursor must order exactly the
    // way the query does or a page can skip or repeat a message.
    const cursor =
      query.before === undefined
        ? null
        : await this.prisma.chatMessage.findFirst({
            where: { id: query.before, threadId: thread.id },
            select: { id: true, createdAt: true },
          });

    // One extra row tells us whether there is another page without a count.
    const page = await this.prisma.chatMessage.findMany({
      where: {
        threadId: thread.id,
        ...(cursor === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MESSAGES_PER_PAGE + 1,
      include: { attachment: true },
    });

    const hasMore = page.length > MESSAGES_PER_PAGE;
    const messages = hasMore ? page.slice(0, MESSAGES_PER_PAGE) : page;

    return {
      threadId: thread.id,
      // Oldest first: a conversation reads downward.
      messages: [...messages].reverse().map(toPublicMessage),
      nextBefore: hasMore ? (messages[messages.length - 1]?.id ?? null) : null,
      unreadCount: await this.unreadCount(thread, participant.role),
    };
  }

  async send(
    participant: ChatParticipant,
    threadId: string,
    dto: SendChatMessageDto,
    attachment?: VerifiedAttachment,
  ): Promise<ChatMessage> {
    const thread = await this.requireParticipant(participant, threadId);
    const body = dto.body ?? '';

    // A message is text, media, or both — never neither. One rule, in the one
    // place that can see the whole message.
    if (body === '' && attachment === undefined) {
      throw new BadRequestException(EMPTY_MESSAGE);
    }

    const now = new Date();

    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: {
          threadId: thread.id,
          senderRole: participant.role,
          body,
          ...(attachment === undefined
            ? {}
            : {
                attachment: {
                  create: {
                    kind: attachment.kind,
                    storageKey: attachment.storageKey,
                    contentType: attachment.contentType,
                    sizeBytes: attachment.sizeBytes,
                    durationSeconds: dto.attachment?.durationSeconds ?? null,
                  },
                },
              }),
        },
        include: { attachment: true },
      }),
      this.prisma.chatThread.update({
        where: { id: thread.id },
        data: {
          lastMessageAt: now,
          // Sending is reading: nobody has unread messages in a thread they
          // are actively typing into.
          ...(participant.role === 'TRAINER'
            ? { trainerLastReadAt: now }
            : { clientLastReadAt: now }),
        },
      }),
    ]);

    const published = toPublicMessage(message);

    this.stream.publish({ threadId: thread.id, message: published });
    await this.announce(thread, participant.role, previewOf(published));

    return published;
  }

  async markRead(participant: ChatParticipant, threadId: string): Promise<void> {
    const thread = await this.requireParticipant(participant, threadId);

    await this.prisma.chatThread.update({
      where: { id: thread.id },
      data:
        participant.role === 'TRAINER'
          ? { trainerLastReadAt: new Date() }
          : { clientLastReadAt: new Date() },
    });
  }

  /**
   * The single gate. Both ids, always — a thread that is not the caller's own
   * conversation answers exactly like one that does not exist.
   */
  async requireParticipant(
    participant: ChatParticipant,
    threadId: string,
  ): Promise<ChatThreadModel> {
    const thread = await this.prisma.chatThread.findFirst({
      where: {
        id: threadId,
        trainerId: participant.trainerId,
        // A client is pinned to their own conversation; a trainer's tenant
        // already pins theirs.
        ...(participant.role === 'CLIENT' ? { clientId: participant.clientId } : {}),
      },
    });

    if (thread === null) {
      throw new NotFoundException();
    }

    return thread;
  }

  /**
   * Notify the other side unless they are watching this very thread. Because
   * streams are per thread, that is a fact rather than a heuristic — no
   * timers, no last-seen guessing.
   */
  private async announce(
    thread: ChatThreadModel,
    senderRole: ChatRole,
    preview: string,
  ): Promise<void> {
    const recipientRole: ChatRole = senderRole === 'TRAINER' ? 'CLIENT' : 'TRAINER';

    if (this.stream.isWatching(thread.id, recipientRole)) {
      return;
    }

    if (recipientRole === 'TRAINER') {
      await this.notifications.notifyTrainer({
        trainerId: thread.trainerId,
        clientId: thread.clientId,
        type: 'CHAT_MESSAGE',
        detail: preview,
      });

      return;
    }

    await this.notifications.notifyClient({
      trainerId: thread.trainerId,
      clientId: thread.clientId,
      type: 'CHAT_MESSAGE',
      title: 'Повідомлення від тренера',
      body: preview,
    });
  }

  private async summarise(
    thread: ChatThreadModel,
    role: ChatRole,
    title: string,
  ): Promise<ChatThreadSummary> {
    return {
      id: thread.id,
      clientId: thread.clientId,
      title,
      lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
      unreadCount: await this.unreadCount(thread, role),
    };
  }

  /** Unread = after my last read, and not mine. */
  private async unreadCount(thread: ChatThreadModel, role: ChatRole): Promise<number> {
    const lastReadAt = role === 'TRAINER' ? thread.trainerLastReadAt : thread.clientLastReadAt;

    return this.prisma.chatMessage.count({
      where: {
        threadId: thread.id,
        senderRole: role === 'TRAINER' ? 'CLIENT' : 'TRAINER',
        ...(lastReadAt === null ? {} : { createdAt: { gt: lastReadAt } }),
      },
    });
  }
}

function toPublicMessage(message: MessageWithAttachment): ChatMessage {
  return {
    id: message.id,
    senderRole: message.senderRole,
    body: message.body,
    // Metadata only: play URLs are minted per view, and the storage key never
    // crosses the wire.
    attachment:
      message.attachment === null
        ? null
        : {
            id: message.attachment.id,
            kind: message.attachment.kind,
            contentType: message.attachment.contentType,
            sizeBytes: message.attachment.sizeBytes,
            durationSeconds: message.attachment.durationSeconds,
          },
    createdAt: message.createdAt.toISOString(),
  };
}

/** What a notification says when the message is media rather than words. */
function previewOf(message: ChatMessage): string {
  if (message.body === '') {
    return message.attachment === null ? '' : CHAT_ATTACHMENT_LABELS[message.attachment.kind];
  }

  return message.body.length > MESSAGE_PREVIEW_LENGTH
    ? `${message.body.slice(0, MESSAGE_PREVIEW_LENGTH)}…`
    : message.body;
}
