import type {
  CreateHabitRequest,
  HabitDay,
  HabitsView,
  PublicHabit,
  UpdateHabitRequest,
} from '@gart/shared';

import { apiFetch } from './api';

export function getClientHabits(clientId: string, date: string): Promise<HabitsView> {
  return apiFetch<HabitsView>(`/clients/${clientId}/habits?date=${date}`);
}

export function getMyHabits(date: string): Promise<HabitsView> {
  return apiFetch<HabitsView>(`/me/habits?date=${date}`);
}

export function createHabit(clientId: string, body: CreateHabitRequest): Promise<PublicHabit> {
  return apiFetch<PublicHabit>(`/clients/${clientId}/habits`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateHabit(id: string, body: UpdateHabitRequest): Promise<PublicHabit> {
  return apiFetch<PublicHabit>(`/habits/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteHabit(id: string): Promise<null> {
  return apiFetch<null>(`/habits/${id}`, { method: 'DELETE' });
}

/** The client's own write — the only place a day is recorded. */
export function logHabit(habitId: string, date: string, value: number): Promise<HabitDay> {
  return apiFetch<HabitDay>(`/me/habits/${habitId}/logs/${date}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}

export function clearHabitLog(habitId: string, date: string): Promise<null> {
  return apiFetch<null>(`/me/habits/${habitId}/logs/${date}`, { method: 'DELETE' });
}
