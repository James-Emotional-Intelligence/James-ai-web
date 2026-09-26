import { db } from '../db/mysql';
import { bookRepo } from '../repositories/book-repository';
import { bookParserService } from './book-parser-service';
import { storageService } from './storage-service';
import { materialProcessor } from './material-processor';
import crypto from 'node:crypto';

export class MaterialWorkerService {
  private static instance: MaterialWorkerService;
  private isRunning: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;

  private constructor() {}

  public static getInstance(): MaterialWorkerService {
    if (!MaterialWorkerService.instance) {
      MaterialWorkerService.instance = new MaterialWorkerService();
    }
    return MaterialWorkerService.instance;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.pollJobs().catch((err) => console.error('[MaterialWorker] initial poll failed', { error: err instanceof Error ? err.message : String(err) }));
    this.pollTimer = setInterval(() => {
      this.pollJobs().catch((err) => console.error('[MaterialWorker] scheduled poll failed', { error: err instanceof Error ? err.message : String(err) }));
    }, 10000);
  }

  public stop() {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Enqueue exactly one active extraction job for a material. */
  public async enqueueMaterialProcessing(userId: string, materialId: string): Promise<string> {
    if (!db.isHealthy()) {
      throw new Error('MATERIAL_QUEUE_UNAVAILABLE');
    }
    const existing = await db.query<any>(
      `SELECT id FROM material_processing_jobs
       WHERE material_id = ? AND user_id = ? AND job_type = 'extract_and_chunk'
         AND status IN ('queued', 'processing')
       ORDER BY created_at DESC LIMIT 1`,
      [materialId, userId]
    );
    if (existing[0]?.id) return existing[0].id;
    const jobId = 'job_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    await db.execute(
      `INSERT INTO material_processing_jobs
       (id, material_id, user_id, job_type, status, progress_percent, created_at)
       VALUES (?, ?, ?, 'extract_and_chunk', 'queued', 10, NOW(3))`,
      [jobId, materialId, userId]
    );
    return jobId;
  }

  public async pollJobs() {
    if (!db.isHealthy() || this.isPolling) return;
    this.isPolling = true;

    try {
      // 1. Proactively fail expired jobs that have reached or exceeded max_attempts
      await db.execute(
        `UPDATE material_processing_jobs
         SET status = 'failed',
             error_code = 'MAX_ATTEMPTS_EXCEEDED',
             error_message = 'Đã vượt quá số lần thử xử lý tối đa (max_attempts).',
             completed_at = NOW(3),
             updated_at = NOW(3)
         WHERE status = 'processing'
           AND lease_until < NOW(3)
           AND attempt >= max_attempts`
      ).catch((err) => console.error('[MaterialWorker] max-attempt cleanup failed', { error: err instanceof Error ? err.message : String(err) }));

      // 2. Query candidate pending/queued jobs that have attempts remaining and are due for retry
      const candidates = await db.query<any>(
        `SELECT j.id, j.material_id, j.user_id, j.job_type, j.attempt, j.max_attempts,
                m.title, m.file_name, m.original_filename, m.storage_driver, m.storage_key,
                m.r2_object_key, m.detected_mime, m.material_kind
         FROM material_processing_jobs j
         JOIN learning_materials m ON j.material_id = m.id
         WHERE (j.status = 'queued' OR (j.status = 'processing' AND j.lease_until < NOW(3)))
           AND (j.next_retry_at IS NULL OR j.next_retry_at <= NOW(3))
           AND j.attempt < j.max_attempts
         ORDER BY j.created_at ASC
         LIMIT 5`
      );

      if (!candidates || candidates.length === 0) return;

      // 3. Atomically claim one job with conditional UPDATE
      for (const candidate of candidates) {
        const updateRes: any = await db.execute(
          `UPDATE material_processing_jobs
           SET status = 'processing',
               attempt = attempt + 1,
               lease_until = DATE_ADD(NOW(3), INTERVAL 5 MINUTE),
               started_at = COALESCE(started_at, NOW(3)),
               updated_at = NOW(3)
           WHERE id = ?
             AND (status = 'queued' OR (status = 'processing' AND lease_until < NOW(3)))
             AND (next_retry_at IS NULL OR next_retry_at <= NOW(3))
             AND attempt < max_attempts`,
          [candidate.id]
        );

        // Only process if THIS worker instance successfully claimed the atomic lock
        if (updateRes && (updateRes.affectedRows || 0) === 1) {
          await this.processJob(candidate);
          break; // Process one claimed job per poll tick
        }
      }
    } catch (err: any) {
      console.warn('[MaterialWorker] Error during job polling:', err.message);
    } finally {
      this.isPolling = false;
    }
  }

  public async processJob(job: any): Promise<void> {
    const { id: jobId, material_id: materialId, user_id: userId, title, storage_driver, storage_key, r2_object_key, detected_mime, material_kind, attempt, max_attempts } = job;

    try {
      const effectiveKey = storage_key || r2_object_key;
      if (!effectiveKey) {
        throw new Error('Không tìm thấy tệp lưu trữ.');
      }

      // State: extracting
      if (db.isHealthy()) {
        await db.execute(
          `UPDATE learning_materials SET processing_status = 'extracting', processing_progress = 25, updated_at = NOW(3) WHERE id = ?`,
          [materialId]
        );
      }

      // Download file buffer from storage
      const obj = await storageService.getObject(effectiveKey, storage_driver);
      if (!obj || !obj.body) {
        throw new Error('Không thể đọc dữ liệu tệp từ kho lưu trữ.');
      }

      const format = detected_mime?.includes('epub')
        ? 'epub'
        : detected_mime?.includes('word') || detected_mime?.includes('docx')
        ? 'docx'
        : detected_mime?.includes('text')
        ? 'txt'
        : 'pdf';

      // Parse structured book/document
      const extracted = await bookParserService.parseBookBuffer(obj.body, format, title);

      // State: extracted -> enriching
      if (db.isHealthy()) {
        await db.execute(
          `UPDATE learning_materials SET processing_status = 'enriching', processing_progress = 50, updated_at = NOW(3) WHERE id = ?`,
          [materialId]
        );
      }

      if (material_kind === 'book') {
        // Save chapters and chunks for soft books
        await bookRepo.saveChapters(materialId, extracted.chapters);
        await bookRepo.saveChunks(materialId, extracted.chunks);

        const status = extracted.needsOcr ? 'needs_ocr' : 'ready';

        if (db.isHealthy()) {
          await db.execute(
            `UPDATE learning_materials
             SET page_count = ?,
                 chapter_count = ?,
                 processing_status = ?,
                 processing_progress = 100,
                 error_message = NULL,
                 updated_at = NOW(3)
             WHERE id = ?`,
            [extracted.pageCount, extracted.chapters.length, status, materialId]
          );
        }
      } else {
        // Update page count (remain enriching until AI summary completes)
        if (db.isHealthy()) {
          await db.execute(
            `UPDATE learning_materials
             SET page_count = ?,
                 processing_progress = 60,
                 error_message = NULL,
                 updated_at = NOW(3)
             WHERE id = ?`,
            [extracted.pageCount || 1, materialId]
          );
        }

        // Standard documents are set to ready inside materialProcessor after AI enrichment finishes
        await materialProcessor.processMaterial(userId, materialId);
      }

      // Complete the job only after every required processing step succeeds
      if (db.isHealthy()) {
        await db.execute(
          `UPDATE material_processing_jobs
           SET status = 'completed',
               progress_percent = 100,
               completed_at = NOW(3),
               updated_at = NOW(3)
           WHERE id = ?`,
          [jobId]
        );
      }
    } catch (err: any) {
      const safeError = mapMaterialProcessingError(err);
      console.error('[MaterialWorker] job failed', { jobId, materialId, userId, code: safeError.code, error: err instanceof Error ? err.message : String(err) });
      const currentAttempt = (attempt || 0) + 1;
      const isExhausted = currentAttempt >= (max_attempts || 3);
      const backoffScheduleMinutes = [1, 5, 15];
      const backoffMinutes = backoffScheduleMinutes[Math.min(currentAttempt - 1, backoffScheduleMinutes.length - 1)] || 15;

      if (db.isHealthy()) {
        if (isExhausted) {
          await db.execute(
            `UPDATE learning_materials
             SET processing_status = 'error',
                 error_message = ?,
                 updated_at = NOW(3)
             WHERE id = ?`,
            [safeError.message, materialId]
          );

          await db.execute(
            `UPDATE material_processing_jobs
             SET status = 'failed',
                 error_code = 'MAX_ATTEMPTS_EXCEEDED',
                 error_message = ?,
                 completed_at = NOW(3),
                 updated_at = NOW(3)
             WHERE id = ?`,
            [safeError.message, jobId]
          );
        } else {
          // Retry with exponential backoff
          await db.execute(
            `UPDATE material_processing_jobs
             SET status = 'queued',
                 lease_until = NULL,
                 next_retry_at = DATE_ADD(NOW(3), INTERVAL ? MINUTE),
                 error_code = ?,
                 error_message = ?,
                 updated_at = NOW(3)
             WHERE id = ?`,
            [backoffMinutes, safeError.code, safeError.message, jobId]
          );
        }
      }
    }
  }

  public async retryJob(userId: string, materialId: string): Promise<boolean> {
    if (db.isHealthy()) {
      await db.execute(
        `UPDATE learning_materials
         SET processing_status = 'queued',
             processing_progress = 10,
             error_message = NULL,
             updated_at = NOW(3)
         WHERE id = ? AND user_id = ?`,
        [materialId, userId]
      );

      await db.execute(
        `UPDATE material_processing_jobs
         SET status = 'queued',
             attempt = 0,
             lease_until = NULL,
             error_code = NULL,
             error_message = NULL,
             updated_at = NOW(3)
         WHERE material_id = ? AND user_id = ?`,
        [materialId, userId]
      );
      return true;
    }
    return false;
  }
}

export const materialWorker = MaterialWorkerService.getInstance();

function mapMaterialProcessingError(error: unknown): { code: string; message: string } {
  const raw = error instanceof Error ? error.message.toUpperCase() : String(error).toUpperCase();
  if (raw.includes('STORAGE') || raw.includes('OBJECT')) return { code: 'STORAGE_READ_FAILED', message: 'Không thể đọc tệp tài liệu từ kho lưu trữ.' };
  if (raw.includes('OCR')) return { code: 'OCR_REQUIRED', message: 'Tài liệu cần OCR trước khi có thể xử lý tiếp.' };
  if (raw.includes('PARSE') || raw.includes('PDF') || raw.includes('DOCX') || raw.includes('EPUB')) return { code: 'PARSER_FAILED', message: 'Không thể phân tích cấu trúc tài liệu.' };
  if (raw.includes('AI') || raw.includes('SUMMARY') || raw.includes('ENRICH')) return { code: 'AI_ENRICHMENT_FAILED', message: 'Không thể hoàn tất phần bổ sung AI cho tài liệu.' };
  return { code: 'MATERIAL_PROCESSING_FAILED', message: 'Không thể xử lý tài liệu lúc này.' };
}
