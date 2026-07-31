import type {
  CreateAssignmentRequest,
  PublicAssignment,
  PublicAssignmentDetail,
  UpdateAssignmentRequest,
} from '@gart/shared';

import { apiFetch } from './api';

export function listClientAssignments(clientId: string): Promise<PublicAssignment[]> {
  return apiFetch<PublicAssignment[]>(`/clients/${clientId}/assignments`);
}

export function createAssignment(
  clientId: string,
  body: CreateAssignmentRequest,
): Promise<PublicAssignmentDetail> {
  return apiFetch<PublicAssignmentDetail>(`/clients/${clientId}/assignments`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateAssignment(
  id: string,
  body: UpdateAssignmentRequest,
): Promise<PublicAssignmentDetail> {
  return apiFetch<PublicAssignmentDetail>(`/assignments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteAssignment(id: string): Promise<null> {
  return apiFetch<null>(`/assignments/${id}`, { method: 'DELETE' });
}
