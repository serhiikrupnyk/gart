import type {
  ExerciseMediaInfo,
  ExercisePage,
  CreateExerciseRequest,
  MediaKind,
  MediaUrlResponse,
  PresignMediaResponse,
  PublicCategory,
  PublicExercise,
  UpdateExerciseRequest,
} from '@gart/shared';

import { apiFetch } from './api';

export interface ExerciseListQuery {
  page: number;
  search?: string;
  muscleGroup?: string;
  categoryId?: string;
}

export const EXERCISES_PAGE_SIZE = 20;

/**
 * Builds the query string, omitting anything empty — the API treats an absent
 * param and an all-values param identically, and the tests pin this shape.
 * URLSearchParams also percent-encodes Cyrillic search text correctly.
 */
function buildQuery(query: ExerciseListQuery): string {
  const params = new URLSearchParams();

  params.set('page', String(query.page));
  params.set('pageSize', String(EXERCISES_PAGE_SIZE));
  if (query.search !== undefined && query.search !== '') params.set('search', query.search);
  if (query.muscleGroup !== undefined && query.muscleGroup !== '') {
    params.set('muscleGroup', query.muscleGroup);
  }
  if (query.categoryId !== undefined && query.categoryId !== '') {
    params.set('categoryId', query.categoryId);
  }

  return params.toString();
}

export function listExercises(query: ExerciseListQuery): Promise<ExercisePage> {
  return apiFetch<ExercisePage>(`/exercises?${buildQuery(query)}`);
}

export function createExercise(body: CreateExerciseRequest): Promise<PublicExercise> {
  return apiFetch<PublicExercise>('/exercises', { method: 'POST', body: JSON.stringify(body) });
}

export function updateExercise(id: string, body: UpdateExerciseRequest): Promise<PublicExercise> {
  return apiFetch<PublicExercise>(`/exercises/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteExercise(id: string): Promise<null> {
  return apiFetch<null>(`/exercises/${id}`, { method: 'DELETE' });
}

export function listCategories(): Promise<PublicCategory[]> {
  return apiFetch<PublicCategory[]>('/categories');
}

export function createCategory(name: string): Promise<PublicCategory> {
  return apiFetch<PublicCategory>('/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function presignMedia(
  exerciseId: string,
  kind: MediaKind,
  file: { type: string; size: number },
): Promise<PresignMediaResponse> {
  // file.type and file.size pass through unchanged — the presigned URL signs
  // exactly these, and the browser sends exactly these on the PUT.
  return apiFetch<PresignMediaResponse>(`/exercises/${exerciseId}/media/presign`, {
    method: 'POST',
    body: JSON.stringify({ kind, contentType: file.type, sizeBytes: file.size }),
  });
}

export function finalizeMedia(
  exerciseId: string,
  kind: MediaKind,
  key: string,
): Promise<ExerciseMediaInfo> {
  return apiFetch<ExerciseMediaInfo>(`/exercises/${exerciseId}/media`, {
    method: 'POST',
    body: JSON.stringify({ kind, key }),
  });
}

export function deleteMedia(exerciseId: string, kind: MediaKind): Promise<null> {
  return apiFetch<null>(`/exercises/${exerciseId}/media?kind=${kind}`, { method: 'DELETE' });
}

export function getMediaUrl(exerciseId: string, kind: MediaKind): Promise<MediaUrlResponse> {
  return apiFetch<MediaUrlResponse>(`/exercises/${exerciseId}/media-url?kind=${kind}`);
}
