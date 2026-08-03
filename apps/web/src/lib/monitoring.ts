import type { ClientWorkoutHistory } from '@gart/shared';

import { apiFetch } from './api';
import { addDays, localDateString } from './dates';

export function getWorkoutHistory(
  clientId: string,
  days: number,
  today: Date,
): Promise<ClientWorkoutHistory> {
  const from = localDateString(addDays(today, -(days - 1)));
  const to = localDateString(today);

  return apiFetch<ClientWorkoutHistory>(
    `/clients/${clientId}/workout-history?from=${from}&to=${to}`,
  );
}
