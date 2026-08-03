import type { ClientWorkoutExercise } from '@gart/shared';

import { hasDimensions, logDimensions, prefillSets } from '@/lib/log-draft';
import { isWithinLogWindow } from '@/lib/dates';

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

describe('prefillSets', () => {
  it('turns a 5×5 @ 82,5 кг prescription into five identical sets', () => {
    expect(prefillSets(line({ sets: 5, reps: 5, loadValue: 82.5, loadUnit: 'KG' }))).toEqual(
      Array.from({ length: 5 }, () => ({
        reps: 5,
        loadKg: 82.5,
        durationSeconds: null,
        distanceMeters: null,
      })),
    );
  });

  it('leaves load empty when the prescription was not in kilograms', () => {
    expect(prefillSets(line({ sets: 3, reps: 3, loadValue: 8, loadUnit: 'RPE' }))[0]).toEqual({
      reps: 3,
      loadKg: null,
      durationSeconds: null,
      distanceMeters: null,
    });
    expect(prefillSets(line({ reps: 6, loadValue: 75, loadUnit: 'PERCENT_1RM' }))[0]?.loadKg).toBe(
      null,
    );
  });

  it('makes one set when no count was prescribed', () => {
    expect(prefillSets(line({ durationSeconds: 40 }))).toEqual([
      { reps: null, loadKg: null, durationSeconds: 40, distanceMeters: null },
    ]);
    expect(prefillSets(line({ distanceMeters: 400 }))).toHaveLength(1);
  });

  it('clamps to the API limit even when more sets were prescribed', () => {
    expect(prefillSets(line({ sets: 100, reps: 1 }))).toHaveLength(50);
  });

  it('records nothing numeric when the trainer prescribed nothing numeric', () => {
    expect(prefillSets(line())).toEqual([]);
    expect(hasDimensions(logDimensions(line()))).toBe(false);
  });
});

describe('logDimensions', () => {
  it('offers exactly the fields the prescription used', () => {
    expect(logDimensions(line({ sets: 5, reps: 5, loadValue: 82.5, loadUnit: 'KG' }))).toEqual({
      reps: true,
      load: true,
      duration: false,
      distance: false,
    });
    expect(logDimensions(line({ durationSeconds: 40 }))).toEqual({
      reps: false,
      load: false,
      duration: true,
      distance: false,
    });
  });

  it('offers a weight field when the load was described in words', () => {
    expect(logDimensions(line({ reps: 10, loadText: 'з гантелями' })).load).toBe(true);
  });
});

describe('isWithinLogWindow', () => {
  const today = new Date(2026, 7, 6);

  it('accepts today and the fourteen days before it', () => {
    expect(isWithinLogWindow(new Date(2026, 7, 6), today)).toBe(true);
    expect(isWithinLogWindow(new Date(2026, 6, 23), today)).toBe(true);
  });

  it('refuses the future and anything older than the window', () => {
    expect(isWithinLogWindow(new Date(2026, 7, 7), today)).toBe(false);
    expect(isWithinLogWindow(new Date(2026, 6, 22), today)).toBe(false);
  });
});
