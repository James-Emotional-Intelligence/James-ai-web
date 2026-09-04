import crypto from 'crypto';
import { Readable } from 'stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { StorageAdapter, SaveFileInput, StoredFile, StoredFileStat, ReadRangeOptions } from './types';
import { env } from '../../config/env';

export class R2StorageAdapter implements StorageAdapter {
  public readonly driverName = 'r2' as const;
  private s3Client: S3Client | null = null;
  private bucketName: string;
  private demoStore: Map<string, { buffer: Buffer; contentType: string; updatedAt: Date }> = new Map();

  constructor() {
    this.bucketName = env.R2_BUCKET_NAME || 'jami-materials';
    this.initClient();
  }

  private initClient() {
    if (env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
      const endpoint = env.R2_ENDPOINT || (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      });
    }
  }

  public isConfigured(): boolean {
    return this.s3Client !== null;
  }

  public async save(input: SaveFileInput): Promise<StoredFile> {
    let buffer: Buffer;
    if (input.body) {
      if (Buffer.isBuffer(input.body)) {
        buffer = input.body;
      } else {
        const chunks: Buffer[] = [];
        const readable = input.body as Readable;
        for await (const chunk of readable) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        buffer = Buffer.concat(chunks);
      }
    } else if (input.filePath) {
      const fs = await import('fs');
      try {
        buffer = await fs.promises.readFile(input.filePath);
      } finally {
        if (input.filePath.includes('temporary') || input.filePath.includes('tmp') || input.filePath.includes('upload_')) {
          await fs.promises.unlink(input.filePath).catch(() => {});
        }
      }
    } else {
      throw new Error('[R2StorageAdapter] save() yêu cầu body hoặc filePath.');
    }

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    if (this.s3Client) {
      const res = await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: input.key,
          Body: buffer,
          ContentType: input.contentType,
          Metadata: {
            sha256,
            originalFilename: input.originalFilename ? encodeURIComponent(input.originalFilename) : '',
          },
        })
      );

      return {
        key: input.key,
        size: buffer.length,
        sha256,
        contentType: input.contentType,
        etag: res.ETag,
      };
    }

    // In-memory fallback
    this.demoStore.set(input.key, {
      buffer,
      contentType: input.contentType,
      updatedAt: new Date(),
    });

    return {
      key: input.key,
      size: buffer.length,
      sha256,
      contentType: input.contentType,
      etag: `"${sha256.substring(0, 16)}"`,
    };
  }

  public async createReadStream(key: string, options?: ReadRangeOptions): Promise<Readable> {
    if (this.s3Client) {
      const rangeHeader =
        options && (options.start !== undefined || options.end !== undefined)
          ? `bytes=${options.start ?? 0}-${options.end ?? ''}`
          : undefined;

      const res = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Range: rangeHeader,
        })
      );

      if (!res.Body) {
        throw new Error(`[R2StorageAdapter] Object body is empty for key: ${key}`);
      }

      return res.Body as Readable;
    }

    const item = this.demoStore.get(key);
    if (!item) {
      throw new Error(`[R2StorageAdapter] Object not found in demo store: ${key}`);
    }

    let slice = item.buffer;
    if (options && (options.start !== undefined || options.end !== undefined)) {
      const start = options.start ?? 0;
      const end = options.end !== undefined ? options.end + 1 : item.buffer.length;
      slice = item.buffer.subarray(start, end);
    }

    return Readable.from(slice);
  }

  public async readBuffer(key: string): Promise<Buffer> {
    if (this.s3Client) {
      const res = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        })
      );

      if (!res.Body) {
        throw new Error(`[R2StorageAdapter] Object body is empty for key: ${key}`);
      }

      const chunks: Buffer[] = [];
      const stream = res.Body as Readable;
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }

    const item = this.demoStore.get(key);
    if (!item) {
      throw new Error(`[R2StorageAdapter] Object not found in demo store: ${key}`);
    }
    return item.buffer;
  }

  public async stat(key: string): Promise<StoredFileStat> {
    if (this.s3Client) {
      try {
        const res = await this.s3Client.send(
          new HeadObjectCommand({
            Bucket: this.bucketName,
            Key: key,
          })
        );

        return {
          key,
          size: res.ContentLength || 0,
          contentType: res.ContentType,
          sha256: res.Metadata?.sha256,
          updatedAt: res.LastModified,
          exists: true,
        };
      } catch {
        return { key, size: 0, exists: false };
      }
    }

    const item = this.demoStore.get(key);
    if (!item) {
      return { key, size: 0, exists: false };
    }

    return {
      key,
      size: item.buffer.length,
      contentType: item.contentType,
      updatedAt: item.updatedAt,
      exists: true,
    };
  }

  public async exists(key: string): Promise<boolean> {
    const st = await this.stat(key);
    return st.exists;
  }

  public async delete(key: string): Promise<void> {
    if (this.s3Client) {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        })
      );
      return;
    }

    this.demoStore.delete(key);
  }

  public async checkHealth(): Promise<{ ready: boolean; reason?: string }> {
    if (!this.s3Client) {
      return { ready: false, reason: 'Cloudflare R2 credentials are not configured.' };
    }
    const probeKey = `temporary/.health-probe-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: probeKey,
          Body: 'JAMI_R2_HEALTH_PROBE',
        })
      );
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: probeKey,
        })
      );
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: probeKey,
        })
      );
      return { ready: true };
    } catch (err: any) {
      return { ready: false, reason: `R2 connection probe failed: ${err.message}` };
    }
  }
}
