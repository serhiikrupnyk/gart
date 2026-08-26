/**
 * What the public invite page may show before anyone has authenticated: enough
 * for the recipient to recognise who invited them, and nothing else. No email,
 * no client list, no account detail.
 *
 * `brandLogoUrl` does contain the trainer's opaque id, because that is how the
 * logo route scopes a lookup. It authorises nothing — no other route in the API
 * accepts a caller-supplied trainer id — and it reveals nothing `trainerName`
 * on this same payload does not already: two invites from one trainer were
 * always correlatable by the name they both carry.
 */
export interface InvitePreview {
  trainerName: string;
  clientFullName: string;
  /**
   * The inviting trainer's brand, so the first screen a client ever sees
   * already belongs to their trainer rather than to us.
   *
   * Safe on an unauthenticated page: it is the same brand every one of that
   * trainer's clients sees, and the token is what proves the visitor was
   * invited at all. Nothing about the trainer's account travels with it.
   */
  brandLogoUrl: string | null;
  brandColor: string | null;
}

export interface AcceptInviteRequest {
  token: string;
  password: string;
}
