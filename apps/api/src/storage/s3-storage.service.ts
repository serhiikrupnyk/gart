import { Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { requireEnv } from '../env';
import {
  PRESIGNED_GET_TTL_SECONDS,
  PRESIGNED_PUT_TTL_SECONDS,
  type PresignedUrl,
  StorageService,
  type StoredObject,
} from './storage.service';

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: unknown }).name;

  return name === 'NotFound' || name === 'NoSuchKey' || name === '404';
}

/**
 * Any S3-compatible store: MinIO in dev, ideally an egress-free provider
 * (R2/B2-class) in production — egress, not storage, is where video costs live.
 *
 * The client is built lazily so the API boots without storage configuration;
 * the env is only consulted once media is actually touched.
 */
@Injectable()
export class S3StorageService extends StorageService {
  private client: S3Client | undefined;
  private bucket = '';

  async presignPut(key: string, contentType: string, sizeBytes: number): Promise<PresignedUrl> {
    const command = new PutObjectCommand({
      Bucket: this.requireBucket(),
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    });

    // Forcing content-type and content-length into the signed headers (rather
    // than letting the presigner hoist them) is what makes the constraints
    // real: an upload with a different type or size fails the signature check
    // at the storage layer, before any of our code runs. Verified live against
    // MinIO with deliberately mismatched uploads.
    const url = await getSignedUrl(this.requireClient(), command, {
      expiresIn: PRESIGNED_PUT_TTL_SECONDS,
      signableHeaders: new Set(['content-type', 'content-length']),
      unhoistableHeaders: new Set(['content-type', 'content-length']),
    });

    return { url, expiresAt: new Date(Date.now() + PRESIGNED_PUT_TTL_SECONDS * 1000) };
  }

  async presignGet(key: string): Promise<PresignedUrl> {
    const command = new GetObjectCommand({ Bucket: this.requireBucket(), Key: key });
    const url = await getSignedUrl(this.requireClient(), command, {
      expiresIn: PRESIGNED_GET_TTL_SECONDS,
    });

    return { url, expiresAt: new Date(Date.now() + PRESIGNED_GET_TTL_SECONDS * 1000) };
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const response = await this.requireClient().send(
        new HeadObjectCommand({ Bucket: this.requireBucket(), Key: key }),
      );

      return {
        contentType: response.ContentType ?? 'application/octet-stream',
        sizeBytes: Number(response.ContentLength ?? 0),
      };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async readHead(key: string, length: number): Promise<Buffer | null> {
    try {
      const response = await this.requireClient().send(
        new GetObjectCommand({
          Bucket: this.requireBucket(),
          Key: key,
          Range: `bytes=0-${String(length - 1)}`,
        }),
      );
      const bytes = await response.Body?.transformToByteArray();

      return bytes === undefined ? null : Buffer.from(bytes);
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async read(key: string, maxBytes: number): Promise<Buffer | null> {
    try {
      const response = await this.requireClient().send(
        new GetObjectCommand({
          Bucket: this.requireBucket(),
          Key: key,
          // One byte past the cap, so an object that exceeds it is DETECTED
          // rather than silently truncated — and never fully transferred.
          Range: `bytes=0-${String(maxBytes)}`,
        }),
      );
      const bytes = await response.Body?.transformToByteArray();

      if (bytes === undefined || bytes.length > maxBytes) {
        return null;
      }

      return Buffer.from(bytes);
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.requireClient().send(
      new DeleteObjectCommand({ Bucket: this.requireBucket(), Key: key }),
    );
  }

  private requireClient(): S3Client {
    this.client ??= new S3Client({
      endpoint: requireEnv('STORAGE_ENDPOINT'),
      region: requireEnv('STORAGE_REGION'),
      credentials: {
        accessKeyId: requireEnv('STORAGE_ACCESS_KEY'),
        secretAccessKey: requireEnv('STORAGE_SECRET_KEY'),
      },
      // MinIO and most self-hosted S3s route by path, not subdomain.
      forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
    });

    return this.client;
  }

  private requireBucket(): string {
    if (this.bucket === '') {
      this.bucket = requireEnv('STORAGE_BUCKET');
    }

    return this.bucket;
  }
}
