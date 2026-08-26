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

  /**
   * The whole object, for the one asset Gart serves itself: a brand logo.
   *
   * The rule above — bytes never stream through the API — was written about
   * exercise video, where every view re-streams tens of megabytes. A logo is
   * capped at 256 KB and its URL carries a random segment that changes on every
   * upload, so it is served with immutable caching and fetched once per version
   * per device. Presigning it instead would cost an API round trip before the
   * image could even start loading, on every single shell mount, and would
   * defeat browser caching entirely because the signed URL changes each time.
   *
   * `maxBytes` is required rather than optional. This buffers the whole object
   * in memory, and the reason it is safe today — a 256 KB logo — is a property
   * of the only caller, not of the method. Making the cap part of the signature
   * means the first caller that points this at an exercise video has to say so.
   * Anything larger reports null rather than being truncated, because half an
   * image is not an image.
   */
  abstract read(key: string, maxBytes: number): Promise<Buffer | null>;

  abstract delete(key: string): Promise<void>;
}
