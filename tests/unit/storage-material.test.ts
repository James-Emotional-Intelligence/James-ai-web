import { describe, it, expect } from 'vitest';
import {
  validateMagicBytes,
  sanitizeFileName,
  generateMaterialObjectKey,
} from '../../server/services/storage-service';
import { StructuredSummarySchema, MaterialUploadIntentSchema } from '../../shared/schemas';

describe('Storage & Material Security Unit Tests', () => {
  const userId = 'usr_student_test_materials_01';

  describe('1. Magic Bytes Validation', () => {
    it('accepts valid PDF magic bytes (%PDF-)', () => {
      const pdfHeader = Buffer.from('%PDF-1.7\n%âãÏÓ\n');
      const result = validateMagicBytes(pdfHeader, 'application/pdf');
      expect(result.isValid).toBe(true);
      expect(result.detectedMime).toBe('application/pdf');
    });

    it('accepts valid PNG magic bytes', () => {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      const result = validateMagicBytes(pngHeader, 'image/png');
      expect(result.isValid).toBe(true);
      expect(result.detectedMime).toBe('image/png');
    });

    it('accepts valid JPEG magic bytes', () => {
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const result = validateMagicBytes(jpegHeader, 'image/jpeg');
      expect(result.isValid).toBe(true);
      expect(result.detectedMime).toBe('image/jpeg');
    });

    it('accepts valid WebP magic bytes', () => {
      const webpHeader = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x00, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50, // WEBP
      ]);
      const result = validateMagicBytes(webpHeader, 'image/webp');
      expect(result.isValid).toBe(true);
      expect(result.detectedMime).toBe('image/webp');
    });

    it('rejects executable Windows MZ headers', () => {
      const mzHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ
      const result = validateMagicBytes(mzHeader, 'application/pdf');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Từ chối tệp thực thi Windows');
    });

    it('rejects executable Linux ELF headers', () => {
      const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46]); // .ELF
      const result = validateMagicBytes(elfHeader, 'application/pdf');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Từ chối tệp thực thi Linux');
    });

    it('rejects mismatched extensions (PNG uploaded as PDF)', () => {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const result = validateMagicBytes(pngHeader, 'application/pdf');
      expect(result.isValid).toBe(false);
    });
  });

  describe('2. Filename Sanitization & Path Traversal Prevention', () => {
    it('strips path traversal sequences', () => {
      expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
      expect(sanitizeFileName('/root/secret.pdf')).toBe('secret.pdf');
    });

    it('replaces dangerous control characters', () => {
      expect(sanitizeFileName('test\x00file<script>.pdf')).toBe('test_file_script_.pdf');
      expect(sanitizeFileName('de_cuong|toan:12?.pdf')).toBe('de_cuong_toan_12_.pdf');
    });
  });

  describe('3. Object Key Generation & Namespace Isolation', () => {
    it('generates server-controlled object key with user namespace and UUID', () => {
      const key = generateMaterialObjectKey(userId, 'mat_test_01', 'toan_12.pdf');
      expect(key.startsWith('materials/')).toBe(true);
      expect(key.endsWith('/original.pdf')).toBe(true);
      expect(key).not.toContain('..');
    });
  });

  describe('4. Structured Summary Schema & Prompt Injection Safety', () => {
    it('validates compliant structured summary output', () => {
      const validSummary = {
        overview: 'Tài liệu tóm tắt công thức đạo hàm và ứng dụng khảo sát hàm số.',
        keyPoints: [
          'Định nghĩa đạo hàm tại một điểm.',
          'Quy tắc tính đạo hàm tổng, hiệu, tích, thương.',
          'Bảng đạo hàm các hàm số sơ cấp cơ bản.',
        ],
        concepts: [
          { name: 'Đạo hàm', definition: 'Tốc độ thay đổi tức thời của hàm số.' },
        ],
        formulas: ['(u.v)\' = u\'v + uv\''],
        sourceReferences: [{ pageOrSection: 'Trang 1-3', note: 'Phần lý thuyết trọng tâm' }],
      };

      const result = StructuredSummarySchema.safeParse(validSummary);
      expect(result.success).toBe(true);
    });

    it('rejects summaries missing required overview or keyPoints', () => {
      const invalidSummary = {
        overview: '',
        keyPoints: [],
      };
      const result = StructuredSummarySchema.safeParse(invalidSummary);
      expect(result.success).toBe(false);
    });

    it('validates MaterialUploadIntentSchema for PDF, Images, TXT and DOCX formats', () => {
      const validPdf = MaterialUploadIntentSchema.safeParse({
        title: 'Đề cương ôn tập Toán',
        subjectId: 'subj_toan',
        fileName: 'de_cuong.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024 * 500,
      });
      expect(validPdf.success).toBe(true);

      const validTxt = MaterialUploadIntentSchema.safeParse({
        title: 'Ghi chú Ngữ văn',
        subjectId: 'subj_van',
        fileName: 'ghi_chu.txt',
        mimeType: 'text/plain',
        sizeBytes: 1024 * 50,
      });
      expect(validTxt.success).toBe(true);

      const validDocx = MaterialUploadIntentSchema.safeParse({
        title: 'Tiểu luận Lịch sử',
        subjectId: 'subj_su',
        fileName: 'tieu_luan.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: 1024 * 200,
      });
      expect(validDocx.success).toBe(true);
    });
  });
});
