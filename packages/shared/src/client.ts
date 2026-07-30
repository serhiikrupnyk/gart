/**
 * INVITED — created by the trainer, has not accepted yet.
 * ACTIVE   — accepted their invite and has an account.
 * ARCHIVED — no longer coached; kept so history is not lost.
 */
export type ClientStatus = 'INVITED' | 'ACTIVE' | 'ARCHIVED';

/**
 * A client as exposed to their trainer.
 *
 * `trainerId` is deliberately absent: the only caller who can read this is the
 * trainer it belongs to, so echoing the tenant id back would add nothing but a
 * way to leak it.
 */
export interface PublicClient {
  id: string;
  fullName: string;
  email: string;
  status: ClientStatus;
  /**
   * Whether the client has accepted an invite and has an account. Exposed as a
   * boolean rather than the linked user id, which the trainer has no use for —
   * it is what tells the UI whether restoring from the archive should return
   * them to ACTIVE or back to INVITED.
   */
  hasAccount: boolean;
  invitedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * The response to creating a client or regenerating their invite. `inviteUrl`
 * contains the raw token and is the only time it is ever readable — it is not
 * stored and cannot be retrieved again.
 */
export interface ClientWithInvite {
  client: PublicClient;
  inviteUrl: string;
}

export interface CreateClientRequest {
  fullName: string;
  email: string;
}

export interface UpdateClientRequest {
  fullName?: string;
  status?: ClientStatus;
}
