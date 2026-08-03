import type {
  ClientAssignment,
  ClientWorkoutExercise,
  ClientWorkoutSection,
  ClientWorkoutSetLog,
} from '@gart/shared';

import {
  actualLine,
  formatSeconds,
  formatShortDate,
  pluralUk,
  prescriptionLine,
  scheduleLine,
  sectionConfigLine,
} from '@/lib/workout-format';

function line(overrides: Partial<ClientWorkoutExercise> = {}): ClientWorkoutExercise {
  return {
    id: 'ae-1',
    exercise: {
      id: 'ex-1',
      name: 'Присідання',
      primaryMuscleGroup: 'LEGS',
      textInstructions: null,
      media: [],
    },
    log: null,
    sets: null,
    reps: null,
    loadValue: null,
    loadUnit: null,
    loadText: null,
    restSeconds: null,
    tempo: null,
    notes: null,
    durationSeconds: null,
    distanceMeters: null,
    ...overrides,
  };
}

function section(overrides: Partial<ClientWorkoutSection> = {}): ClientWorkoutSection {
  return {
    id: 's-1',
    name: null,
    type: 'STRENGTH',
    timeCapSeconds: null,
    intervalSeconds: null,
    rounds: null,
    restBetweenRoundsSeconds: null,
    exercises: [],
    ...overrides,
  };
}

describe('pluralUk', () => {
  it.each([
    [1, 'раунд'],
    [2, 'раунди'],
    [4, 'раунди'],
    [5, 'раундів'],
    [11, 'раундів'],
    [12, 'раундів'],
    [21, 'раунд'],
    [22, 'раунди'],
  ])('%i → %s', (count, expected) => {
    expect(pluralUk(count, 'раунд', 'раунди', 'раундів')).toBe(expected);
  });
});

describe('formatSeconds', () => {
  it.each([
    [40, '40 с'],
    [60, '1 хв'],
    [90, '1 хв 30 с'],
    [720, '12 хв'],
  ])('%i → %s', (seconds, expected) => {
    expect(formatSeconds(seconds)).toBe(expected);
  });
});

describe('prescriptionLine', () => {
  it('joins sets×reps, load and rest with a Ukrainian decimal comma', () => {
    expect(
      prescriptionLine(
        line({ sets: 5, reps: 5, loadValue: 82.5, loadUnit: 'KG', restSeconds: 90 }),
      ),
    ).toBe('5×5 · 82,5 кг · відпочинок 1 хв 30 с');
  });

  it('spells RPE before the number and %1ПМ after it', () => {
    expect(prescriptionLine(line({ reps: 3, loadValue: 8, loadUnit: 'RPE' }))).toBe(
      '3 повторення · RPE 8',
    );
    expect(
      prescriptionLine(line({ sets: 4, reps: 6, loadValue: 75, loadUnit: 'PERCENT_1RM' })),
    ).toBe('4×6 · 75 %1ПМ');
  });

  it('prefers free-text load and formats duration, distance and tempo', () => {
    expect(
      prescriptionLine(line({ durationSeconds: 40, loadText: 'до відмови', tempo: '3-1-1' })),
    ).toBe('40 с · до відмови · темп 3-1-1');
    expect(prescriptionLine(line({ distanceMeters: 400 }))).toBe('400 м');
    expect(prescriptionLine(line({ distanceMeters: 1500 }))).toBe('1,5 км');
  });

  it('is empty when the trainer prescribed nothing', () => {
    expect(prescriptionLine(line())).toBe('');
  });
});

describe('sectionConfigLine', () => {
  it('describes AMRAP, EMOM and circuit configs', () => {
    expect(sectionConfigLine(section({ timeCapSeconds: 720 }))).toBe('ліміт 12 хв');
    expect(sectionConfigLine(section({ type: 'EMOM', intervalSeconds: 60, rounds: 10 }))).toBe(
      'кожні 1 хв · 10 раундів',
    );
    expect(
      sectionConfigLine(section({ type: 'CIRCUIT', rounds: 3, restBetweenRoundsSeconds: 120 })),
    ).toBe('3 раунди · відпочинок між раундами 2 хв');
  });

  it('is null for a plain section', () => {
    expect(sectionConfigLine(section())).toBeNull();
  });
});

describe('actualLine', () => {
  function set(overrides: Partial<ClientWorkoutSetLog> = {}): ClientWorkoutSetLog {
    return { reps: null, loadKg: null, durationSeconds: null, distanceMeters: null, ...overrides };
  }

  it('collapses identical sets', () => {
    expect(actualLine(Array.from({ length: 5 }, () => set({ reps: 5, loadKg: 82.5 })))).toBe(
      '5×5 · 82,5 кг',
    );
  });

  it('keeps a set that differed visible instead of averaging it away', () => {
    expect(
      actualLine([
        set({ reps: 5, loadKg: 82.5 }),
        set({ reps: 5, loadKg: 82.5 }),
        set({ reps: 3, loadKg: 82.5 }),
      ]),
    ).toBe('5 · 82,5 кг · 5 · 82,5 кг · 3 · 82,5 кг');
  });

  it('reads a single set plainly and counts repeated duration sets', () => {
    expect(actualLine([set({ reps: 8, loadKg: 60 })])).toBe('8 · 60 кг');
    expect(actualLine([set({ durationSeconds: 45 })])).toBe('45 с');
    expect(actualLine([set({ durationSeconds: 45 }), set({ durationSeconds: 45 })])).toBe(
      '2× 45 с',
    );
    expect(actualLine([set({ distanceMeters: 400 })])).toBe('400 м');
  });

  it('is empty when nothing numeric was recorded', () => {
    expect(actualLine([])).toBe('');
  });
});

describe('scheduleLine', () => {
  const plan: ClientAssignment = {
    id: 'as-1',
    name: 'Сила',
    description: null,
    type: 'STRENGTH',
    status: 'ACTIVE',
    startDate: '2026-08-03',
    endDate: null,
    daysOfWeek: [1, 3, 5],
    sectionCount: 2,
    exerciseCount: 7,
  };

  it('shows the days and an open-ended start', () => {
    expect(scheduleLine(plan)).toBe('Пн·Ср·Пт · з 03.08.2026');
  });

  it('shows a closed range when the plan ends', () => {
    expect(scheduleLine({ ...plan, endDate: '2026-09-27' })).toBe(
      'Пн·Ср·Пт · 03.08.2026 – 27.09.2026',
    );
  });

  it('formatShortDate flips the wire date', () => {
    expect(formatShortDate('2026-08-03')).toBe('03.08.2026');
  });
});
