/** A signed URL together with the moment it stops working. */
export interface PresignedUrl {
  url: string;
  expiresAt: Date;
}

/** What HEAD reveals about a stored object. */
export interface StoredObject {
  contentType: string;
  sizeBytes: number;
}

export const PRESIGNED_PUT_TTL_SECONDS = 10 * 60;
export const PRESIGNED_GET_TTL_SECONDS = 10 * 60;

/**
 * The storage contract — and the DI token. The runtime binding is the
 * S3-compatible implementation; tests bind an in-memory fake, so nothing in a
 * test run ever needs a real bucket.
 *
 * The abstraction is deliberately narrow: five verbs, no streams through the
 * API. Bytes travel between the browser and storage directly via the presigned
 * URLs; the API only ever reads a handful of leading bytes to verify magic
 * numbers.
 */
export abstract class StorageService {
  /**
   * A short-lived PUT URL for exactly this key, content type and byte count —
   * all three are part of the signature, so storage itself rejects an upload
   * that deviates from what was authorised.
   */
  abstract presignPut(key: string, contentType: string, sizeBytes: number): Promise<PresignedUrl>;

  /** A short-lived GET URL, minted per request; never a permanent public link. */
  abstract presignGet(key: string): Promise<PresignedUrl>;

  /** Metadata if the object exists, null otherwise. */
  abstract head(key: string): Promise<StoredObject | null>;

  /** The object's first `length` bytes, for magic-number verification. */
  abstract readHead(key: string, length: number): Promise<Buffer | null>;

  abstract delete(key: string): Promise<void>;
}
