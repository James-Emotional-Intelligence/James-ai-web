import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { LocalStorageAdapter } from '../../server/services/storage/local-storage-adapter';
import {
  StorageService,
  storageService,
  getUserDirHash,
  generateMaterialStorageKey,
  generateDerivedStorageKey,
  validateMagicBytes,
  sanitizeFileName,
} from '../../server/services/storage-service';

describe('LocalStorageAdapter & StorageService Unit Tests', () => {
  const testStorageDir = path.resolve(process.cwd(), 'storage_test_sandbox');
  let adapter: LocalStorageAdapter;

  beforeEach(() => {
    adapter = new LocalStorageAdapter(testStorageDir);
  });

  afterAll(async () => {
    // Cleanup test sandbox directory
    if (fs.existsSync(testStorageDir)) {
      await fs.promises.rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  describe('1. LocalStorageAdapter File Operations', () => {
    const testKey = 'materials/user_abc/mat_123/original.pdf';
    const sampleContent = Buffer.from('%PDF-1.7\nSample PDF Content for Testing\n%%EOF');

    it('saves a file and returns correct metadata and checksum', async () => {
      const stored = await adapter.save({
        key: testKey,
        body: sampleContent,
        contentType: 'application/pdf',
      });

      expect(stored.key).toBe(testKey);
      expect(stored.size).toBe(sampleContent.length);
      expect(stored.contentType).toBe('application/pdf');
      expect(stored.sha256).toBeDefined();
      expect(stored.sha256.length).toBe(64); // SHA-256 hex string
    });

    it('stats the saved file correctly', async () => {
      const stat = await adapter.stat(testKey);
      expect(stat.exists).toBe(true);
      expect(stat.size).toBe(sampleContent.length);

      const nonExistent = await adapter.stat('materials/user_abc/not_found.pdf');
      expect(nonExistent.exists).toBe(false);
      expect(nonExistent.size).toBe(0);
    });

    it('retrieves stored object buffer matching original content', async () => {
      const retrieved = await adapter.readBuffer(testKey);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.toString('utf-8')).toBe(sampleContent.toString('utf-8'));
    });

    it('streams partial content with RFC 7233 byte ranges', async () => {
      const rangeStream = await adapter.createReadStream(testKey, { start: 0, end: 7 });
      const chunks: Buffer[] = [];
      for await (const chunk of rangeStream) {
        chunks.push(chunk as Buffer);
      }
      const readBuffer = Buffer.concat(chunks);
      expect(readBuffer.length).toBe(8);
      expect(readBuffer.toString('utf-8')).toBe('%PDF-1.7');
    });

    it('checks health successfully on writable storage directory', async () => {
      const health = await adapter.checkHealth();
      expect(health.ready).toBe(true);
    });

    it('deletes file safely and idempotently', async () => {
      await adapter.delete(testKey);

      const statAfter = await adapter.stat(testKey);
      expect(statAfter.exists).toBe(false);

      // Subsequent delete on same file does not throw
      await expect(adapter.delete(testKey)).resolves.toBeUndefined();
    });

    it('deletes directory and all subdirectories safely', async () => {
      const file1 = 'materials/user_dir_del/mat_1/original.txt';
      const file2 = 'materials/user_dir_del/mat_1/derived/summary.json';
      await adapter.save({ key: file1, body: Buffer.from('file 1'), contentType: 'text/plain' });
      await adapter.save({ key: file2, body: Buffer.from('{}'), contentType: 'application/json' });

      expect(await adapter.exists(file1)).toBe(true);
      expect(await adapter.exists(file2)).toBe(true);

      await adapter.deleteDirectory('materials/user_dir_del/mat_1');

      expect(await adapter.exists(file1)).toBe(false);
      expect(await adapter.exists(file2)).toBe(false);
    });
  });

  describe('2. Path Traversal & Security Validation', () => {
    it('rejects path traversal sequences (../ and ..\\)', async () => {
      await expect(
        adapter.save({ key: '../../etc/passwd', body: Buffer.from('malicious'), contentType: 'text/plain' })
      ).rejects.toThrow();

      await expect(
        adapter.save({ key: '..\\..\\windows\\win.ini', body: Buffer.from('malicious'), contentType: 'text/plain' })
      ).rejects.toThrow();

      await expect(adapter.readBuffer('../../../shadow')).rejects.toThrow();
      await expect(adapter.stat('materials/../../secret')).rejects.toThrow();
    });

    it('rejects null bytes in key path', async () => {
      await expect(
        adapter.save({ key: 'materials/test\0evil.pdf', body: Buffer.from('data'), contentType: 'application/pdf' })
      ).rejects.toThrow();
    });

    it('rejects absolute paths attempting escape across all platforms', async () => {
      await expect(
        adapter.save({ key: '/etc/passwd', body: Buffer.from('bad'), contentType: 'text/plain' })
      ).rejects.toThrow();

      await expect(
        adapter.save({ key: 'C:\\Windows\\System32\\calc.exe', body: Buffer.from('bad'), contentType: 'text/plain' })
      ).rejects.toThrow();

      await expect(
        adapter.save({ key: 'D:/website/secret.key', body: Buffer.from('bad'), contentType: 'text/plain' })
      ).rejects.toThrow();

      await expect(
        adapter.save({ key: '\\\\server\\share\\data', body: Buffer.from('bad'), contentType: 'text/plain' })
      ).rejects.toThrow();

      await expect(
        adapter.save({ key: '//network/share', body: Buffer.from('bad'), contentType: 'text/plain' })
      ).rejects.toThrow();
    });

    it('rejects double-encoded path traversal sequences', async () => {
      await expect(
        adapter.save({ key: '%252e%252e%252fetc%252fpasswd', body: Buffer.from('bad'), contentType: 'text/plain' })
      ).rejects.toThrow();

      await expect(
        adapter.save({ key: '%2e%2e%2froot%2fshadow', body: Buffer.from('bad'), contentType: 'text/plain' })
      ).rejects.toThrow();
    });
  });

  describe('3. Canonical Storage Key & Directory Hashing', () => {
    it('produces deterministic 16-hex user hash', () => {
      const hash1 = getUserDirHash('usr_student_01');
      const hash2 = getUserDirHash('usr_student_01');
      const hashOther = getUserDirHash('usr_student_02');

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(16);
      expect(hash1).not.toBe(hashOther);
    });

    it('generates relative canonical storage key without absolute paths', () => {
      const key = generateMaterialStorageKey('usr_student_01', 'mat_test_999', 'Giao_Trinh_Toan_10.pdf', 'application/pdf');
      expect(key.startsWith('materials/')).toBe(true);
      expect(key.endsWith('/original.pdf')).toBe(true);
      expect(key).not.toContain('..');
      expect(key).not.toContain(':');
    });

    it('generates safe derived storage key', () => {
      const key = generateDerivedStorageKey('usr_student_01', 'mat_test_999', 'extracted_text.txt');
      expect(key.startsWith('materials/')).toBe(true);
      expect(key.includes('/derived/extracted_text.txt')).toBe(true);
    });
  });

  describe('4. Magic Bytes and File Type Verification', () => {
    it('detects and validates PDF files', () => {
      const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj');
      const result = validateMagicBytes(pdf, 'application/pdf', 'sample.pdf');
      expect(result.isValid).toBe(true);
      expect(result.detectedMime).toBe('application/pdf');
    });

    it('detects and validates PNG files', () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
      const result = validateMagicBytes(png, 'image/png', 'photo.png');
      expect(result.isValid).toBe(true);
      expect(result.detectedMime).toBe('image/png');
    });

    it('detects and validates JPEG files', () => {
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00]);
      const result = validateMagicBytes(jpeg, 'image/jpeg', 'photo.jpg');
      expect(result.isValid).toBe(true);
      expect(result.detectedMime).toBe('image/jpeg');
    });

    it('detects and validates WebP files', () => {
      const webp = Buffer.from('RIFF\x20\x00\x00\x00WEBPVP8 ');
      const result = validateMagicBytes(webp, 'image/webp', 'image.webp');
      expect(result.isValid).toBe(true);
      expect(result.detectedMime).toBe('image/webp');
    });

    it('detects and validates DOCX / EPUB Zip containers', () => {
      const docxHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
      const docxResult = validateMagicBytes(docxHeader, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document.docx');
      expect(docxResult.isValid).toBe(true);
      expect(docxResult.detectedMime).toContain('wordprocessingml');

      const epubResult = validateMagicBytes(docxHeader, 'application/epub+zip', 'book.epub');
      expect(epubResult.isValid).toBe(true);
      expect(epubResult.detectedMime).toBe('application/epub+zip');
    });

    it('rejects executable MZ / ELF payloads', () => {
      const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
      const exeResult = validateMagicBytes(exe, 'application/pdf', 'malware.pdf');
      expect(exeResult.isValid).toBe(false);
      expect(exeResult.error).toContain('Từ chối tệp thực thi');

      const elf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02]);
      const elfResult = validateMagicBytes(elf, 'application/pdf', 'rootkit.pdf');
      expect(elfResult.isValid).toBe(false);
      expect(elfResult.error).toContain('Từ chối tệp thực thi');
    });
  });
});
