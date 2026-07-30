import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ExerciseMediaInfo, MediaUrlResponse, PresignMediaResponse } from '@gart/shared';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { CurrentViewerTenant, TrainerOrClientGuard } from '../auth/trainer-or-client.guard';
import { TrainerGuard } from '../auth/trainer.guard';
import { FinalizeMediaDto, MediaKindQuery, PresignMediaDto } from './dto/media.dto';
import { ExerciseMediaService } from './exercise-media.service';

/**
 * Writes are trainer-only (and requireOwned inside keeps them to the owner).
 * Reading a play URL is the one route both hats share: a trainer for anything
 * they can see, a client for anything their trainer can see.
 */
@Controller('exercises/:id/media')
export class ExerciseMediaController {
  constructor(private readonly media: ExerciseMediaService) {}

  @Post('presign')
  @UseGuards(TrainerGuard)
  @HttpCode(HttpStatus.OK)
  async presign(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: PresignMediaDto,
  ): Promise<PresignMediaResponse> {
    return this.media.presign(auth.trainer.id, id, dto);
  }

  @Post()
  @UseGuards(TrainerGuard)
  async finalize(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: FinalizeMediaDto,
  ): Promise<ExerciseMediaInfo> {
    return this.media.finalize(auth.trainer.id, id, dto.kind, dto.key);
  }

  @Delete()
  @UseGuards(TrainerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Query() query: MediaKindQuery,
  ): Promise<void> {
    await this.media.remove(auth.trainer.id, id, query.kind);
  }
}

/** The read path, addressable by both principals. */
@Controller('exercises/:id/media-url')
export class ExerciseMediaUrlController {
  constructor(private readonly media: ExerciseMediaService) {}

  @Get()
  @UseGuards(TrainerOrClientGuard)
  async getUrl(
    @CurrentViewerTenant() viewerTrainerId: string,
    @Param('id') id: string,
    @Query() query: MediaKindQuery,
  ): Promise<MediaUrlResponse> {
    return this.media.getUrl(viewerTrainerId, id, query.kind);
  }
}
