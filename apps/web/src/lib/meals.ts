import type {
  AssignMealPlanRequest,
  ClientNutrition,
  CreateMealPlanRequest,
  CreateMealRequest,
  MealPage,
  PublicMeal,
  PublicMealPlan,
  TrainerAssignedPlan,
  UpdateMealPlanRequest,
  UpdateMealRequest,
} from '@gart/shared';

import { apiFetch } from './api';

export function listMeals(page: number, search?: string, pageSize?: number): Promise<MealPage> {
  const params = new URLSearchParams({ page: String(page) });

  if (pageSize !== undefined) params.set('pageSize', String(pageSize));
  if (search !== undefined && search !== '') params.set('search', search);

  return apiFetch<MealPage>(`/nutrition/meals?${params.toString()}`);
}

export function createMeal(body: CreateMealRequest): Promise<PublicMeal> {
  return apiFetch<PublicMeal>('/nutrition/meals', { method: 'POST', body: JSON.stringify(body) });
}

export function updateMeal(id: string, body: UpdateMealRequest): Promise<PublicMeal> {
  return apiFetch<PublicMeal>(`/nutrition/meals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteMeal(id: string): Promise<null> {
  return apiFetch<null>(`/nutrition/meals/${id}`, { method: 'DELETE' });
}

export function listPlans(): Promise<PublicMealPlan[]> {
  return apiFetch<PublicMealPlan[]>('/nutrition/plans');
}

export function createPlan(body: CreateMealPlanRequest): Promise<PublicMealPlan> {
  return apiFetch<PublicMealPlan>('/nutrition/plans', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updatePlan(id: string, body: UpdateMealPlanRequest): Promise<PublicMealPlan> {
  return apiFetch<PublicMealPlan>(`/nutrition/plans/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deletePlan(id: string): Promise<null> {
  return apiFetch<null>(`/nutrition/plans/${id}`, { method: 'DELETE' });
}

export function assignPlan(body: AssignMealPlanRequest): Promise<TrainerAssignedPlan> {
  return apiFetch<TrainerAssignedPlan>('/nutrition/plans/assign', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listClientPlans(clientId: string): Promise<TrainerAssignedPlan[]> {
  return apiFetch<TrainerAssignedPlan[]>(`/clients/${clientId}/nutrition-plans`);
}

export function removeClientPlan(clientId: string, id: string): Promise<null> {
  return apiFetch<null>(`/clients/${clientId}/nutrition-plans/${id}`, { method: 'DELETE' });
}

export function getMyNutrition(): Promise<ClientNutrition> {
  return apiFetch<ClientNutrition>('/me/nutrition');
}
