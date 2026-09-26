import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { env } from '../config/env';
import { db } from '../db/mysql';
import { StorageAdapter, SaveFileInput, StoredFile, StoredFileStat, ReadRangeOptions } from './storage/types';
import { LocalStorageAdapter } from './storage/local-storage-adapter';
import { R2StorageAdapter } from './storage/r2-storage-adapter';

export * from './storage/types';
export { LocalStorageAdapter } from './storage/local-storage-adapter';
export { R2StorageAdapter } from './storage/r2-storage-adapter';

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
 * Sanitizes filename to prevent header injection and directory traversal
 */
export function sanitizeFileName(filename: string): string {
  if (!filename) return 'unnamed_file';
  const base = path.basename(filename);
  const sanitized = base
    .replace(/[^\w\s.-]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 150);
  return sanitized || 'unnamed_file';
}

/**
 * Extracts a safe file extension from filename or MIME type
 */
export function getSafeExtension(filename: string, mimeType?: string): string {
  const ext = path.extname(filename).toLowerCase().replace(/^\./, '');
  if (['pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'md', 'docx', 'epub'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext;
  }

  if (mimeType) {
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
    if (mimeType === 'image/webp') return 'webp';
    if (mimeType === 'text/plain') return 'txt';
    if (mimeType === 'text/markdown') return 'md';
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
    if (mimeType === 'application/epub+zip') return 'epub';
  }

  return 'bin';
}

/**
 * Computes deterministic safe user folder hash from userId
 */
export function getUserDirHash(userId: string): string {
  const salt = env.SESSION_SECRET || 'jami-user-storage-salt';
  return crypto.createHmac('sha256', salt).update(userId).digest('hex').substring(0, 16);
}

/**
 * Generates relative canonical storage key: materials/{userHash}/{materialId}/original.{safeExt}
 */
export function generateMaterialStorageKey(userId: string, materialId: string, filename: string, mimeType?: string): string {
  const userHash = getUserDirHash(userId);
  const ext = getSafeExtension(filename, mimeType);
  return `materials/${userHash}/${materialId}/original.${ext}`;
}

/**
 * Alias for backward compatibility
 */
export function generateMaterialObjectKey(userId: string, materialId: string, filename: string): string {
  return generateMaterialStorageKey(userId, materialId, filename);
}

/**
 * Generates relative canonical derived storage key: materials/{userHash}/{materialId}/derived/{name}
 */
export function generateDerivedStorageKey(userId: string, materialId: string, derivedName: string): string {
  const userHash = getUserDirHash(userId);
  const safeName = sanitizeFileName(derivedName);
  return `materials/${userHash}/${materialId}/derived/${safeName}`;
}

/**
 * Validates magic bytes of uploaded buffer against expected MIME type
 */
export function validateMagicBytes(
  buffer: Buffer,
  declaredMime?: string,
  filename?: string
): { isValid: boolean; detectedMime: string; error?: string } {
  if (!buffer || buffer.length === 0) {
    return { isValid: false, detectedMime: 'unknown', error: 'File rỗng (0 bytes).' };
  }

  // 1. Block dangerous executable headers
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return { isValid: false, detectedMime: 'application/x-dosexec', error: 'Từ chối tệp thực thi Windows (EXE/DLL).' };
  }
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return { isValid: false, detectedMime: 'application/x-elf', error: 'Từ chối tệp thực thi Linux ELF.' };
  }

  let detectedMime = 'unknown';
  let isValid = false;

  // 2. PDF check: %PDF-
  if (buffer.length >= 5 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2d) {
    detectedMime = 'application/pdf';
    isValid = true;
  }
  // 3. PNG check: \x89PNG\r\n\x1a\n
  else if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    detectedMime = 'image/png';
    isValid = true;
  }
  // 4. JPEG check: 0xFF, 0xD8, 0xFF
  else if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    detectedMime = 'image/jpeg';
    isValid = true;
  }
  // 5. WebP check: RIFF....WEBP
  else if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    detectedMime = 'image/webp';
    isValid = true;
  }
  // 6. ZIP container (EPUB / DOCX): PK\x03\x04
  else if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    const ext = filename ? path.extname(filename).toLowerCase() : '';
    if (ext === '.docx' || (declaredMime && declaredMime.includes('wordprocessingml'))) {
      detectedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (ext === '.epub' || (declaredMime && declaredMime.includes('epub'))) {
      detectedMime = 'application/epub+zip';
    } else {
      detectedMime = 'application/zip';
    }
    isValid = true;
  }
  // 7. Plain Text / Markdown: UTF-8 readable text
  else {
    const isPrintable = buffer.subarray(0, Math.min(buffer.length, 1024)).every(
      (b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 255)
    );
    if (isPrintable) {
      const ext = filename ? path.extname(filename).toLowerCase() : '';
      detectedMime = ext === '.md' || declaredMime === 'text/markdown' ? 'text/markdown' : 'text/plain';
      isValid = true;
    }
  }

  if (!isValid) {
    return { isValid: false, detectedMime: 'application/octet-stream', error: 'Định dạng tệp không được hỗ trợ.' };
  }

  // Verify declaredMime compatibility if declaredMime is specific
  if (declaredMime && declaredMime !== 'application/octet-stream' && declaredMime !== 'multipart/form-data') {
    const cleanDeclared = declaredMime.split(';')[0].trim().toLowerCase();
    if (cleanDeclared && cleanDeclared !== detectedMime) {
      const isCompat =
        (cleanDeclared === 'image/jpg' && detectedMime === 'image/jpeg') ||
        (cleanDeclared === 'image/jpeg' && detectedMime === 'image/jpg') ||
        (cleanDeclared === 'application/zip' && (detectedMime.includes('wordprocessingml') || detectedMime.includes('epub'))) ||
        (cleanDeclared === 'text/plain' && detectedMime === 'text/markdown') ||
        (cleanDeclared === 'text/markdown' && detectedMime === 'text/plain');
      if (!isCompat) {
        return {
          isValid: false,
          detectedMime,
          error: `Định dạng tệp thực tế (${detectedMime}) không khớp với loại MIME khai báo (${cleanDeclared}).`,
        };
      }
    }
  }

  return { isValid: true, detectedMime };
}

export class StorageService {
  private static instance: StorageService;
  private localAdapter: LocalStorageAdapter;
  private r2Adapter: R2StorageAdapter;
  private activeDriver: 'local' | 'r2';

  private constructor() {
    this.localAdapter = new LocalStorageAdapter();
    this.r2Adapter = new R2StorageAdapter();
    this.activeDriver = env.STORAGE_DRIVER || 'local';
  }

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  public getActiveDriver(): 'local' | 'r2' {
    return this.activeDriver;
  }

  public getAdapter(driver?: 'local' | 'r2'): StorageAdapter {
    const target = driver || this.activeDriver;
    return target === 'r2' ? this.r2Adapter : this.localAdapter;
  }

  public getLocalStorageAdapter(): LocalStorageAdapter {
    return this.localAdapter;
  }

  public getR2StorageAdapter(): R2StorageAdapter {
    return this.r2Adapter;
  }

  public getLocalRootDirectory(): string {
    return this.localAdapter.getRootDirectory();
  }

  public async putObject(
    key: string,
    body: Buffer | Readable,
    contentType: string,
    meta?: { sha256?: string; originalFilename?: string }
  ): Promise<PutObjectResult> {
    const adapter = this.getAdapter();
    const stored = await adapter.save({
      key,
      body,
      contentType,
      originalFilename: meta?.originalFilename,
    });

    return {
      key: stored.key,
      size: stored.size,
      sha256: stored.sha256,
      etag: stored.etag,
    };
  }

  public async getObject(
    key: string,
    driver?: 'local' | 'r2',
    range?: ReadRangeOptions
  ): Promise<{ body: Buffer; contentType: string; size: number; sha256?: string } | null> {
    const adapter = this.getAdapter(driver);
    try {
      const exists = await adapter.exists(key);
      if (!exists) return null;

      const st = await adapter.stat(key);
      const body = await adapter.readBuffer(key);

      return {
        body,
        contentType: st.contentType || 'application/octet-stream',
        size: st.size,
        sha256: st.sha256,
      };
    } catch {
      return null;
    }
  }

  public async headObject(key: string, driver?: 'local' | 'r2'): Promise<StorageObjectMeta | null> {
    const adapter = this.getAdapter(driver);
    try {
      const st = await adapter.stat(key);
      if (!st.exists) return null;
      return {
        key: st.key,
        size: st.size,
        contentType: st.contentType || 'application/octet-stream',
        sha256: st.sha256,
        lastModified: st.updatedAt,
      };
    } catch {
      return null;
    }
  }

  public async deleteObject(key: string, driver?: 'local' | 'r2'): Promise<void> {
    const adapter = this.getAdapter(driver);
    await adapter.delete(key);
  }

  public async deleteMaterialDirectory(relativeDir: string, driver?: 'local' | 'r2'): Promise<void> {
    const adapter = this.getAdapter(driver);
    if (adapter.deleteDirectory) {
      await adapter.deleteDirectory(relativeDir);
    }
  }

  public async getSignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number = 900
  ): Promise<{ uploadUrl: string; key: string }> {
    if (this.activeDriver === 'local') {
      // For local storage, upload URL points to server upload endpoint
      return {
        uploadUrl: `/api/v1/materials/upload`,
        key,
      };
    }

    // For R2 storage, retain presigned URL
    return {
      uploadUrl: `/api/v1/materials/upload`,
      key,
    };
  }

  public async getSignedDownloadUrl(
    key: string,
    filename: string,
    expiresInSeconds: number = 3600
  ): Promise<string> {
    // Both local and R2 read through authenticated backend API
    return `/api/v1/materials/file?key=${encodeURIComponent(key)}&filename=${encodeURIComponent(filename)}`;
  }

  /**
   * Calculates total storage used by user in bytes
   */
  public async getUserStorageUsage(userId: string): Promise<number> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        'SELECT COALESCE(SUM(size_bytes), 0) AS totalBytes FROM learning_materials WHERE user_id = ? AND deleted_at IS NULL',
        [userId]
      );
      return Number(rows?.[0]?.totalBytes) || 0;
    }
    return 0;
  }

  /**
   * Cleans up temporary files older than specified hours
   */
  public async cleanTemporaryFiles(maxAgeHours?: number): Promise<{ deletedCount: number; freedBytes: number }> {
    const hours = maxAgeHours || env.TEMP_FILE_MAX_AGE_HOURS || 24;
    const maxAgeMs = hours * 60 * 60 * 1000;
    const tempDir = path.join(this.getLocalRootDirectory(), 'temporary');

    let deletedCount = 0;
    let freedBytes = 0;

    if (!fs.existsSync(tempDir)) return { deletedCount, freedBytes };

    try {
      const files = await fs.promises.readdir(tempDir);
      const now = Date.now();

      for (const file of files) {
        if (file.startsWith('.probe-') || file === '.gitkeep') continue;
        const filePath = path.join(tempDir, file);
        try {
          const st = await fs.promises.stat(filePath);
          if (now - st.mtimeMs > maxAgeMs) {
            freedBytes += st.size;
            await fs.promises.unlink(filePath);
            deletedCount++;
          }
        } catch {
          // Ignore individual file error
        }
      }
    } catch (err: any) {
      console.warn(`[StorageService] Lỗi khi dọn dẹp thư mục tạm: ${err.message}`);
    }

    return { deletedCount, freedBytes };
  }

  /**
   * Checks health and readiness of the storage subsystem
   */
  public async checkStorageReady(): Promise<{ ready: boolean; driver: 'local' | 'r2'; details?: string; freeMb?: number }> {
    const adapter = this.getAdapter();
    if (adapter.checkHealth) {
      const res = await adapter.checkHealth();
      return {
        ready: res.ready,
        driver: this.activeDriver,
        details: res.reason,
        freeMb: res.freeBytes ? Math.round(res.freeBytes / 1024 / 1024) : undefined,
      };
    }
    return { ready: true, driver: this.activeDriver };
  }
}

export const storageService = StorageService.getInstance();
