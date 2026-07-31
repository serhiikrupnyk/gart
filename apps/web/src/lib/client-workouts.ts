import type { ClientAssignment, ClientWorkoutDay } from '@gart/shared';

import { apiFetch } from './api';

export function getMyWorkouts(date: string): Promise<ClientWorkoutDay> {
  return apiFetch<ClientWorkoutDay>(`/me/workouts?date=${date}`);
}

export function listMyAssignments(): Promise<ClientAssignment[]> {
  return apiFetch<ClientAssignment[]>('/me/assignments');
}
