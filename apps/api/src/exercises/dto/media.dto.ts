import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { MEDIA_KINDS, type MediaKind } from '@gart/shared';

/**
 * The absolute ceiling any presign request may declare; the per-kind caps in
 * media-types.ts are tighter and checked in the service.
 */
const ABSOLUTE_MAX_BYTES = 200 * 1024 * 1024;

export class PresignMediaDto {
  @IsIn(MEDIA_KINDS, { message: 'Некоректний тип медіа' })
  kind!: MediaKind;

  @IsString({ message: 'Некоректний тип файлу' })
  @MaxLength(100, { message: 'Некоректний тип файлу' })
  contentType!: string;

  @Type(() => Number)
  @IsInt({ message: 'Некоректний розмір файлу' })
  @Min(1, { message: 'Некоректний розмір файлу' })
  @Max(ABSOLUTE_MAX_BYTES, { message: 'Файл завеликий' })
  sizeBytes!: number;
}

export class FinalizeMediaDto {
  @IsIn(MEDIA_KINDS, { message: 'Некоректний тип медіа' })
  kind!: MediaKind;

  /**
   * Shape-checked here; the service then verifies the key sits under THIS
   * exercise's prefix — echoing back someone else's key is a 400, not a way to
   * claim their object.
   */
  @IsString({ message: 'Некоректний ключ' })
  @MaxLength(200, { message: 'Некоректний ключ' })
  @Matches(/^exercises\/[a-z0-9]+\/(video|audio)\/[A-Za-z0-9_-]+\.[a-z0-9]+$/, {
    message: 'Некоректний ключ',
  })
  key!: string;
}

export class MediaKindQuery {
  @IsIn(MEDIA_KINDS, { message: 'Некоректний тип медіа' })
  kind!: MediaKind;
}
