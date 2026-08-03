export const NOTIFICATION_TYPES = [
  'WORKOUT_LOGGED',
  'EXERCISE_SKIPPED',
  'PROGRESS_LOGGED',
  'HABIT_STREAK',
  'ASSIGNMENT_CREATED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * One thing that happened. For a trainer this list IS the client activity
 * feed — «client X did Y» is exactly what a notification is for them.
 */
export interface PublicNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** The client it concerns, so the trainer's feed can link to them. */
  clientId: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationList {
  items: PublicNotification[];
  total: number;
  unreadCount: number;
}

export const NOTIFICATIONS_PER_PAGE = 20;

/** The browser's own subscription, as PushManager hands it over. */
export interface PushSubscriptionRequest {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

export interface UnsubscribePushRequest {
  endpoint: string;
}

export interface PushPublicKeyResponse {
  publicKey: string;
}

/** Habit streaks worth a congratulation, rather than every daily tick. */
export const HABIT_STREAK_MILESTONES = [7, 30, 100];
