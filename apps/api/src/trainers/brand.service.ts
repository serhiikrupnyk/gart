import { randomBytes } from 'node:crypto';

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BRAND_LOGO_RULES, type BrandSettings, type PresignMediaResponse } from '@gart/shared';

import { PrismaService } from '../database/prisma.service';
import { IMAGE_TYPE_RULES, MAGIC_BYTES_LENGTH } from '../exercises/media-types';
import type { TrainerModel } from '../generated/prisma/models.js';
import { StorageService } from '../storage/storage.service';
import type { FinalizeBrandLogoDto, PresignBrandLogoDto, UpdateBrandDto } from './dto/brand.dto';
import { toBrandSettings } from './trainer.mapper';

const UNSUPPORTED_TYPE_MESSAGE = 'Непідтримуваний тип файлу';
const TOO_LARGE_MESSAGE = 'Файл завеликий';
/** One body for every finalize failure — nothing about storage internals leaks. */
const UPLOAD_INVALID_MESSAGE = 'Завантаження не вдалося перевірити';

/** Everything one trainer's logos live under. Also what finalize checks against. */
function keyPrefix(trainerId: string): string {
  return `brand/${trainerId}/`;
}

/**
 * The exact shape every key this service mints has: a base64url random segment
 * and one of the extensions the media-type table derives.
 *
 * Checked BEFORE the database is asked anything, because the serving route
 * promises that every miss is the same bare 404 — and a filename containing a
 * NUL byte reaches Postgres as a value it refuses outright, turning a promised
 * 404 into a 500 that says «this input was different from the others».
 */
const LOGO_FILE_NAME = /^[A-Za-z0-9_-]{1,64}\.(?:jpg|png|webp)$/;

/** The bytes a stored logo is served from. */
export interface LogoBytes {
  body: Buffer;
  contentType: string;
}

/**
 * The trainer's white-label brand: what their own clients see instead of Gart.
 *
 * The logo travels the Step 8 media path exactly — a presigned PUT whose key,
 * content type and byte count are all part of the signature, then a finalize
 * that re-verifies what actually landed (existence, size, stored type, magic
 * numbers) before anything is recorded, deleting the object when it does not
 * check out. Nothing here is a second upload path.
 */
@Injectable()
export class BrandService {
  private readonly logger = new Logger(BrandService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async forTrainer(trainerId: string): Promise<BrandSettings> {
    return toBrandSettings(await this.require(trainerId));
  }

  /**
   * Applies a brand edit.
   *
   * An omitted field is left alone and an explicit null clears it, so one
   * control can be saved without the screen having to resend the rest.
   */
  async update(trainerId: string, dto: UpdateBrandDto): Promise<BrandSettings> {
    await this.require(trainerId);

    const updated = await this.prisma.trainer.update({
      where: { id: trainerId },
      data: {
        // `undefined` is «not sent» and `null` is «clear this» — and the two
        // must not be conflated, or saving one control would wipe the others.
        // Tested by omitting a field rather than trusting the distinction.
        ...(dto.brandName === undefined ? {} : { brandName: dto.brandName }),
        ...(dto.brandColor === undefined ? {} : { brandColor: dto.brandColor }),
      },
    });

    return toBrandSettings(updated);
  }

  async presignLogo(trainerId: string, dto: PresignBrandLogoDto): Promise<PresignMediaResponse> {
    const rule = IMAGE_TYPE_RULES[dto.contentType];

    // Belt and braces with the DTO's own allowlist: the policy that decides
    // what may be STORED is this table, and a type that reached here without a
    // rule has no verifiable magic signature.
    if (rule === undefined) {
      throw new BadRequestException(UNSUPPORTED_TYPE_MESSAGE);
    }
    if (dto.sizeBytes > BRAND_LOGO_RULES.maxSizeBytes) {
      throw new BadRequestException(TOO_LARGE_MESSAGE);
    }

    await this.require(trainerId);

    // Server-generated, random, prefix-bound: no user filename ever becomes a
    // key. The random segment is also what makes the serving URL change on
    // every upload, which is the precondition for caching it immutably.
    const key = `${keyPrefix(trainerId)}${randomBytes(16).toString('base64url')}.${rule.extension}`;
    const { url, expiresAt } = await this.storage.presignPut(key, dto.contentType, dto.sizeBytes);

    return { uploadUrl: url, key, expiresAt: expiresAt.toISOString() };
  }

  async finalizeLogo(trainerId: string, dto: FinalizeBrandLogoDto): Promise<BrandSettings> {
    const trainer = await this.require(trainerId);

    // The echoed key is checked against this trainer's own prefix before it is
    // used for anything — a key from another tenant's prefix is not theirs to
    // adopt, and a key they invented is not theirs to claim.
    if (!dto.key.startsWith(keyPrefix(trainerId))) {
      throw new BadRequestException(UPLOAD_INVALID_MESSAGE);
    }

    const stored = await this.storage.head(dto.key);

    if (stored === null) {
      throw new BadRequestException(UPLOAD_INVALID_MESSAGE);
    }

    const rule = IMAGE_TYPE_RULES[stored.contentType];
    const withinLimit = stored.sizeBytes > 0 && stored.sizeBytes <= BRAND_LOGO_RULES.maxSizeBytes;
    const leadingBytes =
      rule === undefined ? null : await this.storage.readHead(dto.key, MAGIC_BYTES_LENGTH);
    const magicOk = leadingBytes !== null && rule !== undefined && rule.matchesMagic(leadingBytes);

    if (rule === undefined || !withinLimit || !magicOk) {
      // A stray object nobody will ever reference is pure storage cost.
      await this.storage.delete(dto.key);
      throw new BadRequestException(UPLOAD_INVALID_MESSAGE);
    }

    const previousKey = trainer.brandLogoKey;

    const updated = await this.prisma.trainer.update({
      where: { id: trainerId },
      // The verified type is recorded alongside the key, exactly as
      // ProgressPhoto and ExerciseMedia record theirs — so serving the logo
      // costs one storage round trip rather than two.
      data: { brandLogoKey: dto.key, brandLogoType: stored.contentType },
    });

    // Only after the new key is committed: a delete that ran first would lose
    // the old logo if the write then failed.
    await this.discard(previousKey, dto.key);

    return toBrandSettings(updated);
  }

  async removeLogo(trainerId: string): Promise<BrandSettings> {
    const trainer = await this.require(trainerId);

    const updated = await this.prisma.trainer.update({
      where: { id: trainerId },
      data: { brandLogoKey: null, brandLogoType: null },
    });

    await this.discard(trainer.brandLogoKey, null);

    return toBrandSettings(updated);
  }

  /**
   * The bytes behind a logo URL, or null.
   *
   * Resolved by matching a trainer's OWN `brandLogoKey`, which is what keeps
   * this a logo endpoint rather than a general object reader: a progress-photo
   * key, a chat attachment, or an invented key matches no trainer and is gone
   * before storage is ever consulted.
   *
   * Every miss returns null and the caller answers one identical 404, so a
   * trainer who exists but has no logo, a trainer who does not exist, and a
   * well-formed key belonging to somebody else are indistinguishable.
   */
  async readLogo(trainerId: string, fileName: string): Promise<LogoBytes | null> {
    // Shape-checked before anything else. Every key this service mints matches,
    // so a name that does not cannot be anybody's logo — and refusing it here
    // keeps a hostile filename from reaching the query at all.
    if (!LOGO_FILE_NAME.test(fileName)) {
      return null;
    }

    const key = `${keyPrefix(trainerId)}${fileName}`;

    const trainer = await this.prisma.trainer.findFirst({
      where: { id: trainerId, brandLogoKey: key },
      select: { brandLogoType: true },
    });

    if (trainer === null || trainer.brandLogoType === null) {
      return null;
    }

    // One storage round trip. The content type was verified at finalize and
    // stored, so there is nothing left to ask storage about.
    const body = await this.storage.read(key, BRAND_LOGO_RULES.maxSizeBytes);

    return body === null ? null : { body, contentType: trainer.brandLogoType };
  }

  /**
   * Removes a superseded object, never the one currently referenced.
   *
   * A failure here is logged and swallowed rather than thrown: the trainer's
   * new logo is already saved, and losing that save over a cleanup that did not
   * happen would be the wrong trade. Logged so the orphan is not silent — an
   * object nobody will ever reference is pure storage cost.
   */
  private async discard(key: string | null, keeping: string | null): Promise<void> {
    if (key === null || key === keeping) {
      return;
    }

    await this.storage.delete(key).catch((error: unknown) => {
      this.logger.warn(`Could not remove the superseded logo ${key}: ${String(error)}`);
    });
  }

  private async require(trainerId: string): Promise<TrainerModel> {
    const trainer = await this.prisma.trainer.findUnique({ where: { id: trainerId } });

    if (trainer === null) {
      throw new NotFoundException();
    }

    return trainer;
  }
}
