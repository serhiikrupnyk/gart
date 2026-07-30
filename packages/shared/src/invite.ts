/**
 * What the public invite page may show before anyone has authenticated: enough
 * for the recipient to recognise who invited them, and nothing else. No email,
 * no ids, no client list.
 */
export interface InvitePreview {
  trainerName: string;
  clientFullName: string;
}

export interface AcceptInviteRequest {
  token: string;
  password: string;
}
