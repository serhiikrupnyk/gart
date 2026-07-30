import { Controller, Get, UseGuards } from '@nestjs/common';
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS, type MuscleGroupOption } from '@gart/shared';

import { TrainerGuard } from '../auth/trainer.guard';

/**
 * The anatomical vocabulary with its Ukrainian labels. Served over HTTP even
 * though web imports it from @gart/shared — API-first means a client that only
 * speaks HTTP still gets the whole vocabulary.
 */
@Controller('muscle-groups')
@UseGuards(TrainerGuard)
export class MuscleGroupsController {
  @Get()
  list(): MuscleGroupOption[] {
    return MUSCLE_GROUPS.map((value) => ({ value, label: MUSCLE_GROUP_LABELS[value] }));
  }
}
