import { randomBytes } from 'node:crypto';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ChatAttachmentKind, MediaUrlResponse, PresignMediaResponse } from '@gart/shared';

import { CHAT_SIZE_LIMITS, CHAT_TYPE_RULES, MAGIC_BYTES_LENGTH } from '../exercises/media-types';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { ChatParticipant } from './chat.service';
import type { PresignChatAttachmentDto } from './dto/chat.dto';

const UNSUPPORTED_TYPE_MESSAGE = 'Непідтримуваний тип файлу';
const TOO_LARGE_MESSAGE = 'Файл завеликий';
/** One body for every verification failure — nothing about storage leaks. */
const UPLOAD_INVALID_MESSAGE = 'Завантаження не вдалося перевірити';

export interface VerifiedAttachment {
  kind: ChatAttachmentKind;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * Chat media on the exact path exercise media and progress photos already use:
 * a presigned direct PUT whose key, type and byte count are all part of the
 * signature; verification of what actually landed before any row exists; and a
 * short-lived presigned GET minted per view.
 *
 * What is specific here is the scope: only a participant can obtain an upload
 * URL against their conversation, and only the two of them can ever fetch what
 * was uploaded to it.
 */
@Injectable()
export class ChatAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** `threadId` has already been proved to belong to the caller. */
  async presign(threadId: string, dto: PresignChatAttachmentDto): Promise<PresignMediaResponse> {
    const rule = CHAT_TYPE_RULES[dto.kind][dto.contentType];

    if (rule === undefined) {
      throw new BadRequestException(UNSUPPORTED_TYPE_MESSAGE);
    }
    if (dto.sizeBytes > CHAT_SIZE_LIMITS[dto.kind]) {
      throw new BadRequestException(TOO_LARGE_MESSAGE);
    }

    // Server-generated, random, bound to this conversation: no user filename
    // ever becomes a key, and the prefix is what send later checks against.
    const key = `${keyPrefix(threadId)}${randomBytes(16).toString('base64url')}.${rule.extension}`;

    const { url, expiresAt } = await this.storage.presignPut(key, dto.contentType, dto.sizeBytes);

    return { uploadUrl: url, key, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Everything the message write needs to trust the upload. Verification
   * happens BEFORE the row exists, and a failure removes the object rather
   * than leaving storage to be paid for.
   */
  async verify(
    threadId: string,
    key: string,
    kind: ChatAttachmentKind,
  ): Promise<VerifiedAttachment> {
    if (!key.startsWith(keyPrefix(threadId))) {
      throw new BadRequestException(UPLOAD_INVALID_MESSAGE);
    }

    const stored = await this.storage.head(key);

    if (stored === null) {
      throw new BadRequestException(UPLOAD_INVALID_MESSAGE);
    }

    const rule = CHAT_TYPE_RULES[kind][stored.contentType];
    const withinLimit = stored.sizeBytes > 0 && stored.sizeBytes <= CHAT_SIZE_LIMITS[kind];
    const leadingBytes =
      rule === undefined ? null : await this.storage.readHead(key, MAGIC_BYTES_LENGTH);
    const magicOk = leadingBytes !== null && rule !== undefined && rule.matchesMagic(leadingBytes);

    if (rule === undefined || !withinLimit || !magicOk) {
      await this.storage.delete(key);
      throw new BadRequestException(UPLOAD_INVALID_MESSAGE);
    }

    return {
      kind,
      storageKey: key,
      contentType: stored.contentType,
      sizeBytes: stored.sizeBytes,
    };
  }

  /** Minted per view, for the two people in the conversation and nobody else. */
  async getUrl(participant: ChatParticipant, attachmentId: string): Promise<MediaUrlResponse> {
    const attachment = await this.prisma.chatAttachment.findFirst({
      where: {
        id: attachmentId,
        message: {
          thread: {
            trainerId: participant.trainerId,
            ...(participant.role === 'CLIENT' ? { clientId: participant.clientId } : {}),
          },
        },
      },
    });

    if (attachment === null) {
      throw new NotFoundException();
    }

    const { url, expiresAt } = await this.storage.presignGet(attachment.storageKey);

    return { url, expiresAt: expiresAt.toISOString() };
  }
}

function keyPrefix(threadId: string): string {
  return `chat/${threadId}/`;
}
