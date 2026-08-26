import type { PublicClient } from './client';
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

/**
 * The slice of a trainer their client is allowed to see: enough to brand the
 * client app, nothing about the business behind it.
 *
 * `brandColor` is DECORATIVE ONLY. A trainer picks it, so it cannot be
 * contrast-verified, and it is therefore never allowed to carry text or to
 * become a ground that text sits on — see the client shell, where it appears
 * only as marks and rules beside AA-checked labels.
 */
export interface TrainerBrand {
  displayName: string;
  brandName: string | null;
  brandLogoUrl: string | null;
  brandColor: string | null;
}

/** The client-context counterpart of {@link AuthSession}. */
export interface ClientSession {
  client: PublicClient;
  trainer: TrainerBrand;
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
