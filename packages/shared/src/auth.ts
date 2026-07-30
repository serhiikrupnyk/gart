import type { PublicTrainer } from './trainer';
import type { PublicUser } from './user';

/**
 * What every authenticated endpoint returns: who is signed in, and which tenant
 * they act as. The session token itself is never part of a response body — it
 * only ever travels in an httpOnly cookie.
 */
export interface AuthSession {
  user: PublicUser;
  trainer: PublicTrainer;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}
