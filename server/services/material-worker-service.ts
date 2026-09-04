import { db } from '../db/mysql';
import { bookRepo } from '../repositories/book-repository';
import { bookParserService } from './book-parser-service';
import { storageService } from './storage-service';
import { materialRepo } from '../repositories/material-repository';

export class MaterialWorkerService {
  private static instance: MaterialWorkerService;
  private isRunning: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;

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
    this.pollJobs();
    this.pollTimer = setInterval(() => this.pollJobs(), 10000);
  }

  public stop() {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public async pollJobs() {
    if (!db.isHealthy()) return;

    try {
      // Lease next pending job atomically
      const rows = await db.query<any>(
        `SELECT j.id, j.material_id, j.user_id, j.job_type, j.attempt, j.max_attempts,
                m.title, m.file_name, m.original_filename, m.storage_driver, m.storage_key,
                m.r2_object_key, m.detected_mime, m.material_kind
         FROM material_processing_jobs j
         JOIN learning_materials m ON j.material_id = m.id
         WHERE j.status = 'queued' OR (j.status = 'processing' AND j.lease_until < NOW(3))
         ORDER BY j.created_at ASC
         LIMIT 1`
      );

      if (rows.length === 0) return;

      const job = rows[0];

      // Acquire lease
      await db.execute(
        `UPDATE material_processing_jobs
         SET status = 'processing',
             attempt = attempt + 1,
             lease_until = DATE_ADD(NOW(3), INTERVAL 5 MINUTE),
             started_at = COALESCE(started_at, NOW(3))
         WHERE id = ?`,
        [job.id]
      );

      await this.processJob(job);
    } catch (err: any) {
      console.warn('[MaterialWorker] Error during job polling:', err.message);
    }
  }

  public async processJob(job: any): Promise<void> {
    const { id: jobId, material_id: materialId, user_id: userId, title, storage_driver, storage_key, r2_object_key, detected_mime, material_kind } = job;

    try {
      const effectiveKey = storage_key || r2_object_key;
      if (!effectiveKey) {
        throw new Error('Không tìm thấy tệp lưu trữ.');
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

      if (material_kind === 'book') {
        // Save chapters and chunks
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

          await db.execute(
            `UPDATE material_processing_jobs
             SET status = 'completed',
                 progress_percent = 100,
                 completed_at = NOW(3)
             WHERE id = ?`,
            [jobId]
          );
        }
      }
    } catch (err: any) {
      console.error(`[MaterialWorker] Job ${jobId} failed:`, err);
      if (db.isHealthy()) {
        await db.execute(
          `UPDATE learning_materials
           SET processing_status = 'error',
               error_message = ?,
               updated_at = NOW(3)
           WHERE id = ?`,
          [err.message || 'Lỗi xử lý tài liệu', materialId]
        );

        await db.execute(
          `UPDATE material_processing_jobs
           SET status = 'failed',
               error_code = 'PROCESSING_ERROR',
               error_message = ?
           WHERE id = ?`,
          [err.message || 'Lỗi xử lý tài liệu', jobId]
        );
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
             error_message = NULL
         WHERE material_id = ? AND user_id = ?`,
        [materialId, userId]
      );
      return true;
    }
    return false;
  }
}

export const materialWorker = MaterialWorkerService.getInstance();
