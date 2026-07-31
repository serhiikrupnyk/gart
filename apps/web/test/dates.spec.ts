import type { ClientAssignment } from '@gart/shared';

import {
  formatDayTitle,
  isScheduledOn,
  isoWeekdayOf,
  localDateString,
  nextScheduledDate,
  parseLocalDate,
  weekOf,
} from '@/lib/dates';

function plan(overrides: Partial<ClientAssignment> = {}): ClientAssignment {
  return {
    id: 'as-1',
    name: 'Сила',
    description: null,
    type: 'STRENGTH',
    status: 'ACTIVE',
    startDate: '2026-08-03',
    endDate: null,
    daysOfWeek: [1, 5],
    sectionCount: 1,
    exerciseCount: 1,
    ...overrides,
  };
}

describe('local calendar math', () => {
  it('localDateString uses LOCAL components, never UTC', () => {
    // 23:30 local on the 3rd: toISOString would flip the day for zones east of UTC.
    expect(localDateString(new Date(2026, 7, 3, 23, 30))).toBe('2026-08-03');
    expect(localDateString(parseLocalDate('2026-08-03'))).toBe('2026-08-03');
  });

  it('isoWeekdayOf maps Sunday to 7, Monday to 1', () => {
    expect(isoWeekdayOf(new Date(2026, 7, 3))).toBe(1);
    expect(isoWeekdayOf(new Date(2026, 7, 9))).toBe(7);
  });

  it('weekOf returns Пн…Нд around any weekday', () => {
    // Thursday 2026-08-06 → the week is Mon 03 … Sun 09.
    const week = weekOf(new Date(2026, 7, 6));

    expect(week.map(localDateString)).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
      '2026-08-09',
    ]);
  });

  it('formatDayTitle speaks Ukrainian with a capital', () => {
    expect(formatDayTitle(new Date(2026, 7, 3))).toBe('Понеділок, 3 серпня');
  });
});

describe('isScheduledOn', () => {
  it('mirrors the API: window and weekday must both match', () => {
    // Friday before the start.
    expect(isScheduledOn(plan(), new Date(2026, 6, 31))).toBe(false);
    // Monday, first day of the window.
    expect(isScheduledOn(plan(), new Date(2026, 7, 3))).toBe(true);
    // Tuesday inside the window, wrong weekday.
    expect(isScheduledOn(plan(), new Date(2026, 7, 4))).toBe(false);
    // endDate is inclusive.
    const closed = plan({ endDate: '2026-08-10' });
    expect(isScheduledOn(closed, new Date(2026, 7, 10))).toBe(true);
    expect(isScheduledOn(closed, new Date(2026, 7, 17))).toBe(false);
  });

  it('ignores non-active plans', () => {
    expect(isScheduledOn(plan({ status: 'COMPLETED' }), new Date(2026, 7, 3))).toBe(false);
  });
});

describe('nextScheduledDate', () => {
  it('finds the next training day after the given one', () => {
    // From Monday the 3rd, the next session is Friday the 7th.
    const next = nextScheduledDate([plan()], new Date(2026, 7, 3));

    expect(next === null ? null : localDateString(next)).toBe('2026-08-07');
  });

  it('returns null when nothing is scheduled within the horizon', () => {
    expect(nextScheduledDate([plan({ endDate: '2026-08-07' })], new Date(2026, 7, 7))).toBeNull();
  });
});
