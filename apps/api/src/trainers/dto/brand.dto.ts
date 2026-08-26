import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { BRAND_COLOR_PATTERN, BRAND_LOGO_RULES, BRAND_NAME_MAX_LENGTH } from '@gart/shared';

const COLOR_MESSAGE = 'Колір має бути у форматі #RRGGBB';

/**
 * Trims, then turns an emptied string into an explicit null.
 *
 * Both in one transform rather than composing with `trimmed`, because a
 * separate trim would be dead: this already returns the trimmed value, so the
 * second decorator could only ever re-trim what it had just been handed.
 *
 * A cleared text input arrives as `''`, and «I cleared this» has to mean the
 * same thing whether the screen sends an empty string, spaces, or a null —
 * otherwise a trainer would find their brand name un-clearable.
 */
function blankToNull(params: { value: unknown }): unknown {
  const value = typeof params.value === 'string' ? params.value.trim() : params.value;

  return value === '' ? null : value;
}

/**
 * A brand edit.
 *
 * Every field is optional so a screen can save one control without resending
 * the others — but `null` is a value, not an omission: it clears the field.
 */
export class UpdateBrandDto {
  @Transform(blankToNull)
  @IsOptional()
  @IsString({ message: 'Некоректна назва бренду' })
  @MaxLength(BRAND_NAME_MAX_LENGTH, { message: 'Назва бренду задовга' })
  brandName?: string | null;

  @Transform(blankToNull)
  @IsOptional()
  @IsString({ message: COLOR_MESSAGE })
  // An exact-shape allowlist, because this value reaches a CSS `style`
  // attribute. Anything looser — `rgb()`, a named colour, `var()` — would be a
  // string we hand to the browser's parser without knowing what it does.
  @Matches(BRAND_COLOR_PATTERN, { message: COLOR_MESSAGE })
  brandColor?: string | null;
}

export class PresignBrandLogoDto {
  @IsIn(BRAND_LOGO_RULES.contentTypes, { message: 'Непідтримуваний тип файлу' })
  contentType!: string;

  @IsInt({ message: 'Некоректний розмір файлу' })
  @Min(1, { message: 'Некоректний розмір файлу' })
  @Max(BRAND_LOGO_RULES.maxSizeBytes, { message: 'Файл завеликий' })
  sizeBytes!: number;
}

export class FinalizeBrandLogoDto {
  @IsString()
  key!: string;
}
