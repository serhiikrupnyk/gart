import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  ClientProgress,
  ExerciseLoadHistory,
  LoggedExerciseSummary,
  MediaUrlResponse,
  PresignMediaResponse,
  ProgressPhotoInfo,
  ProgressPoint,
  PublicProgressVariable,
} from '@gart/shared';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { type ClientAuthContext, CurrentClientAuth } from '../auth/client-auth-context';
import { ClientGuard } from '../auth/client.guard';
import { TrainerGuard } from '../auth/trainer.guard';
import {
  CurrentViewerTenant,
  TrainerOrClientGuard,
  type ViewerTenant,
} from '../auth/trainer-or-client.guard';
import {
  CreateProgressVariableDto,
  EntryParamsDto,
  FinalizeProgressPhotoDto,
  PresignProgressPhotoDto,
  ProgressRangeQuery,
  SaveProgressEntryDto,
  UpdateProgressVariableDto,
} from './dto/progress.dto';
import { ExerciseHistoryService } from './exercise-history.service';
import { ProgressPhotosService } from './progress-photos.service';
import { ProgressService } from './progress.service';

/** Everything scoped to one client lives under that client, as elsewhere. */
@Controller('clients/:clientId/progress')
@UseGuards(TrainerGuard)
export class ClientProgressController {
  constructor(
    private readonly progress: ProgressService,
    private readonly photos: ProgressPhotosService,
    private readonly history: ExerciseHistoryService,
  ) {}

  @Get()
  async forClient(
    @CurrentAuth() auth: AuthContext,
    @Param('clientId') clientId: string,
    @Query() query: ProgressRangeQuery,
  ): Promise<ClientProgress> {
    return this.progress.forClient(auth.trainer.id, clientId, query);
  }

  @Get('variables')
  async listVariables(
    @CurrentAuth() auth: AuthContext,
    @Param('clientId') clientId: string,
  ): Promise<PublicProgressVariable[]> {
    return this.progress.listVariables(auth.trainer.id, clientId);
  }

  @Post('variables')
  async createVariable(
    @CurrentAuth() auth: AuthContext,
    @Param('clientId') clientId: string,
    @Body() dto: CreateProgressVariableDto,
  ): Promise<PublicProgressVariable> {
    return this.progress.createVariable(auth.trainer.id, clientId, dto);
  }

  @Post('photos/presign')
  async presignPhoto(
    @CurrentAuth() auth: AuthContext,
    @Param('clientId') clientId: string,
    @Body() dto: PresignProgressPhotoDto,
  ): Promise<PresignMediaResponse> {
    return this.photos.presign(auth.trainer.id, clientId, dto);
  }

  @Post('photos')
  async finalizePhoto(
    @CurrentAuth() auth: AuthContext,
    @Param('clientId') clientId: string,
    @Body() dto: FinalizeProgressPhotoDto,
  ): Promise<ProgressPhotoInfo> {
    return this.photos.finalize(auth.trainer.id, clientId, dto);
  }

  @Get('exercises')
  async loggedExercises(
    @CurrentAuth() auth: AuthContext,
    @Param('clientId') clientId: string,
    @Query() query: ProgressRangeQuery,
  ): Promise<LoggedExerciseSummary[]> {
    return this.history.loggedExercises(auth.trainer.id, clientId, query);
  }

  @Get('exercises/:exerciseId')
  async exerciseHistory(
    @CurrentAuth() auth: AuthContext,
    @Param('clientId') clientId: string,
    @Param('exerciseId') exerciseId: string,
    @Query() query: ProgressRangeQuery,
  ): Promise<ExerciseLoadHistory> {
    return this.history.forExercise(auth.trainer.id, clientId, exerciseId, query);
  }
}

/** Item routes: the id already names the tenant through its own gate. */
@Controller('progress')
@UseGuards(TrainerGuard)
export class ProgressController {
  constructor(
    private readonly progress: ProgressService,
    private readonly photos: ProgressPhotosService,
  ) {}

  @Patch('variables/:id')
  async updateVariable(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateProgressVariableDto,
  ): Promise<PublicProgressVariable> {
    return this.progress.updateVariable(auth.trainer.id, id, dto);
  }

  @Delete('variables/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeVariable(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<void> {
    await this.progress.removeVariable(auth.trainer.id, id);
  }

  @Put('variables/:id/entries/:date')
  async saveEntry(
    @CurrentAuth() auth: AuthContext,
    @Param() params: EntryParamsDto,
    @Body() dto: SaveProgressEntryDto,
  ): Promise<ProgressPoint> {
    return this.progress.saveEntry(auth.trainer.id, params.id, params.date, dto);
  }

  @Delete('variables/:id/entries/:date')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeEntry(
    @CurrentAuth() auth: AuthContext,
    @Param() params: EntryParamsDto,
  ): Promise<void> {
    await this.progress.removeEntry(auth.trainer.id, params.id, params.date);
  }

  @Delete('photos/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removePhoto(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<void> {
    await this.photos.remove(auth.trainer.id, id);
  }
}

/**
 * The one route both audiences share, exactly like exercise media URLs: the
 * owning trainer, or that client for their own photo, and nobody else.
 */
@Controller('progress/photos')
@UseGuards(TrainerOrClientGuard)
export class ProgressPhotoUrlController {
  constructor(private readonly photos: ProgressPhotosService) {}

  @Get(':id/url')
  async getUrl(
    @CurrentViewerTenant() viewer: ViewerTenant,
    @Param('id') id: string,
  ): Promise<MediaUrlResponse> {
    return this.photos.getUrl(viewer.trainerId, id, viewer.clientId);
  }
}

/** The client's own progress, scoped by the session as everywhere under /me. */
@Controller('me/progress')
@UseGuards(ClientGuard)
export class MeProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get()
  async mine(
    @CurrentClientAuth() auth: ClientAuthContext,
    @Query() query: ProgressRangeQuery,
  ): Promise<ClientProgress> {
    return this.progress.buildProgress(auth.trainer.id, auth.client.id, query);
  }

  @Put('variables/:id/entries/:date')
  async saveOwnEntry(
    @CurrentClientAuth() auth: ClientAuthContext,
    @Param() params: EntryParamsDto,
    @Body() dto: SaveProgressEntryDto,
  ): Promise<ProgressPoint> {
    return this.progress.saveOwnEntry(auth.trainer.id, auth.client.id, params.id, params.date, dto);
  }
}
