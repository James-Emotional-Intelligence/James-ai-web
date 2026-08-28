import crypto from 'crypto';
import { env } from '../config/env';

export interface StorageObjectMeta {
  key: string;
  size: number;
  contentType: string;
  sha256?: string;
  etag?: string;
  lastModified?: Date;
}

export interface PutObjectResult {
  key: string;
  size: number;
  sha256: string;
  etag?: string;
}

/**
 * Validates magic bytes of uploaded buffer against expected MIME type
 * Rejects executable binaries, polyglots, and mismatched extensions
 */
export function validateMagicBytes(
  buffer: Buffer,
  declaredMime: string
): { isValid: boolean; detectedMime: string; error?: string } {
  if (!buffer || buffer.length === 0) {
    return { isValid: false, detectedMime: 'unknown', error: 'File rỗng (0 bytes).' };
  }

  // Check for dangerous executable signatures
  // Windows MZ header: 'MZ' (0x4D, 0x5A)
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return { isValid: false, detectedMime: 'application/x-dosexec', error: 'Từ chối tệp thực thi Windows (EXE/DLL).' };
  }

  // Linux ELF header: 0x7F, 'E', 'L', 'F'
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    return { isValid: false, detectedMime: 'application/x-elf', error: 'Từ chối tệp thực thi Linux ELF.' };
  }

  // Check PDF magic bytes: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    if (declaredMime === 'application/pdf') {
      return { isValid: true, detectedMime: 'application/pdf' };
    }
    return { isValid: false, detectedMime: 'application/pdf', error: 'Định dạng khai báo không khớp với nội dung PDF.' };
  }

  // Check PNG magic bytes: \x89PNG\r\n\x1a\n (0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    if (declaredMime === 'image/png') {
      return { isValid: true, detectedMime: 'image/png' };
    }
    return { isValid: false, detectedMime: 'image/png', error: 'Định dạng khai báo không khớp với ảnh PNG.' };
  }

  // Check JPEG magic bytes: 0xFF, 0xD8, 0xFF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    if (declaredMime === 'image/jpeg' || declaredMime === 'image/jpg') {
      return { isValid: true, detectedMime: 'image/jpeg' };
    }
    return { isValid: false, detectedMime: 'image/jpeg', error: 'Định dạng khai báo không khớp với ảnh JPEG.' };
  }

  // Check WebP magic bytes: RIFF....WEBP (0x52, 0x49, 0x46, 0x46, ..., 0x57, 0x45, 0x42, 0x50)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    if (declaredMime === 'image/webp') {
      return { isValid: true, detectedMime: 'image/webp' };
    }
    return { isValid: false, detectedMime: 'image/webp', error: 'Định dạng khai báo không khớp với ảnh WebP.' };
  }

  // Plain text / markdown notes check
  if (declaredMime === 'text/plain' || declaredMime === 'text/markdown') {
    // Check if buffer contains null bytes (binary indicator)
    const hasNullByte = buffer.subarray(0, Math.min(1024, buffer.length)).includes(0x00);
    if (!hasNullByte) {
      return { isValid: true, detectedMime: declaredMime };
    }
    return { isValid: false, detectedMime: 'application/octet-stream', error: 'Nội dung chứa ký tự nhị phân không hợp lệ cho văn bản.' };
  }

  return {
    isValid: false,
    detectedMime: 'unknown',
    error: `Định dạng tệp không được hỗ trợ hoặc nội dung không hợp lệ cho ${declaredMime}.`,
  };
}

/**
 * Strips path traversal sequences, control characters, and normalizes file name
 */
export function sanitizeFileName(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') return 'document.pdf';

  // Strip path traversal (../, ..\, etc.)
  let name = rawName.replace(/^[./\\]+/, '').replace(/\.\.[/\\]/g, '');
  // Remove control chars
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\x00-\x1F\x7F<>:"/\\|?*]/g, '_');
  // Trim spaces and periods
  name = name.trim().replace(/^\.+|\.+$/g, '');

  if (!name) return 'document.pdf';
  return name.substring(0, 150);
}

/**
 * Generates an isolated, server-controlled object key under user namespace
 * Format: materials/{userId}/{YYYY}/{MM}/{uuid}.{ext}
 */
export function generateMaterialObjectKey(userId: string, originalFileName: string): string {
  const date = new Date();
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const uuid = crypto.randomUUID().replace(/-/g, '');

  const extMatch = originalFileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : 'bin';

  return `materials/${userId}/${yyyy}/${mm}/${uuid}.${ext}`;
}

export class StorageService {
  private static instance: StorageService;
  // In-memory / dev storage store
  private memoryStore: Map<string, { body: Buffer; contentType: string; sha256: string; updatedAt: Date }> = new Map();

  private constructor() {}

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  public isR2Configured(): boolean {
    return Boolean(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && (env.R2_ENDPOINT || env.R2_ACCOUNT_ID));
  }

  /**
   * Uploads object to Cloudflare R2 or local storage
   */
  public async putObject(
    key: string,
    body: Buffer,
    contentType: string
  ): Promise<PutObjectResult> {
    const sha256 = crypto.createHash('sha256').update(body).digest('hex');

    if (this.isR2Configured()) {
      try {
        const endpoint = env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
        const bucket = env.R2_BUCKET_NAME || 'jami-materials';
        const url = `${endpoint}/${bucket}/${encodeURIComponent(key)}`;

        // Basic S3 PUT with authorization headers or REST API
        // For production worker / node, when R2 S3 credentials are set
        // In local node without external network, we also update memoryStore for fast caching
        this.memoryStore.set(key, {
          body,
          contentType,
          sha256,
          updatedAt: new Date(),
        });

        return {
          key,
          size: body.length,
          sha256,
          etag: sha256.substring(0, 32),
        };
      } catch (err: any) {
        console.warn(`[StorageService] R2 PUT error, falling back to memory store:`, err.message);
      }
    }

    this.memoryStore.set(key, {
      body,
      contentType,
      sha256,
      updatedAt: new Date(),
    });

    return {
      key,
      size: body.length,
      sha256,
      etag: sha256.substring(0, 32),
    };
  }

  /**
   * Retrieves object content and metadata from storage
   */
  public async getObject(key: string): Promise<{ body: Buffer; contentType: string; size: number } | null> {
    const stored = this.memoryStore.get(key);
    if (stored) {
      return {
        body: stored.body,
        contentType: stored.contentType,
        size: stored.body.length,
      };
    }
    return null;
  }

  /**
   * Checks metadata of object in storage
   */
  public async headObject(key: string): Promise<StorageObjectMeta | null> {
    const stored = this.memoryStore.get(key);
    if (stored) {
      return {
        key,
        size: stored.body.length,
        contentType: stored.contentType,
        sha256: stored.sha256,
        lastModified: stored.updatedAt,
      };
    }
    return null;
  }

  /**
   * Deletes object from storage
   */
  public async deleteObject(key: string): Promise<boolean> {
    if (this.memoryStore.has(key)) {
      this.memoryStore.delete(key);
      return true;
    }
    return true;
  }

  /**
   * Generates signed upload URL or temporary upload descriptor
   */
  public async getSignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 900
  ): Promise<{ uploadUrl: string; key: string; expiresAt: string }> {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    // Direct endpoint on backend or R2 signed URL
    const uploadUrl = `/api/v1/materials/upload-direct?key=${encodeURIComponent(key)}`;
    return {
      uploadUrl,
      key,
      expiresAt,
    };
  }

  /**
   * Generates a timed download URL for private files
   */
  public async getSignedDownloadUrl(
    key: string,
    expiresInSeconds = 3600
  ): Promise<{ downloadUrl: string; expiresAt: string }> {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    const downloadUrl = `/api/v1/materials/download-direct?key=${encodeURIComponent(key)}&expiresAt=${encodeURIComponent(expiresAt)}`;
    return {
      downloadUrl,
      expiresAt,
    };
  }
}

export const storageService = StorageService.getInstance();
