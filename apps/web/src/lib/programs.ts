import type {
  CreateProgramRequest,
  ProgramPage,
  PublicProgramDetail,
  UpdateProgramRequest,
} from '@gart/shared';

import { apiFetch } from './api';

export const PROGRAMS_PAGE_SIZE = 20;

export function listPrograms(page: number): Promise<ProgramPage> {
  return apiFetch<ProgramPage>(
    `/programs?page=${String(page)}&pageSize=${String(PROGRAMS_PAGE_SIZE)}`,
  );
}

export function getProgram(id: string): Promise<PublicProgramDetail> {
  return apiFetch<PublicProgramDetail>(`/programs/${id}`);
}

export function createProgram(body: CreateProgramRequest): Promise<PublicProgramDetail> {
  return apiFetch<PublicProgramDetail>('/programs', { method: 'POST', body: JSON.stringify(body) });
}

export function updateProgram(
  id: string,
  body: UpdateProgramRequest,
): Promise<PublicProgramDetail> {
  return apiFetch<PublicProgramDetail>(`/programs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteProgram(id: string): Promise<null> {
  return apiFetch<null>(`/programs/${id}`, { method: 'DELETE' });
}
