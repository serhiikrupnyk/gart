import type { ClientWorkoutLog } from './client-workout';
import type { PublicClient } from './client';
import type { PublicProgramExercise, WorkoutType } from './program';

/**
 * What happened to one prescribed exercise on one date. `MISSING` is the state
 * no table can hold — it is a scheduled occurrence with no record at all, so it
 * comes from expanding the schedule, not from reading logs.
 */
export const LOG_STATES = ['DONE', 'DEVIATED', 'SKIPPED', 'MISSING'] as const;
export type LogState = (typeof LOG_STATES)[number];

export const LOG_STATE_LABELS: Record<LogState, string> = {
  DONE: 'Виконано',
  DEVIATED: 'Із відхиленням',
  SKIPPED: 'Пропущено з причиною',
  MISSING: 'Без запису',
};

/** The same four shapes one level up: a whole session on one date. */
export const SESSION_STATES = ['DONE', 'PARTIAL', 'SKIPPED', 'MISSED'] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export const SESSION_STATE_LABELS: Record<SessionState, string> = {
  DONE: 'Виконано',
  PARTIAL: 'Частково',
  SKIPPED: 'Пропущено з причиною',
  MISSED: 'Не виконано',
};

/**
 * One prescribed line beside what actually happened. Both halves are the
 * shapes they already are elsewhere — the frozen snapshot as the program wire
 * shape, the record as the client's own log — so there is no third vocabulary
 * for the same facts.
 */
export interface TrainerSessionExercise {
  state: LogState;
  planned: PublicProgramExercise;
  actual: ClientWorkoutLog | null;
}

export interface TrainerWorkoutSession {
  /** (assignment, date) is the identity of a session. */
  assignmentId: string;
  date: string;
  name: string;
  type: WorkoutType;
  state: SessionState;
  /** When the client first recorded anything for this session. */
  loggedAt: string | null;
  exercises: TrainerSessionExercise[];
}

/**
 * Compliance with the schedule, counted in sessions — never a time series.
 * `done + partial + skipped + missed === scheduled`.
 */
export interface WorkoutAdherence {
  scheduled: number;
  done: number;
  partial: number;
  skipped: number;
  missed: number;
}

export interface ClientWorkoutHistory {
  from: string;
  to: string;
  adherence: WorkoutAdherence;
  /** Newest first. */
  sessions: TrainerWorkoutSession[];
}

export const HISTORY_DEFAULT_DAYS = 28;
export const HISTORY_MAX_DAYS = 92;

/** How far back the clients list looks for a reason to raise a flag. */
export const ATTENTION_WINDOW_DAYS = 14;

/** Two or more missed sessions is a pattern; one is life. */
export const ATTENTION_MISSED_THRESHOLD = 2;

/**
 * Why a client is worth opening. `SKIPPED` outranks `MISSED`: a client who
 * wrote down a reason has told their trainer something.
 */
export const ATTENTION_SIGNALS = ['SKIPPED', 'MISSED'] as const;
export type AttentionSignal = (typeof ATTENTION_SIGNALS)[number];

export const ATTENTION_LABELS: Record<AttentionSignal, string> = {
  SKIPPED: 'Пропустив вправи',
  MISSED: 'Пропущені сесії',
};

/** A client in the trainer's list, with just enough pulse to triage by. */
export interface ClientListItem extends PublicClient {
  lastLoggedAt: string | null;
  attention: AttentionSignal | null;
}
