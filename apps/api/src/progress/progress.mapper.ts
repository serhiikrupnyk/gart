import type {
  ProgressPhotoInfo,
  ProgressPoint,
  ProgressSeries,
  PublicProgressVariable,
} from '@gart/shared';

import { toDateString } from '../common/calendar';
import type {
  ProgressEntryModel,
  ProgressPhotoModel,
  ProgressVariableModel,
} from '../generated/prisma/models.js';

export type VariableWithEntries = ProgressVariableModel & { entries: ProgressEntryModel[] };

export function toPublicVariable(variable: ProgressVariableModel): PublicProgressVariable {
  return {
    id: variable.id,
    name: variable.name,
    unit: variable.unit,
    selfLog: variable.selfLog,
  };
}

export function toProgressPoint(entry: ProgressEntryModel): ProgressPoint {
  return {
    date: toDateString(entry.date),
    // Decimal on the way in, a plain number on the wire — the precision that
    // matters was preserved by the column, not by the JSON.
    value: Number(entry.value),
    notes: entry.notes,
  };
}

export function toProgressSeries(variable: VariableWithEntries): ProgressSeries {
  return { ...toPublicVariable(variable), points: variable.entries.map(toProgressPoint) };
}

/** Metadata only: the storage key stays behind, as with every other медіа. */
export function toProgressPhotoInfo(photo: ProgressPhotoModel): ProgressPhotoInfo {
  return {
    id: photo.id,
    date: toDateString(photo.date),
    label: photo.label,
    contentType: photo.contentType,
    sizeBytes: photo.sizeBytes,
    uploadedAt: photo.uploadedAt.toISOString(),
  };
}
