/** What the trainer usually tracks, offered as a starting point — not rows. */
export const PROGRESS_SUGGESTIONS: { name: string; unit: string }[] = [
  { name: 'Вага', unit: 'кг' },
  { name: 'Обхват талії', unit: 'см' },
  { name: '% жиру', unit: '%' },
  { name: 'Обхват стегон', unit: 'см' },
  { name: 'Обхват грудей', unit: 'см' },
  { name: 'Обхват біцепса', unit: 'см' },
];

/**
 * Measurements are weekly or monthly, so a progress chart wants months where
 * the trainer's session monitoring wanted weeks.
 */
export const PROGRESS_DEFAULT_DAYS = 180;
export const PROGRESS_MAX_DAYS = 1095;

export const PROGRESS_VALUE_MIN = -9999.99;
export const PROGRESS_VALUE_MAX = 9999.99;

/** A tracked dimension. `unit` is a display label; the value is what charts read. */
export interface PublicProgressVariable {
  id: string;
  name: string;
  unit: string;
  selfLog: boolean;
}

export interface ProgressPoint {
  date: string;
  value: number;
  notes: string | null;
}

/** A variable with its measurements over the requested range, oldest first. */
export interface ProgressSeries extends PublicProgressVariable {
  points: ProgressPoint[];
}

/**
 * Photo metadata as the UI sees it: enough to render a dated gallery, and
 * nothing that names the stored object. View URLs are minted per request.
 */
export interface ProgressPhotoInfo {
  id: string;
  date: string;
  label: string | null;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface ClientProgress {
  from: string;
  to: string;
  variables: ProgressSeries[];
  photos: ProgressPhotoInfo[];
}

/**
 * Progress photos are private media on the same path exercise media uses —
 * these numbers are what the web pre-checks and the API enforces.
 */
export const PROGRESS_PHOTO_RULES = {
  contentTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxSizeBytes: 10 * 1024 * 1024,
};

/**
 * What one exercise looked like on one date, derived from the client's logs —
 * never stored. Three metrics because coaches read different questions from
 * the same session.
 */
export interface ExerciseLoadPoint {
  date: string;
  /** The heaviest single set. */
  topSetKg: number | null;
  /** Σ reps × kg — whether the workload is climbing. */
  volumeKg: number | null;
  /** Epley, for 1–12 reps only, where the estimate means anything. */
  estimatedOneRepMaxKg: number | null;
}

/** An exercise this client has actually recorded, for the history picker. */
export interface LoggedExerciseSummary {
  id: string;
  name: string;
  sessions: number;
  lastDate: string;
}

export interface ExerciseLoadHistory {
  exercise: LoggedExerciseSummary;
  points: ExerciseLoadPoint[];
}

export const LOAD_METRICS = ['TOP_SET', 'VOLUME', 'ONE_REP_MAX'] as const;
export type LoadMetric = (typeof LOAD_METRICS)[number];

export const LOAD_METRIC_LABELS: Record<LoadMetric, string> = {
  TOP_SET: 'Топ-сет',
  VOLUME: 'Обʼєм',
  ONE_REP_MAX: 'Оцінка 1ПМ',
};

export interface CreateProgressVariableRequest {
  name: string;
  unit: string;
  selfLog?: boolean;
}

export interface UpdateProgressVariableRequest {
  name?: string;
  unit?: string;
  selfLog?: boolean;
}

export interface SaveProgressEntryRequest {
  value: number;
  notes?: string | null;
}

export interface PresignProgressPhotoRequest {
  contentType: string;
  sizeBytes: number;
}

export interface FinalizeProgressPhotoRequest {
  key: string;
  date: string;
  label?: string | null;
}
