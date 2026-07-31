import { BadRequestException } from '@nestjs/common';

import type { ProgramExerciseDto, ProgramSectionDto } from './dto/program-tree.dto';

/**
 * The per-type structure rules — the whole table in one place, unit-tested:
 *
 *              timeCapSeconds   intervalSeconds   rounds
 *   AMRAP      required         forbidden         forbidden (rounds are the score)
 *   EMOM       forbidden        required          required (total intervals)
 *   CIRCUIT    forbidden        forbidden         required
 *   others     forbidden        forbidden         optional (8×400 м is rounds too)
 *
 * restBetweenRoundsSeconds only makes sense alongside rounds. Prescription
 * fields on exercises are deliberately NOT legislated per type — a strength
 * section legitimately holds a timed plank — except load coherence: a number
 * needs a unit, text excludes both.
 */
export function validateProgramTree(sections: ProgramSectionDto[]): void {
  sections.forEach(validateSection);
}

function fail(message: string): never {
  throw new BadRequestException(message);
}

function validateSection(section: ProgramSectionDto): void {
  const has = {
    timeCap: section.timeCapSeconds != null,
    interval: section.intervalSeconds != null,
    rounds: section.rounds != null,
    restBetween: section.restBetweenRoundsSeconds != null,
  };

  switch (section.type) {
    case 'AMRAP':
      if (!has.timeCap) fail('Секція AMRAP потребує ліміту часу');
      if (has.interval || has.rounds) {
        fail('Секція AMRAP не може мати інтервалу або кількості раундів');
      }
      break;
    case 'EMOM':
      if (!has.interval || !has.rounds) {
        fail('Секція EMOM потребує інтервалу та кількості раундів');
      }
      if (has.timeCap) fail('Секція EMOM не може мати ліміту часу');
      break;
    case 'CIRCUIT':
      if (!has.rounds) fail('Кругова секція потребує кількості раундів');
      if (has.timeCap || has.interval) {
        fail('Кругова секція не може мати ліміту часу або інтервалу');
      }
      break;
    default:
      // STRENGTH / RUNNING / CUSTOM: rounds optionally repeat the section.
      if (has.timeCap || has.interval) {
        fail('Ліміт часу та інтервал доступні лише для AMRAP та EMOM');
      }
  }

  if (has.restBetween && !has.rounds) {
    fail('Відпочинок між раундами потребує кількості раундів');
  }

  section.exercises.forEach(validateLoad);
}

function validateLoad(exercise: ProgramExerciseDto): void {
  const hasValue = exercise.loadValue != null;
  const hasUnit = exercise.loadUnit != null;
  const hasText = exercise.loadText != null;

  if (hasValue !== hasUnit) {
    fail('Числове навантаження потребує одиниці виміру');
  }

  if (hasText && (hasValue || hasUnit)) {
    fail('Текстове навантаження не поєднується з числовим');
  }
}
