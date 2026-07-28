/**
 * A user as exposed over the API.
 *
 * Timestamps are ISO 8601 strings, not `Date`: this is the shape that survives
 * JSON, which is what the web client actually receives. Anything secret — the
 * password hash the auth step will add, for one — must never appear here.
 */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
