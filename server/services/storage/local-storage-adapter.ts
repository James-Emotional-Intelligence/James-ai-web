import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { StorageAdapter, SaveFileInput, StoredFile, StoredFileStat, ReadRangeOptions } from './types';
import { env } from '../../config/env';

export class LocalStorageAdapter implements StorageAdapter {
  public readonly driverName = 'local' as const;
  private rootDir: string;
  private initialized = false;

  constructor(customRoot?: string) {
    const rawRoot = customRoot || env.LOCAL_STORAGE_ROOT || './storage';
    this.rootDir = path.resolve(process.cwd(), rawRoot);
  }

  public getRootDirectory(): string {
    return this.rootDir;
  }

  public async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    const dirs = [
      this.rootDir,
      path.join(this.rootDir, 'materials'),
      path.join(this.rootDir, 'temporary'),
      path.join(this.rootDir, 'quarantine'),
      path.join(this.rootDir, 'processing'),
    ];

    for (const d of dirs) {
      if (!fs.existsSync(d)) {
        await fs.promises.mkdir(d, { recursive: true });
      }
    }

    this.initialized = true;
  }

  /**
   * Resolves a key to an absolute path inside rootDir with strict path traversal checks
   */
  public resolveSafePath(relativeKey: string): string {
    if (!relativeKey || typeof relativeKey !== 'string') {
      throw new Error('[LocalStorage] Khóa lưu trữ không hợp lệ (chuỗi rỗng hoặc sai kiểu dữ liệu).');
    }

    // 1. Block null bytes and control characters
    for (let i = 0; i < relativeKey.length; i++) {
      const code = relativeKey.charCodeAt(i);
      if (code < 32 || code === 127) {
        throw new Error('[LocalStorage: SECURITY] Phát hiện ký tự không hợp lệ trong khóa lưu trữ.');
      }
    }

    // 2. Decode URL encoding (support double-decode for %252e%252e)
    let decodedKey = relativeKey;
    for (let i = 0; i < 3; i++) {
      try {
        const next = decodeURIComponent(decodedKey);
        if (next === decodedKey) break;
        decodedKey = next;
      } catch {
        break;
      }
    }

    // 3. Reject POSIX absolute path, Windows drive path, UNC path, backslash prefixes
    if (
      relativeKey.startsWith('/') ||
      relativeKey.startsWith('\\') ||
      /^[a-zA-Z]:/i.test(relativeKey) ||
      relativeKey.startsWith('//') ||
      relativeKey.startsWith('\\\\') ||
      decodedKey.startsWith('/') ||
      decodedKey.startsWith('\\') ||
      /^[a-zA-Z]:/i.test(decodedKey) ||
      decodedKey.startsWith('//') ||
      decodedKey.startsWith('\\\\')
    ) {
      throw new Error(`[LocalStorage: SECURITY] Từ chối đường dẫn tuyệt đối hoặc UNC path: ${relativeKey}`);
    }

    // 4. Reject explicit traversal segments before normalization
    if (
      decodedKey.includes('../') ||
      decodedKey.includes('..\\') ||
      decodedKey === '..' ||
      decodedKey.endsWith('/..') ||
      decodedKey.endsWith('\\..')
    ) {
      throw new Error(`[LocalStorage: SECURITY] Phát hiện hành vi path traversal trái phép: ${relativeKey}`);
    }

    // 5. Normalize slashes
    const normalizedKey = decodedKey.replace(/\\/g, '/');

    // 6. Resolve absolute path within rootDir
    const resolvedPath = path.resolve(this.rootDir, normalizedKey);

    // 7. Ensure path strictly resides within rootDir
    const relativeToRoot = path.relative(this.rootDir, resolvedPath);
    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot) || relativeToRoot === '') {
      throw new Error(`[LocalStorage: SECURITY] Phát hiện hành vi path traversal trái phép: ${relativeKey}`);
    }

    return resolvedPath;
  }

  public async save(input: SaveFileInput): Promise<StoredFile> {
    await this.ensureInitialized();
    const targetPath = this.resolveSafePath(input.key);
    const targetDir = path.dirname(targetPath);

    if (!fs.existsSync(targetDir)) {
      await fs.promises.mkdir(targetDir, { recursive: true });
    }

    let finalSize: number;
    let sha256: string;

    if (input.filePath) {
      // Source file from disk (e.g. uploaded temporary file)
      const sourcePath = path.resolve(input.filePath);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`[LocalStorage] File nguồn không tồn tại: ${input.filePath}`);
      }

      // Compute SHA-256 and size from source
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(sourcePath);
      let bytesCount = 0;

      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk) => {
          bytesCount += chunk.length;
          hash.update(chunk);
        });
        stream.on('end', () => resolve());
        stream.on('error', reject);
      });

      sha256 = hash.digest('hex');
      finalSize = bytesCount;

      // Attempt atomic rename
      try {
        await fs.promises.rename(sourcePath, targetPath);
      } catch (err: any) {
        // If EXDEV (cross-device link), fallback to copy + unlink
        if (err.code === 'EXDEV' || err.code === 'EPERM') {
          await fs.promises.copyFile(sourcePath, targetPath);
          await fs.promises.unlink(sourcePath).catch(() => {});
        } else {
          throw err;
        }
      }
    } else if (input.body) {
      if (Buffer.isBuffer(input.body)) {
        finalSize = input.body.length;
        sha256 = crypto.createHash('sha256').update(input.body).digest('hex');
        await fs.promises.writeFile(targetPath, input.body);
      } else if (typeof (input.body as any).pipe === 'function') {
        const hash = crypto.createHash('sha256');
        const writeStream = fs.createWriteStream(targetPath);
        let bytesCount = 0;

        await new Promise<void>((resolve, reject) => {
          const readable = input.body as Readable;
          readable.on('data', (chunk) => {
            bytesCount += chunk.length;
            hash.update(chunk);
          });
          readable.pipe(writeStream);
          writeStream.on('finish', () => resolve());
          writeStream.on('error', reject);
          readable.on('error', reject);
        });

        finalSize = bytesCount;
        sha256 = hash.digest('hex');
      } else {
        throw new Error('[LocalStorage] Định dạng input.body không được hỗ trợ (phải là Buffer hoặc Readable stream).');
      }
    } else {
      throw new Error('[LocalStorage] save() yêu cầu body hoặc filePath.');
    }

    return {
      key: input.key,
      size: finalSize,
      sha256,
      contentType: input.contentType,
      etag: `"${sha256.substring(0, 16)}"`,
    };
  }

  public async createReadStream(key: string, options?: ReadRangeOptions): Promise<Readable> {
    await this.ensureInitialized();
    const targetPath = this.resolveSafePath(key);

    if (!fs.existsSync(targetPath)) {
      throw new Error(`[LocalStorage] Không tìm thấy tệp lưu trữ: ${key}`);
    }

    // Verify realpath does not escape root (symlink defense)
    const realPath = await fs.promises.realpath(targetPath);
    const realRoot = await fs.promises.realpath(this.rootDir).catch(() => this.rootDir);
    if (!realPath.startsWith(realRoot)) {
      throw new Error(`[LocalStorage: SECURITY] Symlink escape detected for key: ${key}`);
    }

    if (options && (options.start !== undefined || options.end !== undefined)) {
      return fs.createReadStream(targetPath, {
        start: options.start,
        end: options.end,
      });
    }

    return fs.createReadStream(targetPath);
  }

  public async readBuffer(key: string): Promise<Buffer> {
    await this.ensureInitialized();
    const targetPath = this.resolveSafePath(key);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`[LocalStorage] Không tìm thấy tệp lưu trữ: ${key}`);
    }
    return fs.promises.readFile(targetPath);
  }

  public async stat(key: string): Promise<StoredFileStat> {
    await this.ensureInitialized();
    const targetPath = this.resolveSafePath(key);
    try {
      if (!fs.existsSync(targetPath)) {
        return { key, size: 0, exists: false };
      }
      const st = await fs.promises.stat(targetPath);
      return {
        key,
        size: st.size,
        exists: true,
        updatedAt: st.mtime,
      };
    } catch {
      return { key, size: 0, exists: false };
    }
  }

  public async exists(key: string): Promise<boolean> {
    const st = await this.stat(key);
    return st.exists;
  }

  public async delete(key: string): Promise<void> {
    await this.ensureInitialized();
    try {
      const targetPath = this.resolveSafePath(key);
      if (fs.existsSync(targetPath)) {
        const st = await fs.promises.stat(targetPath);
        if (st.isDirectory()) {
          throw new Error('[LocalStorage] Không thể dùng delete() trên thư mục. Hãy dùng deleteDirectory().');
        }
        await fs.promises.unlink(targetPath);
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  /**
   * Safely deletes an entire material directory (e.g. materials/{userHash}/{materialId})
   * Strictly prevents deleting user root or materials root
   */
  public async deleteDirectory(relativeDir: string): Promise<void> {
    await this.ensureInitialized();
    const normalized = relativeDir.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
    const parts = normalized.split('/');

    // Require at least: materials / {userHash} / {materialId} (3 segments)
    if (parts.length < 3 || parts[0] !== 'materials') {
      throw new Error(`[LocalStorage: SECURITY] Từ chối xóa thư mục không an toàn: ${relativeDir}. Yêu cầu đường dẫn dạng materials/{userHash}/{materialId}`);
    }

    const targetPath = this.resolveSafePath(normalized);
    if (fs.existsSync(targetPath)) {
      await fs.promises.rm(targetPath, { recursive: true, force: true });
    }
  }

  public async move(sourceKey: string, destinationKey: string): Promise<void> {
    await this.ensureInitialized();
    const srcPath = this.resolveSafePath(sourceKey);
    const destPath = this.resolveSafePath(destinationKey);

    if (!fs.existsSync(srcPath)) {
      throw new Error(`[LocalStorage] File nguồn không tồn tại để di chuyển: ${sourceKey}`);
    }

    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      await fs.promises.mkdir(destDir, { recursive: true });
    }

    await fs.promises.rename(srcPath, destPath);
  }

  /**
   * Health check probe to verify disk readability, writeability, and free space
   */
  public async checkHealth(): Promise<{ ready: boolean; reason?: string; freeBytes?: number }> {
    try {
      await this.ensureInitialized();

      // 1. Test write, read, and deletion of a probe file
      const probeKey = `temporary/.probe-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const probePath = this.resolveSafePath(probeKey);

      await fs.promises.writeFile(probePath, 'JAMI_HEALTH_PROBE', 'utf8');
      const readContent = await fs.promises.readFile(probePath, 'utf8');
      await fs.promises.unlink(probePath);

      if (readContent !== 'JAMI_HEALTH_PROBE') {
        return { ready: false, reason: 'Nội dung kiểm tra ổ đĩa không khớp.' };
      }

      // 2. Check disk free space if statfs is available (Node.js 18.15+)
      let freeBytes: number | undefined;
      if (typeof (fs.promises as any).statfs === 'function') {
        try {
          const stats = await (fs.promises as any).statfs(this.rootDir);
          freeBytes = stats.bavail * stats.bsize;
          const minFreeBytes = (env.LOCAL_STORAGE_MIN_FREE_MB || 2048) * 1024 * 1024;
          if (freeBytes < minFreeBytes) {
            return {
              ready: false,
              freeBytes,
              reason: `Dung lượng ổ đĩa trống (${Math.round(freeBytes / 1024 / 1024)}MB) thấp hơn mức tối thiểu yêu cầu (${env.LOCAL_STORAGE_MIN_FREE_MB}MB).`,
            };
          }
        } catch {
          // Continue if statfs not supported on platform
        }
      }

      return { ready: true, freeBytes };
    } catch (err: any) {
      return { ready: false, reason: `Không thể đọc/ghi vào thư mục lưu trữ cục bộ: ${err.message}` };
    }
  }
}
