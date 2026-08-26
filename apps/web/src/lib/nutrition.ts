import {
  type CreateFoodRequest,
  type FoodGroup,
  type FoodPage,
  type NutritionStatus,
  type PublicFood,
  type UpdateFoodRequest,
} from '@gart/shared';

import { apiFetch } from './api';

export interface FoodQuery {
  page: number;
  search?: string;
  group?: FoodGroup;
  mineOnly?: boolean;
}

export function getNutritionStatus(): Promise<NutritionStatus> {
  return apiFetch<NutritionStatus>('/nutrition/status');
}

export function listFoods(query: FoodQuery): Promise<FoodPage> {
  const params = new URLSearchParams({ page: String(query.page) });

  if (query.search !== undefined && query.search !== '') params.set('search', query.search);
  if (query.group !== undefined) params.set('group', query.group);
  if (query.mineOnly === true) params.set('mineOnly', 'true');

  return apiFetch<FoodPage>(`/nutrition/foods?${params.toString()}`);
}

export function createFood(body: CreateFoodRequest): Promise<PublicFood> {
  return apiFetch<PublicFood>('/nutrition/foods', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateFood(id: string, body: UpdateFoodRequest): Promise<PublicFood> {
  return apiFetch<PublicFood>(`/nutrition/foods/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteFood(id: string): Promise<null> {
  return apiFetch<null>(`/nutrition/foods/${id}`, { method: 'DELETE' });
}
