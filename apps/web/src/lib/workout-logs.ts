import type { ClientWorkoutLog, LogWorkoutExerciseRequest } from '@gart/shared';

import { apiFetch } from './api';

export function saveWorkoutLog(
  assignmentExerciseId: string,
  date: string,
  body: LogWorkoutExerciseRequest,
): Promise<ClientWorkoutLog> {
  return apiFetch<ClientWorkoutLog>(
    `/me/assignment-exercises/${assignmentExerciseId}/logs/${date}`,
    { method: 'PUT', body: JSON.stringify(body) },
  );
}

export function deleteWorkoutLog(assignmentExerciseId: string, date: string): Promise<null> {
  return apiFetch<null>(`/me/assignment-exercises/${assignmentExerciseId}/logs/${date}`, {
    method: 'DELETE',
  });
}
