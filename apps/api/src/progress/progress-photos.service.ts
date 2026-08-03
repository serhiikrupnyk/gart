import { randomBytes } from 'node:crypto';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MediaUrlResponse, PresignMediaResponse, ProgressPhotoInfo } from '@gart/shared';

import { ClientsService } from '../clients/clients.service';
import { parseIsoDate } from '../common/calendar';
import { PrismaService } from '../database/prisma.service';
import { IMAGE_SIZE_LIMIT, IMAGE_TYPE_RULES, MAGIC_BYTES_LENGTH } from '../exercises/media-types';
import { StorageService } from '../storage/storage.service';
import type { FinalizeProgressPhotoDto, PresignProgressPhotoDto } from './dto/progress.dto';
import { toProgressPhotoInfo } from './progress.mapper';

const UNSUPPORTED_TYPE_MESSAGE = 'Непідтримуваний тип файлу';
const TOO_LARGE_MESSAGE = 'Файл завеликий';
/** One body for every finalize failure — nothing about storage internals leaks. */
const UPLOAD_INVALID_MESSAGE = 'Завантаження не вдалося перевірити';

/**
 * Progress photos on the exact path exercise media already uses: presign a
 * signed PUT whose key, content type and byte count are all part of the
 * signature; the browser uploads straight to storage; finalize verifies what
 * actually landed (existence, size, stored type, magic numbers) before
 * anything is recorded, and deletes the object when verification fails.
 *
 * These are more sensitive than exercise clips, which is the argument FOR
 * reusing this path rather than writing a second one: private bucket, no
 * public URL, and viewing mints a short-lived presigned GET per request for
 * the owning trainer or that client alone.
 */
@Injectable()
export class ProgressPhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
    private readonly storage: StorageService,
  ) {}

  async presign(
    trainerId: string,
    clientId: string,
    dto: PresignProgressPhotoDto,
  ): Promise<PresignMediaResponse> {
    const client = await this.clients.requireOwned(trainerId, clientId);

    const rule = IMAGE_TYPE_RULES[dto.contentType];

    if (rule === undefined) {
      throw new BadRequestException(UNSUPPORTED_TYPE_MESSAGE);
    }
    if (dto.sizeBytes > IMAGE_SIZE_LIMIT) {
      throw new BadRequestException(TOO_LARGE_MESSAGE);
    }

    // Server-generated, random, prefix-bound: no user filename ever becomes a
    // key, and the prefix is what finalize later checks the echoed key against.
    const key = `${keyPrefix(client.id)}${randomBytes(16).toString('base64url')}.${rule.extension}`;

    const { url, expiresAt } = await this.storage.presignPut(key, dto.contentType, dto.sizeBytes);

    return { uploadUrl: url, key, expiresAt: expiresAt.toISOString() };
  }

  async finalize(
    trainerId: string,
    clientId: string,
    dto: FinalizeProgressPhotoDto,
  ): Promise<ProgressPhotoInfo> {
    const client = await this.clients.requireOwned(trainerId, clientId);
    const date = parseIsoDate(dto.date);

    if (!dto.key.startsWith(keyPrefix(client.id))) {
      throw new BadRequestException(UPLOAD_INVALID_MESSAGE);
    }

    const stored = await this.storage.head(dto.key);

    if (stored === null) {
      throw new BadRequestException(UPLOAD_INVALID_MESSAGE);
    }

    const rule = IMAGE_TYPE_RULES[stored.contentType];
    const withinLimit = stored.sizeBytes > 0 && stored.sizeBytes <= IMAGE_SIZE_LIMIT;
    const leadingBytes =
      rule === undefined ? null : await this.storage.readHead(dto.key, MAGIC_BYTES_LENGTH);
    const magicOk = leadingBytes !== null && rule !== undefined && rule.matchesMagic(leadingBytes);

    if (rule === undefined || !withinLimit || !magicOk) {
      // A stray object nobody will ever reference is pure storage cost.
      await this.storage.delete(dto.key);
      throw new BadRequestException(UPLOAD_INVALID_MESSAGE);
    }

    const photo = await this.prisma.progressPhoto.create({
      data: {
        trainerId,
        clientId: client.id,
        date,
        label: dto.label == null || dto.label === '' ? null : dto.label,
        storageKey: dto.key,
        contentType: stored.contentType,
        sizeBytes: stored.sizeBytes,
      },
    });

    return toProgressPhotoInfo(photo);
  }

  /**
   * `viewerTrainerId` is the tenant lens: a trainer's own id, or the owning
   * trainer's for a client — the same contract as exercise media URLs. A
   * client may only reach their own photos, which the clientId narrows.
   */
  async getUrl(
    viewerTrainerId: string,
    photoId: string,
    viewerClientId?: string,
  ): Promise<MediaUrlResponse> {
    const photo = await this.prisma.progressPhoto.findFirst({
      where: {
        id: photoId,
        trainerId: viewerTrainerId,
        ...(viewerClientId === undefined ? {} : { clientId: viewerClientId }),
      },
    });

    if (photo === null) {
      throw new NotFoundException();
    }

    const { url, expiresAt } = await this.storage.presignGet(photo.storageKey);

    return { url, expiresAt: expiresAt.toISOString() };
  }

  async remove(trainerId: string, photoId: string): Promise<void> {
    const photo = await this.prisma.progressPhoto.findFirst({
      where: { id: photoId, trainerId },
    });

    if (photo === null) {
      throw new NotFoundException();
    }

    // Object first: if storage fails the record survives and the delete can be
    // retried; the reverse order would leave a record pointing at nothing.
    await this.storage.delete(photo.storageKey);
    await this.prisma.progressPhoto.delete({ where: { id: photo.id } });
  }
}

function keyPrefix(clientId: string): string {
  return `clients/${clientId}/progress/`;
}
