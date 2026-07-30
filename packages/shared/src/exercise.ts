/**
 * The anatomical vocabulary — a closed set, extended only by a migration.
 * `MUSCLE_GROUPS` is the runtime list (DTO validation, pickers);
 * `MUSCLE_GROUP_LABELS` carries the Ukrainian names, mirroring how
 * ClientStatus and STATUS_LABELS are split.
 */
export const MUSCLE_GROUPS = [
  'CHEST',
  'BACK',
  'SHOULDERS',
  'ARMS',
  'LEGS',
  'GLUTES',
  'CORE',
  'CALVES',
  'FULL_BODY',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  CHEST: 'Груди',
  BACK: 'Спина',
  SHOULDERS: 'Плечі',
  ARMS: 'Руки',
  LEGS: 'Ноги',
  GLUTES: 'Сідниці',
  CORE: 'Прес',
  CALVES: 'Литки',
  FULL_BODY: 'Все тіло',
};

/**
 * An exercise as the trainer sees it. `isCustom` is derived from whether the
 * row belongs to the caller — the raw trainerId never crosses the wire, exactly
 * as with PublicClient. Custom rows are editable; global ones are not.
 */
export interface PublicExercise {
  id: string;
  name: string;
  description: string | null;
  primaryMuscleGroup: MuscleGroup;
  muscleGroups: MuscleGroup[];
  categoryId: string | null;
  textInstructions: string | null;
  /** Stored renditions — metadata only, never storage keys. */
  media: ExerciseMediaInfo[];
  isCustom: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicCategory {
  id: string;
  name: string;
  isCustom: boolean;
}

/** One page of the library listing. */
export interface ExercisePage {
  items: PublicExercise[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateExerciseRequest {
  name: string;
  description?: string | null;
  primaryMuscleGroup: MuscleGroup;
  muscleGroups?: MuscleGroup[];
  categoryId?: string | null;
  textInstructions?: string | null;
}

/** PATCH semantics: absent = unchanged, null = cleared. */
export type UpdateExerciseRequest = Partial<CreateExerciseRequest>;

export interface CreateCategoryRequest {
  name: string;
}

/** A muscle group as served by GET /muscle-groups: value plus Ukrainian label. */
export interface MuscleGroupOption {
  value: MuscleGroup;
  label: string;
}

/** The media renditions an exercise can carry; THUMBNAIL joins later. */
export const MEDIA_KINDS = ['VIDEO', 'AUDIO'] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

/**
 * A stored rendition as the UI sees it: enough to render a player and an
 * upload state, and nothing that names the underlying object. Fresh play URLs
 * come from GET /exercises/:id/media-url per request.
 */
export interface ExerciseMediaInfo {
  kind: MediaKind;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface PresignMediaRequest {
  kind: MediaKind;
  contentType: string;
  sizeBytes: number;
}

/**
 * The one place an object key crosses the wire: the client uploads to
 * `uploadUrl` and then confirms `key` back via the finalize endpoint.
 */
export interface PresignMediaResponse {
  uploadUrl: string;
  key: string;
  expiresAt: string;
}

export interface FinalizeMediaRequest {
  kind: MediaKind;
  key: string;
}

/** A short-lived play URL; request a fresh one when it expires. */
export interface MediaUrlResponse {
  url: string;
  expiresAt: string;
}
