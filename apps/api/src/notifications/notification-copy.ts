import type { NotificationType } from '@gart/shared';

/**
 * Every notification's Ukrainian wording, in one place. Call sites pass facts;
 * this decides how they read.
 *
 * The phrasing is deliberately gender-neutral — we do not know whether a client
 * is «записав» or «записала», so the client's name is the title and the event
 * is a noun phrase in the body. That reads well in a feed too: the name scans
 * first.
 */
export const TRAINER_EVENT_TEXT: Record<NotificationType, string> = {
  WORKOUT_LOGGED: 'Запис тренування',
  EXERCISE_SKIPPED: 'Пропуск вправи',
  PROGRESS_LOGGED: 'Новий замір',
  HABIT_STREAK: 'Серія звички',
  ASSIGNMENT_CREATED: 'Нова програма',
  CLIENT_INACTIVE: 'Немає активності',
  TRAINER_MESSAGE: 'Повідомлення',
  CHAT_MESSAGE: 'Повідомлення',
  SUBSCRIPTION_PAST_DUE: 'Підписка: оплата не пройшла',
  SUBSCRIPTION_ENDED: 'Підписку призупинено',
};

export function trainerBody(type: NotificationType, detail: string | null): string {
  return detail === null ? TRAINER_EVENT_TEXT[type] : `${TRAINER_EVENT_TEXT[type]}: ${detail}`;
}
