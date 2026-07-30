import { randomBytes } from 'node:crypto';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ExerciseMediaInfo,
  MediaKind,
  MediaUrlResponse,
  PresignMediaResponse,
} from '@gart/shared';

import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { PresignMediaDto } from './dto/media.dto';
import { ExercisesService } from './exercises.service';
import { MAGIC_BYTES_LENGTH, MEDIA_SIZE_LIMITS, MEDIA_TYPE_RULES } from './media-types';

const UNSUPPORTED_TYPE_MESSAGE = 'Непідтримуваний тип файлу';
const TOO_LARGE_MESSAGE = 'Файл завеликий';
/** One body for every finalize failure — nothing about storage internals leaks. */
const UPLOAD_INVALID_MESSAGE = 'Завантаження не вдалося перевірити';

/**
 * Upload and serving for exercise media. Ownership is not re-modelled here:
 * writes gate through ExercisesService.requireOwned, reads through
 * requireVisible — the same two doors as every other exercise access, with the
 * viewer's tenant supplied by the caller (a trainer's own id, or a client's
 * owning trainer).
 *
 * The API never carries the bytes. Presign hands the browser a signed PUT
 * whose key, content type and byte count are all part of the signature;
 * finalize verifies what actually landed (existence, size, declared type,
 * magic numbers) before anything is recorded — and deletes the object when
 * verification fails.
 */
@Injectable()
export class ExerciseMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exercises: ExercisesService,
    private readonly storage: StorageService,
  ) {}

  async presign(
    trainerId: string,
    exerciseId: string,
    dto: PresignMediaDto,
  ): Promise<PresignMediaResponse> {
    const exercise = await this.exercises.requireOwned(trainerId, exerciseId);

    const rule = MEDIA_TYPE_RULES[dto.kind][dto.contentType];

    if (rule === undefined) {
      throw new BadRequestException(UNSUPPORTED_TYPE_MESSAGE);
    }

    if (dto.sizeBytes > MEDIA_SIZE_LIMITS[dto.kind]) {
      throw new BadRequestException(TOO_LARGE_MESSAGE);
    }

    // Server-generated, random, prefix-bound: no user filename ever becomes a
    // key, and the prefix is what finalize later checks the echoed key against.
    const key = `${keyPrefix(exercise.id, dto.kind)}${randomBytes(16).toString('base64url')}.${rule.extension}`;

    const { url, expiresAt } = await this.storage.presignPut(key, dto.contentType, dto.sizeBytes);

    return { uploadUrl: url, key, expiresAt: expiresAt.toISOString() };
  }

  async finalize(
    trainerId: string,
    exerciseId: string,
    kind: MediaKind,
    key: string,
  ): Promise<ExerciseMediaInfo> {
    const exercise = await this.exercises.requireOwned(trainerId, exerciseId);

    // The echoed key must sit under THIS exercise's and kind's prefix —
    // someone else's key, or a video key confirmed as audio, is a plain 400.
    if (!key.startsWith(keyPrefix(exercise.id, kind))) {
      throw new BadRequestException(UPLOAD_INVALID_MESSAGE);
    }

    const stored = await this.storage.head(key);

    if (stored === null) {
      throw new BadRequestException(UPLOAD_INVALID_MESSAGE);
    }

    const rule = MEDIA_TYPE_RULES[kind][stored.contentType];
    const withinLimit = stored.sizeBytes > 0 && stored.sizeBytes <= MEDIA_SIZE_LIMITS[kind];
    const leadingBytes =
      rule === undefined ? null : await this.storage.readHead(key, MAGIC_BYTES_LENGTH);
    const magicOk = leadingBytes !== null && rule !== undefined && rule.matchesMagic(leadingBytes);

    if (rule === undefined || !withinLimit || !magicOk) {
      // A stray object nobody will ever reference is pure storage cost.
      await this.storage.delete(key);
      throw new BadRequestException(UPLOAD_INVALID_MESSAGE);
    }

    const previous = await this.prisma.exerciseMedia.findUnique({
      where: { exerciseId_kind: { exerciseId: exercise.id, kind } },
    });

    const record = await this.prisma.exerciseMedia.upsert({
      where: { exerciseId_kind: { exerciseId: exercise.id, kind } },
      create: {
        exerciseId: exercise.id,
        kind,
        storageKey: key,
        contentType: stored.contentType,
        sizeBytes: stored.sizeBytes,
      },
      update: { storageKey: key, contentType: stored.contentType, sizeBytes: stored.sizeBytes },
    });

    // Replacing a rendition retires the superseded object — record first, so a
    // failed delete leaves an orphan object (cost) rather than a broken record.
    if (previous !== null && previous.storageKey !== key) {
      await this.storage.delete(previous.storageKey);
    }

    return {
      kind: record.kind,
      contentType: record.contentType,
      sizeBytes: record.sizeBytes,
      uploadedAt: record.uploadedAt.toISOString(),
    };
  }

  /** `viewerTrainerId` is the tenant lens: own id for trainers, the owning trainer's for clients. */
  async getUrl(
    viewerTrainerId: string,
    exerciseId: string,
    kind: MediaKind,
  ): Promise<MediaUrlResponse> {
    const exercise = await this.exercises.requireVisible(viewerTrainerId, exerciseId);
    const media = exercise.media.find((row) => row.kind === kind);

    if (media === undefined) {
      throw new NotFoundException();
    }

    const { url, expiresAt } = await this.storage.presignGet(media.storageKey);

    return { url, expiresAt: expiresAt.toISOString() };
  }

  async remove(trainerId: string, exerciseId: string, kind: MediaKind): Promise<void> {
    const exercise = await this.exercises.requireOwned(trainerId, exerciseId);
    const media = exercise.media.find((row) => row.kind === kind);

    if (media === undefined) {
      throw new NotFoundException();
    }

    // Object first: if storage fails the record survives and the delete can be
    // retried; the reverse order would leave a record pointing at nothing.
    await this.storage.delete(media.storageKey);
    await this.prisma.exerciseMedia.delete({ where: { id: media.id } });
  }
}

function keyPrefix(exerciseId: string, kind: MediaKind): string {
  return `exercises/${exerciseId}/${kind.toLowerCase()}/`;
}
