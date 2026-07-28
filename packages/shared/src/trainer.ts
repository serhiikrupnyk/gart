/**
 * A trainer as exposed over the API. Each trainer is one-to-one with a
 * {@link PublicUser} and is the tenant that all future data hangs off.
 *
 * Optional columns are `| null` rather than `?` because that is what JSON
 * carries back from a nullable database column.
 */
export interface PublicTrainer {
  id: string;
  userId: string;
  displayName: string;
  brandName: string | null;
  brandLogoUrl: string | null;
  brandColor: string | null;
  createdAt: string;
  updatedAt: string;
}
