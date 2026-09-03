import { describe, it, expect, beforeEach } from 'vitest';
import { bookParserService } from '../../server/services/book-parser-service';
import { bookRepo } from '../../server/repositories/book-repository';
import { bookStudyAidService } from '../../server/services/book-study-aid-service';

describe('Sách Mềm (Soft Books) Subsystem Unit Tests', () => {
  const testUserId = 'usr_test_student_books';

  beforeEach(() => {
    // Reset test state if needed
  });

  describe('Magic Bytes & Format Detection', () => {
    it('accurately identifies valid PDF files by %PDF- magic bytes', () => {
      const pdfBuffer = Buffer.from('%PDF-1.7\n%Header\n1 0 obj\n<< /Type /Catalog >>\nendobj');
      const check = bookParserService.validateMagicBytes(pdfBuffer, 'application/pdf', 'toan9.pdf');
      expect(check.valid).toBe(true);
      expect(check.format).toBe('pdf');
      expect(check.detectedMime).toBe('application/pdf');
    });

    it('accurately identifies valid EPUB and DOCX files by PK magic bytes', () => {
      const zipBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
      const epubCheck = bookParserService.validateMagicBytes(zipBuffer, 'application/epub+zip', 'sach.epub');
      expect(epubCheck.valid).toBe(true);
      expect(epubCheck.format).toBe('epub');

      const docxCheck = bookParserService.validateMagicBytes(
        zipBuffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'baihoc.docx'
      );
      expect(docxCheck.valid).toBe(true);
      expect(docxCheck.format).toBe('docx');
    });

    it('rejects unknown binary executables or mismatched formats', () => {
      const binBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      const check = bookParserService.validateMagicBytes(binBuffer, 'application/pdf', 'malware.pdf');
      expect(check.valid).toBe(false);
    });
  });

  describe('Book Parsing & Semantic Chunking', () => {
    it('parses plain text book content into structured chapters and citations', async () => {
      const bookContent = `
Chương I. Phương trình và hệ hai phương trình bậc nhất hai ẩn
Khái niệm hệ phương trình bậc nhất hai ẩn có dạng ax + by = c và a'x + b'y = c'.
Phương pháp giải: Phương pháp thế và phương pháp cộng đại số.

Chương II. Phương trình và bất phương trình bậc nhất một ẩn
Khái niệm bất phương trình bậc nhất một ẩn ax + b > 0 hoặc ax + b < 0.
Quy tắc biến đổi: Chuyển vế đổi dấu và nhân cả hai vế với số dương (giữ nguyên chiều) hoặc số âm (đổi chiều).
      `.trim();

      const parsed = await bookParserService.parseBookBuffer(Buffer.from(bookContent, 'utf-8'), 'txt', 'Toán 9 SGK');

      expect(parsed.chapters.length).toBeGreaterThanOrEqual(2);
      expect(parsed.chapters[0].title).toContain('Chương I');
      expect(parsed.chapters[1].title).toContain('Chương II');
      expect(parsed.chunks.length).toBeGreaterThanOrEqual(1);
      expect(parsed.needsOcr).toBe(false);
    });
  });

  describe('Book Repository CRUD & Progress Tracking', () => {
    it('creates book upload intent, records progress, and manages bookmarks & highlights', async () => {
      // 1. Upload Intent
      const intent = await bookRepo.createBookUploadIntent(testUserId, {
        title: 'Vật lý 9 Nâng cao',
        subjectId: 'subj-phy',
        fileName: 'Vat_Ly_9.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12500000,
        rightsConfirmed: true,
        publisher: 'NXB Giáo Dục',
        editionYear: 2024,
      });

      expect(intent.book.id).toBeDefined();
      expect(intent.book.title).toBe('Vật lý 9 Nâng cao');
      expect(intent.r2ObjectKey).toContain('materials/');

      // 2. Finalize Upload
      const finalized = await bookRepo.finalizeUpload(testUserId, intent.book.id, {
        sizeBytes: 12500000,
      });
      expect(finalized).toBe(true);

      // 3. Save and retrieve reading progress
      const progress = await bookRepo.saveProgress(testUserId, intent.book.id, 15, undefined, 25);
      expect(progress.page).toBe(15);
      expect(progress.percentage).toBe(25);

      const fetchedProgress = await bookRepo.getProgress(testUserId, intent.book.id);
      expect(fetchedProgress?.page).toBe(15);

      // 4. Bookmark creation
      const bmk = await bookRepo.createBookmark(testUserId, intent.book.id, {
        page: 15,
        title: 'Định luật Ôm cho đoạn mạch',
      });
      expect(bmk.id).toBeDefined();
      expect(bmk.page).toBe(15);

      const bmkList = await bookRepo.getBookmarks(testUserId, intent.book.id);
      expect(bmkList.some((b) => b.id === bmk.id)).toBe(true);

      // 5. Highlight creation
      const hl = await bookRepo.createHighlight(testUserId, intent.book.id, {
        page: 15,
        selectedText: 'Cường độ dòng điện chạy qua dây dẫn tỉ lệ thuận với hiệu điện thế',
        note: 'Công thức I = U / R',
        color: 'yellow',
      });
      expect(hl.id).toBeDefined();
      expect(hl.color).toBe('yellow');

      const hlList = await bookRepo.getHighlights(testUserId, intent.book.id);
      expect(hlList.some((h) => h.id === hl.id)).toBe(true);

      // 6. Delete Book
      const deleted = await bookRepo.deleteBook(testUserId, intent.book.id);
      expect(deleted).toBe(true);
    });
  });

  describe('AI Study Aid Generation with Citations', () => {
    it('generates structured study aid with citations for sample book', async () => {
      const aid = await bookStudyAidService.generateStudyAid('default', 'book-math-9-kntt', {
        action: 'summary',
        chapterId: 'ch-math-1',
      });

      expect(aid.action).toBe('summary');
      expect(aid.title).toContain('Chương I');
      expect(aid.contentMarkdown.length).toBeGreaterThan(50);
      expect(aid.citations).toBeDefined();
      expect(aid.citations.length).toBeGreaterThan(0);
      expect(aid.citations[0].bookTitle).toContain('Toán 9');
    });

    it('generates flashcards for a specific chapter', async () => {
      const aid = await bookStudyAidService.generateStudyAid('default', 'book-math-9-kntt', {
        action: 'flashcards',
        chapterId: 'ch-math-1',
      });

      expect(aid.action).toBe('flashcards');
      expect(aid.contentMarkdown).toContain('Flashcard');
    });
  });
});
