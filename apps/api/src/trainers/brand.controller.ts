import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { BrandSettings, PresignMediaResponse } from '@gart/shared';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { TrainerGuard } from '../auth/trainer.guard';
import { BrandService } from './brand.service';
import { FinalizeBrandLogoDto, PresignBrandLogoDto, UpdateBrandDto } from './dto/brand.dto';

/**
 * The trainer's own white-label settings.
 *
 * Scoped to the signed-in trainer and taking no identifier: there is exactly
 * one brand per trainer, so «my brand» is the only thing any of these can mean.
 */
@Controller('trainer/brand')
@UseGuards(TrainerGuard)
export class BrandController {
  constructor(private readonly brand: BrandService) {}

  @Get()
  async mine(@CurrentAuth() auth: AuthContext): Promise<BrandSettings> {
    return this.brand.forTrainer(auth.trainer.id);
  }

  @Patch()
  async update(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UpdateBrandDto,
  ): Promise<BrandSettings> {
    return this.brand.update(auth.trainer.id, dto);
  }

  @Post('logo/presign')
  async presignLogo(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: PresignBrandLogoDto,
  ): Promise<PresignMediaResponse> {
    return this.brand.presignLogo(auth.trainer.id, dto);
  }

  @Post('logo/finalize')
  @HttpCode(HttpStatus.OK)
  async finalizeLogo(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: FinalizeBrandLogoDto,
  ): Promise<BrandSettings> {
    return this.brand.finalizeLogo(auth.trainer.id, dto);
  }

  @Delete('logo')
  async removeLogo(@CurrentAuth() auth: AuthContext): Promise<BrandSettings> {
    return this.brand.removeLogo(auth.trainer.id);
  }
}

/** A year. The URL changes whenever the logo does, so nothing can go stale. */
const LOGO_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Where a brand logo is served from.
 *
 * DELIBERATELY UNAUTHENTICATED, because the invite page — a client's very first
 * impression, before they have an account at all — has to be able to show it.
 * That is safe: a logo is the least secret thing a trainer owns, it is on their
 * own website, and the path carries an unguessable random segment.
 *
 * It is a LOGO route and not an object reader. The key is reconstructed from
 * the path and then has to match some trainer's own `brandLogoKey`, so a
 * progress photo or a chat attachment resolves to nothing however it is
 * spelled. Every miss — no such trainer, a trainer with no logo, a well-formed
 * key belonging to somebody else — answers the same bare 404, so the route
 * cannot be used to enumerate who exists or who has uploaded what.
 *
 * Bytes pass through the API here, which the storage seam otherwise avoids.
 * That rule was written about exercise video; a 256 KB logo on an immutable URL
 * is fetched once per version per device, and presigning it instead would put
 * an API round trip in front of every shell mount while defeating browser
 * caching entirely.
 */
@Controller('brand')
export class BrandLogoController {
  constructor(private readonly brand: BrandService) {}

  @Get(':trainerId/logo/:fileName')
  async logo(
    @Param('trainerId') trainerId: string,
    @Param('fileName') fileName: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const logo = await this.brand.readLogo(trainerId, fileName);

    if (logo === null) {
      // Explicitly uncacheable. A 404 is heuristically cacheable by default
      // (RFC 9111 §4.2.2), and this URL is the one thing that must not be
      // remembered as missing — the bytes behind it may arrive a second later.
      response.setHeader('Cache-Control', 'no-store');
      throw new NotFoundException();
    }

    // Set HERE and not with @Header, which applies before the handler runs and
    // would therefore stamp a year of immutable caching onto a 404 as well. One
    // transient miss would then hide a trainer's logo from that client for a
    // year, with no URL to invalidate because the URL is the thing being cached.
    response.setHeader('Cache-Control', LOGO_CACHE_CONTROL);
    // Helmet defaults every response to `same-origin`, which would block this
    // image from loading at all: the API and the web app are separate origins,
    // and this is the first asset Gart serves itself rather than through a
    // presigned storage URL. `cross-origin` is correct AND deliberate for a
    // logo — it is the one thing here meant to be embeddable anywhere.
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // Nothing here is a document, and an image that arrives with a sniffable
    // type is how an upload becomes a script on our own origin.
    response.setHeader('X-Content-Type-Options', 'nosniff');

    // StreamableFile and not a bare Buffer: Nest's serialiser would otherwise
    // JSON-encode the bytes and send `{"type":"Buffer","data":[...]}`.
    return new StreamableFile(logo.body, { type: logo.contentType });
  }
}
