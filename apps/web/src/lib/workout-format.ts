import {
  DAY_OF_WEEK_LABELS,
  LOAD_UNIT_LABELS,
  type ClientAssignment,
  type ClientWorkoutExercise,
  type ClientWorkoutSection,
} from '@gart/shared';

/** Ukrainian three-form plural: 1 раунд, 2 раунди, 5 раундів (11–14 → many). */
export function pluralUk(count: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
}

export function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  if (minutes === 0) {
    return `${String(seconds)} с`;
  }
  if (seconds === 0) {
    return `${String(minutes)} хв`;
  }

  return `${String(minutes)} хв ${String(seconds)} с`;
}

/** Ukrainian decimal comma: 82.5 → «82,5». */
function formatNumber(value: number): string {
  return String(value).replace('.', ',');
}

function formatDistance(meters: number): string {
  if (meters >= 1000 && meters % 100 === 0) {
    return `${formatNumber(meters / 1000)} км`;
  }

  return `${String(meters)} м`;
}

function formatLoad(line: ClientWorkoutExercise): string | null {
  if (line.loadText !== null) {
    return line.loadText;
  }
  if (line.loadValue === null || line.loadUnit === null) {
    return null;
  }

  const value = formatNumber(line.loadValue);

  // «RPE 8» reads as coaches say it; the other units follow the number.
  return line.loadUnit === 'RPE' ? `RPE ${value}` : `${value} ${LOAD_UNIT_LABELS[line.loadUnit]}`;
}

/** «5×5 · 82,5 кг · відпочинок 90 с» — the big line on the exercise card. */
export function prescriptionLine(line: ClientWorkoutExercise): string {
  const parts: string[] = [];

  if (line.sets !== null && line.reps !== null) {
    parts.push(`${String(line.sets)}×${String(line.reps)}`);
  } else if (line.sets !== null) {
    parts.push(`${String(line.sets)} ${pluralUk(line.sets, 'підхід', 'підходи', 'підходів')}`);
  } else if (line.reps !== null) {
    parts.push(
      `${String(line.reps)} ${pluralUk(line.reps, 'повторення', 'повторення', 'повторень')}`,
    );
  }

  if (line.durationSeconds !== null) {
    parts.push(formatSeconds(line.durationSeconds));
  }
  if (line.distanceMeters !== null) {
    parts.push(formatDistance(line.distanceMeters));
  }

  const load = formatLoad(line);

  if (load !== null) {
    parts.push(load);
  }
  if (line.tempo !== null) {
    parts.push(`темп ${line.tempo}`);
  }
  if (line.restSeconds !== null) {
    parts.push(`відпочинок ${formatSeconds(line.restSeconds)}`);
  }

  return parts.join(' · ');
}

/** «ліміт 12 хв · 3 раунди» — the section's format summary, null when plain. */
export function sectionConfigLine(section: ClientWorkoutSection): string | null {
  const parts: string[] = [];

  if (section.timeCapSeconds !== null) {
    parts.push(`ліміт ${formatSeconds(section.timeCapSeconds)}`);
  }
  if (section.intervalSeconds !== null) {
    parts.push(`кожні ${formatSeconds(section.intervalSeconds)}`);
  }
  if (section.rounds !== null) {
    parts.push(
      `${String(section.rounds)} ${pluralUk(section.rounds, 'раунд', 'раунди', 'раундів')}`,
    );
  }
  if (section.restBetweenRoundsSeconds !== null) {
    parts.push(`відпочинок між раундами ${formatSeconds(section.restBetweenRoundsSeconds)}`);
  }

  return parts.length === 0 ? null : parts.join(' · ');
}

export function formatShortDate(value: string): string {
  const [year, month, day] = value.split('-');

  return `${day ?? ''}.${month ?? ''}.${year ?? ''}`;
}

/** «Пн·Ср·Пт · з 03.08.2026» — the plan card's schedule line. */
export function scheduleLine(assignment: ClientAssignment): string {
  const days = assignment.daysOfWeek.map((day) => DAY_OF_WEEK_LABELS[day]).join('·');
  const range =
    assignment.endDate === null
      ? `з ${formatShortDate(assignment.startDate)}`
      : `${formatShortDate(assignment.startDate)} – ${formatShortDate(assignment.endDate)}`;

  return `${days} · ${range}`;
}
