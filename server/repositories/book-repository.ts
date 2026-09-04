import { db } from '../db/mysql';
import {
  Material,
  BookChapter,
  BookChunk,
  BookProgress,
  BookBookmark,
  BookHighlight,
  BookStudyCitation,
} from '../../shared/types';
import { storageService, generateMaterialObjectKey, sanitizeFileName } from '../services/storage-service';
import { bookParserService } from '../services/book-parser-service';
import { env } from '../config/env';
import crypto from 'crypto';

export class BookRepository {
  private static instance: BookRepository;

  // In-memory demo stores for demo/test mode
  private demoBooks: Map<string, Material[]> = new Map();
  private demoChapters: Map<string, BookChapter[]> = new Map();
  private demoChunks: Map<string, BookChunk[]> = new Map();
  private demoProgress: Map<string, BookProgress> = new Map(); // key: `${userId}:${materialId}`
  private demoBookmarks: Map<string, BookBookmark[]> = new Map(); // key: `${userId}:${materialId}`
  private demoHighlights: Map<string, BookHighlight[]> = new Map(); // key: `${userId}:${materialId}`

  private constructor() {
    this.seedDemoBooks();
  }

  public static getInstance(): BookRepository {
    if (!BookRepository.instance) {
      BookRepository.instance = new BookRepository();
    }
    return BookRepository.instance;
  }

  private seedDemoBooks() {
    const demoBook1: Material = {
      id: 'book-math-9-kntt',
      userId: 'default',
      subjectId: 'subj-math',
      subjectName: 'Toán học',
      title: 'Toán 9 - Tập 1 (Kết nối tri thức)',
      type: 'pdf',
      materialKind: 'book',
      originalFilename: 'Toan_9_Tap_1_KNTT.pdf',
      detectedMime: 'application/pdf',
      publisher: 'NXB Giáo Dục Việt Nam',
      editionYear: 2024,
      language: 'vi',
      sizeBytes: 18542000,
      pageCount: 132,
      chapterCount: 5,
      processingStatus: 'ready',
      processingProgress: 100,
      rightsConfirmedAt: new Date().toISOString(),
      rightsTermsVersion: 'v1.0',
      summary: 'Sách giáo khoa Toán 9 Tập 1 bộ sách Kết nối tri thức với cuộc sống gồm Đại số (Phương trình, Hệ phương trình) và Hình học (Hệ thức lượng trong tam giác vuông, Đường tròn).',
      createdAt: new Date().toISOString(),
    };

    const chapters1: BookChapter[] = [
      { id: 'ch-math-1', materialId: 'book-math-9-kntt', ordinal: 1, title: 'Chương I. Phương trình và hệ hai phương trình bậc nhất hai ẩn', startPage: 5, endPage: 32 },
      { id: 'ch-math-2', materialId: 'book-math-9-kntt', ordinal: 2, title: 'Chương II. Phương trình và bất phương trình bậc nhất một ẩn', startPage: 33, endPage: 58 },
      { id: 'ch-math-3', materialId: 'book-math-9-kntt', ordinal: 3, title: 'Chương III. Căn thức và biến đổi căn bậc hai', startPage: 59, endPage: 85 },
      { id: 'ch-math-4', materialId: 'book-math-9-kntt', ordinal: 4, title: 'Chương IV. Hệ thức lượng trong tam giác vuông', startPage: 86, endPage: 110 },
      { id: 'ch-math-5', materialId: 'book-math-9-kntt', ordinal: 5, title: 'Chương V. Đường tròn và tiếp tuyến', startPage: 111, endPage: 132 },
    ];

    const chunks1: BookChunk[] = [
      {
        id: 'chunk-math-1',
        materialId: 'book-math-9-kntt',
        chapterId: 'ch-math-1',
        chapterTitle: 'Chương I. Phương trình và hệ hai phương trình bậc nhất hai ẩn',
        ordinal: 1,
        pageStart: 5,
        pageEnd: 12,
        tokenCount: 420,
        text: 'Khái niệm hệ hai phương trình bậc nhất hai ẩn: Hệ phương trình có dạng ax + by = c và a\'x + b\'y = c\', trong đó a, b, c, a\', b\', c\' là các hệ số thực, x và y là ẩn số. Nghiệm của hệ là cặp số (x0; y0) thỏa mãn đồng thời cả hai phương trình. Phương pháp giải chính gồm: Phương pháp thế (biểu diễn một ẩn theo ẩn kia rồi thế vào phương trình còn lại) và Phương pháp cộng đại số (nhân các vế với hệ số thích hợp để hệ số của một ẩn triệt tiêu nhau khi cộng hoặc trừ).',
      },
      {
        id: 'chunk-math-2',
        materialId: 'book-math-9-kntt',
        chapterId: 'ch-math-4',
        chapterTitle: 'Chương IV. Hệ thức lượng trong tam giác vuông',
        ordinal: 2,
        pageStart: 86,
        pageEnd: 95,
        tokenCount: 480,
        text: 'Một số hệ thức về cạnh và đường cao trong tam giác vuông ABC vuông tại A, đường cao AH: 1) b^2 = a.b\', c^2 = a.c\' (bình phương mỗi cạnh góc vuông bằng tích của cạnh huyền và hình chiếu của cạnh góc vuông đó trên cạnh huyền). 2) h^2 = b\'.c\' (bình phương đường cao ứng với cạnh huyền bằng tích hai hình chiếu của hai cạnh góc vuông). 3) a.h = b.c. 4) 1/h^2 = 1/b^2 + 1/c^2. Định lý Pytago: a^2 = b^2 + c^2.',
      },
    ];

    this.demoBooks.set('default', [demoBook1]);
    this.demoChapters.set('book-math-9-kntt', chapters1);
    this.demoChunks.set('book-math-9-kntt', chunks1);
  }

  public async getBooksByUserId(
    userId: string,
    options?: {
      search?: string;
      subjectId?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ books: Material[]; total: number }> {
    if (db.isHealthy()) {
      let query = `
        SELECT m.id, m.user_id, m.subject_id, m.title, m.type, m.material_kind,
               m.original_filename, m.detected_mime, m.publisher, m.edition_year, m.language,
               m.cover_object_key, m.page_count, m.chapter_count, m.processing_progress,
               m.r2_object_key, m.file_name, m.mime_type, m.size_bytes, m.sha256,
               m.processing_status, m.summary, m.summary_json, m.content_text,
               m.error_message, m.rights_confirmed_at, m.rights_terms_version,
               m.created_at, m.updated_at,
               s.name as subject_name
        FROM learning_materials m
        LEFT JOIN subjects s ON m.subject_id = s.id
        WHERE m.user_id = ? AND m.material_kind = 'book' AND m.deleted_at IS NULL
      `;
      const params: any[] = [userId];

      if (options?.subjectId && options.subjectId !== 'all') {
        query += ' AND m.subject_id = ?';
        params.push(options.subjectId);
      }

      if (options?.status && options.status !== 'all') {
        query += ' AND m.processing_status = ?';
        params.push(options.status);
      }

      if (options?.search) {
        query += ' AND (m.title LIKE ? OR m.publisher LIKE ? OR m.original_filename LIKE ?)';
        const term = `%${options.search.trim()}%`;
        params.push(term, term, term);
      }

      query += ' ORDER BY m.created_at DESC';

      if (options?.limit) {
        query += ' LIMIT ? OFFSET ?';
        params.push(Number(options.limit), Number(options.offset || 0));
      }

      const rows = await db.query<any>(query, params);

      const books: Material[] = rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        subjectId: r.subject_id,
        subjectName: r.subject_name || 'Môn học',
        title: r.title,
        type: r.type,
        materialKind: r.material_kind || 'book',
        originalFilename: r.original_filename || r.file_name,
        detectedMime: r.detected_mime || r.mime_type,
        publisher: r.publisher || undefined,
        editionYear: r.edition_year ? Number(r.edition_year) : undefined,
        language: r.language || 'vi',
        coverObjectKey: r.cover_object_key || undefined,
        pageCount: Number(r.page_count) || 0,
        chapterCount: Number(r.chapter_count) || 0,
        processingProgress: Number(r.processing_progress) || 0,
        r2ObjectKey: r.r2_object_key || undefined,
        fileName: r.file_name || undefined,
        mimeType: r.mime_type || undefined,
        sizeBytes: Number(r.size_bytes) || 0,
        sha256: r.sha256 || undefined,
        processingStatus: r.processing_status || 'ready',
        summary: r.summary || undefined,
        errorMessage: r.error_message || undefined,
        rightsConfirmedAt: r.rights_confirmed_at ? String(r.rights_confirmed_at) : undefined,
        rightsTermsVersion: r.rights_terms_version || undefined,
        createdAt: r.created_at ? (r.created_at.toISOString?.() || String(r.created_at)) : new Date().toISOString(),
        updatedAt: r.updated_at ? (r.updated_at.toISOString?.() || String(r.updated_at)) : undefined,
      }));

      return { books, total: books.length };
    }

    let list = this.demoBooks.get(userId) || this.demoBooks.get('default') || [];
    if (options?.subjectId && options.subjectId !== 'all') {
      list = list.filter((b) => b.subjectId === options.subjectId);
    }
    if (options?.search) {
      const q = options.search.toLowerCase();
      list = list.filter((b) => b.title.toLowerCase().includes(q) || b.publisher?.toLowerCase().includes(q));
    }
    return { books: list, total: list.length };
  }

  public async getBookById(userId: string, materialId: string): Promise<Material | null> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT m.*, s.name as subject_name
         FROM learning_materials m
         LEFT JOIN subjects s ON m.subject_id = s.id
         WHERE m.id = ? AND m.user_id = ? AND m.material_kind = 'book' AND m.deleted_at IS NULL`,
        [materialId, userId]
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        userId: r.user_id,
        subjectId: r.subject_id,
        subjectName: r.subject_name || 'Môn học',
        title: r.title,
        type: r.type,
        materialKind: 'book',
        originalFilename: r.original_filename || r.file_name,
        detectedMime: r.detected_mime || r.mime_type,
        publisher: r.publisher || undefined,
        editionYear: r.edition_year ? Number(r.edition_year) : undefined,
        language: r.language || 'vi',
        coverObjectKey: r.cover_object_key || undefined,
        pageCount: Number(r.page_count) || 0,
        chapterCount: Number(r.chapter_count) || 0,
        processingProgress: Number(r.processing_progress) || 0,
        r2ObjectKey: r.r2_object_key || undefined,
        fileName: r.file_name || undefined,
        mimeType: r.mime_type || undefined,
        sizeBytes: Number(r.size_bytes) || 0,
        sha256: r.sha256 || undefined,
        processingStatus: r.processing_status || 'ready',
        summary: r.summary || undefined,
        errorMessage: r.error_message || undefined,
        rightsConfirmedAt: r.rights_confirmed_at ? String(r.rights_confirmed_at) : undefined,
        rightsTermsVersion: r.rights_terms_version || undefined,
        createdAt: r.created_at ? (r.created_at.toISOString?.() || String(r.created_at)) : new Date().toISOString(),
        updatedAt: r.updated_at ? (r.updated_at.toISOString?.() || String(r.updated_at)) : undefined,
      };
    }

    const list = this.demoBooks.get(userId) || this.demoBooks.get('default') || [];
    return list.find((b) => b.id === materialId) || null;
  }

  public async createBookUploadIntent(
    userId: string,
    data: {
      title: string;
      subjectId: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      rightsConfirmed: boolean;
      rightsTermsVersion?: string;
      publisher?: string;
      editionYear?: number;
      language?: string;
    }
  ): Promise<{ book: Material; uploadUrl: string; r2ObjectKey: string }> {
    const id = 'book_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const sanitizedName = sanitizeFileName(data.fileName);
    const r2ObjectKey = generateMaterialObjectKey(userId, sanitizedName);

    const ext = sanitizedName.split('.').pop()?.toLowerCase();
    let type: Material['type'] = 'pdf';
    if (ext === 'docx') type = 'docx';
    else if (ext === 'epub') type = 'epub';
    else if (ext === 'txt' || ext === 'md') type = 'txt';

    const book: Material = {
      id,
      userId,
      subjectId: data.subjectId,
      title: data.title.trim(),
      type,
      materialKind: 'book',
      originalFilename: sanitizedName,
      detectedMime: data.mimeType,
      publisher: data.publisher?.trim() || undefined,
      editionYear: data.editionYear || undefined,
      language: data.language || 'vi',
      fileName: sanitizedName,
      r2ObjectKey,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      processingStatus: 'uploading',
      processingProgress: 0,
      rightsConfirmedAt: new Date().toISOString(),
      rightsTermsVersion: data.rightsTermsVersion || 'v1.0',
      createdAt: new Date().toISOString(),
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO learning_materials (
          id, user_id, subject_id, title, type, material_kind, original_filename,
          detected_mime, publisher, edition_year, language, file_name, r2_object_key,
          mime_type, size_bytes, processing_status, processing_progress,
          rights_confirmed_at, rights_terms_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'book', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', 0, NOW(3), ?, NOW(3), NOW(3))`,
        [
          book.id,
          userId,
          book.subjectId,
          book.title,
          book.type,
          book.originalFilename,
          book.detectedMime,
          book.publisher || null,
          book.editionYear || null,
          book.language || 'vi',
          book.fileName,
          book.r2ObjectKey,
          book.mimeType,
          book.sizeBytes,
          book.rightsTermsVersion || 'v1.0',
        ]
      );
    } else {
      const userList = this.demoBooks.get(userId) || [];
      userList.unshift(book);
      this.demoBooks.set(userId, userList);
    }

    const { uploadUrl } = await storageService.getSignedUploadUrl(
      r2ObjectKey,
      data.mimeType
    );

    return { book, uploadUrl, r2ObjectKey };
  }

  public async finalizeUpload(
    userId: string,
    materialId: string,
    meta?: {
      sizeBytes?: number;
      sha256?: string;
      detectedMime?: string;
    }
  ): Promise<boolean> {
    const book = await this.getBookById(userId, materialId);
    if (!book) {
      return false;
    }

    let finalSize = meta?.sizeBytes || book.sizeBytes || 0;
    let finalSha = meta?.sha256 || book.sha256;
    let finalMime = meta?.detectedMime || book.detectedMime || book.mimeType || 'application/pdf';

    // Verify against actual object in storageService / R2 if available
    if (book.r2ObjectKey) {
      const storedObj = await storageService.getObject(book.r2ObjectKey);
      if (storedObj && storedObj.body) {
        finalSize = storedObj.size || storedObj.body.length;
        finalSha = crypto.createHash('sha256').update(storedObj.body).digest('hex');

        // Check file size limits against environment configuration
        const maxBytes = (env.BOOK_MAX_UPLOAD_MB || 100) * 1024 * 1024;
        if (finalSize > maxBytes) {
          throw new Error(`Dung lượng sách (${Math.round(finalSize / 1024 / 1024)}MB) vượt quá giới hạn cho phép (${env.BOOK_MAX_UPLOAD_MB}MB).`);
        }

        // Validate magic bytes server-side (prevent spoofed extensions/MIME)
        const magicCheck = bookParserService.validateMagicBytes(
          storedObj.body,
          storedObj.contentType || finalMime,
          book.originalFilename || book.fileName || 'book.pdf'
        );

        if (!magicCheck.valid) {
          throw new Error('Tệp sách không hợp lệ hoặc định dạng thực tế không khớp với nội dung tệp.');
        }

        finalMime = magicCheck.detectedMime;
      }
    }

    if (db.isHealthy()) {
      const res = await db.execute(
        `UPDATE learning_materials
         SET processing_status = 'queued',
             processing_progress = 10,
             size_bytes = ?,
             sha256 = COALESCE(?, sha256),
             detected_mime = COALESCE(?, detected_mime),
             updated_at = NOW(3)
         WHERE id = ? AND user_id = ? AND material_kind = 'book'`,
        [finalSize, finalSha || null, finalMime || null, materialId, userId]
      );

      // Check affectedRows first: return false if book not found / not updated
      if (!res || (res.affectedRows || 0) === 0) {
        return false;
      }

      // Create durable processing job only after confirming affectedRows > 0
      const jobId = 'job_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
      await db.execute(
        `INSERT INTO material_processing_jobs (
          id, material_id, user_id, job_type, status, progress_percent, created_at
        ) VALUES (?, ?, ?, 'extract_and_chunk', 'queued', 10, NOW(3))`,
        [jobId, materialId, userId]
      );

      return true;
    }

    const list = this.demoBooks.get(userId) || [];
    const b = list.find((item) => item.id === materialId);
    if (b) {
      b.processingStatus = 'ready';
      b.processingProgress = 100;
      b.sizeBytes = finalSize;
      b.sha256 = finalSha;
      b.detectedMime = finalMime;
      return true;
    }
    return false;
  }

  public async deleteBook(userId: string, materialId: string): Promise<boolean> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        'SELECT r2_object_key, cover_object_key FROM learning_materials WHERE id = ? AND user_id = ?',
        [materialId, userId]
      );
      if (rows.length > 0) {
        const { r2_object_key, cover_object_key } = rows[0];
        if (r2_object_key) await storageService.deleteObject(r2_object_key).catch(() => {});
        if (cover_object_key) await storageService.deleteObject(cover_object_key).catch(() => {});
      }

      const res = await db.execute(
        'DELETE FROM learning_materials WHERE id = ? AND user_id = ? AND material_kind = \'book\'',
        [materialId, userId]
      );
      return (res?.affectedRows || 0) > 0;
    }

    const list = this.demoBooks.get(userId) || [];
    const idx = list.findIndex((b) => b.id === materialId);
    if (idx !== -1) {
      list.splice(idx, 1);
      this.demoBooks.set(userId, list);
      return true;
    }
    return false;
  }

  public async getChapters(materialId: string): Promise<BookChapter[]> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        'SELECT * FROM book_chapters WHERE material_id = ? ORDER BY ordinal ASC',
        [materialId]
      );
      return rows.map((r) => ({
        id: r.id,
        materialId: r.material_id,
        parentId: r.parent_id || undefined,
        ordinal: Number(r.ordinal),
        title: r.title,
        startPage: Number(r.start_page),
        endPage: Number(r.end_page),
        sourceAnchor: r.source_anchor || undefined,
        createdAt: r.created_at ? String(r.created_at) : undefined,
      }));
    }

    return this.demoChapters.get(materialId) || [];
  }

  public async saveChapters(
    materialId: string,
    chapters: Array<{
      title: string;
      startPage: number;
      endPage: number;
      ordinal: number;
      parentId?: string;
      sourceAnchor?: string;
    }>
  ): Promise<void> {
    if (db.isHealthy()) {
      await db.execute('DELETE FROM book_chapters WHERE material_id = ?', [materialId]);
      for (const ch of chapters) {
        const id = 'ch_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
        await db.execute(
          `INSERT INTO book_chapters (id, material_id, parent_id, ordinal, title, start_page, end_page, source_anchor)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, materialId, ch.parentId || null, ch.ordinal, ch.title, ch.startPage, ch.endPage, ch.sourceAnchor || null]
        );
      }
      await db.execute(
        'UPDATE learning_materials SET chapter_count = ? WHERE id = ?',
        [chapters.length, materialId]
      );
      return;
    }

    const formatted: BookChapter[] = chapters.map((c, i) => ({
      id: `ch_${i + 1}`,
      materialId,
      parentId: c.parentId,
      ordinal: c.ordinal,
      title: c.title,
      startPage: c.startPage,
      endPage: c.endPage,
      sourceAnchor: c.sourceAnchor,
    }));
    this.demoChapters.set(materialId, formatted);
  }

  public async getChunks(
    materialId: string,
    options?: { chapterId?: string; startPage?: number; endPage?: number; limit?: number }
  ): Promise<BookChunk[]> {
    if (db.isHealthy()) {
      let query = `
        SELECT c.*, ch.title as chapter_title
        FROM book_chunks c
        LEFT JOIN book_chapters ch ON c.chapter_id = ch.id
        WHERE c.material_id = ?
      `;
      const params: any[] = [materialId];

      if (options?.chapterId) {
        query += ' AND c.chapter_id = ?';
        params.push(options.chapterId);
      }
      if (options?.startPage && options?.endPage) {
        query += ' AND (c.page_start <= ? AND c.page_end >= ?)';
        params.push(options.endPage, options.startPage);
      }

      query += ' ORDER BY c.ordinal ASC';
      if (options?.limit) {
        query += ' LIMIT ?';
        params.push(Number(options.limit));
      }

      const rows = await db.query<any>(query, params);
      return rows.map((r) => ({
        id: r.id,
        materialId: r.material_id,
        chapterId: r.chapter_id || undefined,
        chapterTitle: r.chapter_title || undefined,
        ordinal: Number(r.ordinal),
        text: r.text,
        pageStart: Number(r.page_start),
        pageEnd: Number(r.page_end),
        tokenCount: Number(r.token_count) || 0,
        contentHash: r.content_hash || undefined,
        createdAt: r.created_at ? String(r.created_at) : undefined,
      }));
    }

    let list = this.demoChunks.get(materialId) || [];
    if (options?.chapterId) list = list.filter((c) => c.chapterId === options.chapterId);
    if (options?.limit) list = list.slice(0, options.limit);
    return list;
  }

  public async saveChunks(
    materialId: string,
    chunks: Array<{
      chapterId?: string;
      ordinal: number;
      text: string;
      pageStart: number;
      pageEnd: number;
      tokenCount: number;
      contentHash?: string;
    }>
  ): Promise<void> {
    if (db.isHealthy()) {
      await db.execute('DELETE FROM book_chunks WHERE material_id = ?', [materialId]);
      for (const chunk of chunks) {
        const id = 'chk_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
        await db.execute(
          `INSERT INTO book_chunks (id, material_id, chapter_id, ordinal, text, page_start, page_end, token_count, content_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            materialId,
            chunk.chapterId || null,
            chunk.ordinal,
            chunk.text,
            chunk.pageStart,
            chunk.pageEnd,
            chunk.tokenCount,
            chunk.contentHash || null,
          ]
        );
      }
      return;
    }

    const formatted: BookChunk[] = chunks.map((c, i) => ({
      id: `chk_${i + 1}`,
      materialId,
      chapterId: c.chapterId,
      ordinal: c.ordinal,
      text: c.text,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      tokenCount: c.tokenCount,
      contentHash: c.contentHash,
    }));
    this.demoChunks.set(materialId, formatted);
  }

  public async searchChunks(
    userId: string,
    materialId: string,
    query: string,
    chapterId?: string,
    page?: number
  ): Promise<Array<{ chunk: BookChunk; score: number; snippet: string }>> {
    const book = await this.getBookById(userId, materialId);
    if (!book) return [];

    const chunks = await this.getChunks(materialId, { chapterId });
    const cleanQ = query.trim().toLowerCase();
    const results: Array<{ chunk: BookChunk; score: number; snippet: string }> = [];

    for (const ch of chunks) {
      const lower = ch.text.toLowerCase();
      const idx = lower.indexOf(cleanQ);
      if (idx !== -1) {
        const start = Math.max(0, idx - 60);
        const end = Math.min(ch.text.length, idx + cleanQ.length + 100);
        const snippet = (start > 0 ? '...' : '') + ch.text.substring(start, end).trim() + (end < ch.text.length ? '...' : '');
        results.push({ chunk: ch, score: 1.0, snippet });
      } else {
        // Keyword match
        const words = cleanQ.split(/\s+/).filter((w) => w.length > 2);
        let matchCount = 0;
        for (const w of words) {
          if (lower.includes(w)) matchCount++;
        }
        if (matchCount > 0) {
          const snippet = ch.text.substring(0, 150).trim() + '...';
          results.push({ chunk: ch, score: matchCount / words.length, snippet });
        }
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 20);
  }

  public async getProgress(userId: string, materialId: string): Promise<BookProgress | null> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        'SELECT * FROM book_progress WHERE user_id = ? AND material_id = ?',
        [userId, materialId]
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        userId: r.user_id,
        materialId: r.material_id,
        chapterId: r.chapter_id || undefined,
        page: Number(r.page) || 1,
        percentage: Number(r.percentage) || 0,
        updatedAt: r.updated_at ? String(r.updated_at) : undefined,
      };
    }

    return this.demoProgress.get(`${userId}:${materialId}`) || null;
  }

  public async saveProgress(
    userId: string,
    materialId: string,
    page: number,
    chapterId?: string,
    percentage: number = 0
  ): Promise<BookProgress> {
    const id = 'prog_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO book_progress (id, user_id, material_id, chapter_id, page, percentage, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(3))
         ON DUPLICATE KEY UPDATE chapter_id = VALUES(chapter_id), page = VALUES(page), percentage = VALUES(percentage), updated_at = NOW(3)`,
        [id, userId, materialId, chapterId || null, page, percentage]
      );
    }

    const prog: BookProgress = {
      id,
      userId,
      materialId,
      chapterId,
      page,
      percentage,
      updatedAt: new Date().toISOString(),
    };
    this.demoProgress.set(`${userId}:${materialId}`, prog);
    return prog;
  }

  public async getBookmarks(userId: string, materialId: string): Promise<BookBookmark[]> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        'SELECT * FROM book_bookmarks WHERE user_id = ? AND material_id = ? ORDER BY page ASC',
        [userId, materialId]
      );
      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        materialId: r.material_id,
        chapterId: r.chapter_id || undefined,
        page: Number(r.page),
        title: r.title,
        sourceAnchor: r.source_anchor || undefined,
        createdAt: r.created_at ? String(r.created_at) : new Date().toISOString(),
      }));
    }

    return this.demoBookmarks.get(`${userId}:${materialId}`) || [];
  }

  public async createBookmark(
    userId: string,
    materialId: string,
    data: { page: number; title: string; chapterId?: string; sourceAnchor?: string }
  ): Promise<BookBookmark> {
    const id = 'bmk_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO book_bookmarks (id, user_id, material_id, chapter_id, page, title, source_anchor, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))`,
        [id, userId, materialId, data.chapterId || null, data.page, data.title.trim(), data.sourceAnchor || null]
      );
    }

    const bookmark: BookBookmark = {
      id,
      userId,
      materialId,
      chapterId: data.chapterId,
      page: data.page,
      title: data.title.trim(),
      sourceAnchor: data.sourceAnchor,
      createdAt: new Date().toISOString(),
    };

    const list = this.demoBookmarks.get(`${userId}:${materialId}`) || [];
    list.push(bookmark);
    this.demoBookmarks.set(`${userId}:${materialId}`, list);
    return bookmark;
  }

  public async deleteBookmark(userId: string, bookmarkId: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute(
        'DELETE FROM book_bookmarks WHERE id = ? AND user_id = ?',
        [bookmarkId, userId]
      );
      return (res?.affectedRows || 0) > 0;
    }

    for (const [key, list] of this.demoBookmarks.entries()) {
      const idx = list.findIndex((b) => b.id === bookmarkId && b.userId === userId);
      if (idx !== -1) {
        list.splice(idx, 1);
        this.demoBookmarks.set(key, list);
        return true;
      }
    }
    return false;
  }

  public async getHighlights(userId: string, materialId: string): Promise<BookHighlight[]> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        'SELECT * FROM book_highlights WHERE user_id = ? AND material_id = ? ORDER BY page ASC, created_at DESC',
        [userId, materialId]
      );
      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        materialId: r.material_id,
        chapterId: r.chapter_id || undefined,
        page: Number(r.page),
        selectedText: r.selected_text,
        note: r.note || undefined,
        color: r.color || 'yellow',
        createdAt: r.created_at ? String(r.created_at) : new Date().toISOString(),
        updatedAt: r.updated_at ? String(r.updated_at) : new Date().toISOString(),
      }));
    }

    return this.demoHighlights.get(`${userId}:${materialId}`) || [];
  }

  public async createHighlight(
    userId: string,
    materialId: string,
    data: { page: number; selectedText: string; note?: string; color?: string; chapterId?: string }
  ): Promise<BookHighlight> {
    const id = 'hl_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const color = data.color || 'yellow';
    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO book_highlights (id, user_id, material_id, chapter_id, page, selected_text, note, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
        [id, userId, materialId, data.chapterId || null, data.page, data.selectedText.trim(), data.note?.trim() || null, color]
      );
    }

    const hl: BookHighlight = {
      id,
      userId,
      materialId,
      chapterId: data.chapterId,
      page: data.page,
      selectedText: data.selectedText.trim(),
      note: data.note?.trim(),
      color,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const list = this.demoHighlights.get(`${userId}:${materialId}`) || [];
    list.push(hl);
    this.demoHighlights.set(`${userId}:${materialId}`, list);
    return hl;
  }

  public async deleteHighlight(userId: string, highlightId: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute(
        'DELETE FROM book_highlights WHERE id = ? AND user_id = ?',
        [highlightId, userId]
      );
      return (res?.affectedRows || 0) > 0;
    }

    for (const [key, list] of this.demoHighlights.entries()) {
      const idx = list.findIndex((h) => h.id === highlightId && h.userId === userId);
      if (idx !== -1) {
        list.splice(idx, 1);
        this.demoHighlights.set(key, list);
        return true;
      }
    }
    return false;
  }
}

export const bookRepo = BookRepository.getInstance();
