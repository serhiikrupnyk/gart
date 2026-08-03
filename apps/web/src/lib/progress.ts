import type {
  ClientProgress,
  CreateProgressVariableRequest,
  ExerciseLoadHistory,
  FinalizeProgressPhotoRequest,
  LoggedExerciseSummary,
  MediaUrlResponse,
  PresignMediaResponse,
  PresignProgressPhotoRequest,
  ProgressPhotoInfo,
  ProgressPoint,
  PublicProgressVariable,
  SaveProgressEntryRequest,
  UpdateProgressVariableRequest,
} from '@gart/shared';

import { apiFetch } from './api';

export function getClientProgress(clientId: string): Promise<ClientProgress> {
  return apiFetch<ClientProgress>(`/clients/${clientId}/progress`);
}

export function getMyProgress(): Promise<ClientProgress> {
  return apiFetch<ClientProgress>('/me/progress');
}

export function createProgressVariable(
  clientId: string,
  body: CreateProgressVariableRequest,
): Promise<PublicProgressVariable> {
  return apiFetch<PublicProgressVariable>(`/clients/${clientId}/progress/variables`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateProgressVariable(
  id: string,
  body: UpdateProgressVariableRequest,
): Promise<PublicProgressVariable> {
  return apiFetch<PublicProgressVariable>(`/progress/variables/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteProgressVariable(id: string): Promise<null> {
  return apiFetch<null>(`/progress/variables/${id}`, { method: 'DELETE' });
}

export function saveProgressEntry(
  variableId: string,
  date: string,
  body: SaveProgressEntryRequest,
): Promise<ProgressPoint> {
  return apiFetch<ProgressPoint>(`/progress/variables/${variableId}/entries/${date}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** The client's own write, for variables the trainer opened up. */
export function saveMyProgressEntry(
  variableId: string,
  date: string,
  body: SaveProgressEntryRequest,
): Promise<ProgressPoint> {
  return apiFetch<ProgressPoint>(`/me/progress/variables/${variableId}/entries/${date}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function presignProgressPhoto(
  clientId: string,
  body: PresignProgressPhotoRequest,
): Promise<PresignMediaResponse> {
  return apiFetch<PresignMediaResponse>(`/clients/${clientId}/progress/photos/presign`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function finalizeProgressPhoto(
  clientId: string,
  body: FinalizeProgressPhotoRequest,
): Promise<ProgressPhotoInfo> {
  return apiFetch<ProgressPhotoInfo>(`/clients/${clientId}/progress/photos`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Minted per view — nothing is fetched until a photo is actually opened. */
export function getProgressPhotoUrl(photoId: string): Promise<MediaUrlResponse> {
  return apiFetch<MediaUrlResponse>(`/progress/photos/${photoId}/url`);
}

export function deleteProgressPhoto(photoId: string): Promise<null> {
  return apiFetch<null>(`/progress/photos/${photoId}`, { method: 'DELETE' });
}

export function listLoggedExercises(clientId: string): Promise<LoggedExerciseSummary[]> {
  return apiFetch<LoggedExerciseSummary[]>(`/clients/${clientId}/progress/exercises`);
}

export function getExerciseHistory(
  clientId: string,
  exerciseId: string,
): Promise<ExerciseLoadHistory> {
  return apiFetch<ExerciseLoadHistory>(`/clients/${clientId}/progress/exercises/${exerciseId}`);
}
