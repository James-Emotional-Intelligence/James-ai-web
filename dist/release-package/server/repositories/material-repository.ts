import { db } from '../db/mysql';
import { Material, StructuredMaterialSummary } from '../../shared/types';
import { storageService, generateMaterialObjectKey, sanitizeFileName, getSafeExtension } from '../services/storage-service';
import { SubjectRepository } from './subject-repository';
import crypto from 'crypto';
import path from 'path';

export class MaterialRepository {
  private static instance: MaterialRepository;
  private demoMaterials: Map<string, Material[]> = new Map();

  private constructor() {}

  public static getInstance(): MaterialRepository {
    if (!MaterialRepository.instance) {
      MaterialRepository.instance = new MaterialRepository();
    }
    return MaterialRepository.instance;
  }

  public async getByUserId(userId: string): Promise<Material[]> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT m.id, m.user_id, m.subject_id, m.title, m.type, m.material_kind,
                m.storage_driver, m.storage_key, m.original_filename, m.detected_mime, m.extension,
                m.r2_object_key, m.file_name, m.mime_type, m.size_bytes, m.sha256, m.processing_status,
                m.summary, m.summary_json, m.content_text, m.error_message, m.processing_error_code,
                m.created_at, m.updated_at,
                s.name as subject_name
         FROM learning_materials m
         LEFT JOIN subjects s ON m.subject_id = s.id
         WHERE m.user_id = ? AND m.deleted_at IS NULL
         ORDER BY m.created_at DESC`,
        [userId]
      );

      return rows.map((r) => {
        let summaryJson: StructuredMaterialSummary | undefined = undefined;
        if (r.summary_json) {
          try {
            summaryJson = typeof r.summary_json === 'string' ? JSON.parse(r.summary_json) : r.summary_json;
          } catch {}
        }

        return {
          id: r.id,
          userId: r.user_id,
          subjectId: r.subject_id,
          subjectName: r.subject_name || 'Môn học',
          title: r.title,
          type: r.type,
          materialKind: r.material_kind || 'document',
          storageDriver: (r.storage_driver as any) || storageService.getActiveDriver(),
          storageKey: r.storage_key || r.r2_object_key || undefined,
          originalFilename: r.original_filename || r.file_name || undefined,
          detectedMime: r.detected_mime || r.mime_type || undefined,
          extension: r.extension || undefined,
          fileName: r.file_name || undefined,
          r2ObjectKey: r.r2_object_key || undefined,
          mimeType: r.mime_type || undefined,
          sizeBytes: Number(r.size_bytes) || 0,
          sha256: r.sha256 || undefined,
          processingStatus: r.processing_status || 'ready',
          processingErrorCode: r.processing_error_code || undefined,
          summary: r.summary || undefined,
          summaryJson,
          contentText: r.content_text || undefined,
          errorMessage: r.error_message || undefined,
          createdAt: r.created_at ? (r.created_at.toISOString?.() || String(r.created_at)) : new Date().toISOString(),
          updatedAt: r.updated_at ? (r.updated_at.toISOString?.() || String(r.updated_at)) : undefined,
        };
      });
    }

    return this.demoMaterials.get(userId) || [];
  }

  public async getById(userId: string, materialId: string): Promise<Material | null> {
    const list = await this.getByUserId(userId);
    return list.find((m) => m.id === materialId) || null;
  }

  public async createUploadIntent(
    userId: string,
    data: {
      title: string;
      subjectId: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }
  ): Promise<{ material: Material; uploadUrl: string; r2ObjectKey: string }> {
    const id = 'mat_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const sanitizedName = sanitizeFileName(data.fileName);
    const r2ObjectKey = generateMaterialObjectKey(userId, id, sanitizedName);
    const activeDriver = storageService.getActiveDriver();
    const safeExt = getSafeExtension(sanitizedName, data.mimeType);

    const type: 'pdf' | 'image' | 'notes' = data.mimeType.startsWith('image/') ? 'image' : 'pdf';

    let resolvedSubjectId = data.subjectId;
    if (db.isHealthy()) {
      let subjectExists = false;
      if (resolvedSubjectId) {
        const rows = await db.query<any>('SELECT id FROM subjects WHERE id = ? AND user_id = ?', [resolvedSubjectId, userId]);
        if (rows.length > 0) {
          subjectExists = true;
        }
      }
      if (!subjectExists) {
        const userSubjects = await SubjectRepository.getInstance().getByUserId(userId);
        if (userSubjects && userSubjects.length > 0) {
          resolvedSubjectId = userSubjects[0].id;
        }
      }
    }

    const material: Material = {
      id,
      userId,
      subjectId: resolvedSubjectId,
      title: data.title.trim(),
      type,
      storageDriver: activeDriver,
      storageKey: r2ObjectKey,
      extension: safeExt,
      originalFilename: sanitizedName,
      detectedMime: data.mimeType,
      fileName: sanitizedName,
      r2ObjectKey,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      processingStatus: 'uploading',
      createdAt: new Date().toISOString(),
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO learning_materials (
          id, user_id, subject_id, title, type, storage_driver, storage_key,
          original_filename, detected_mime, extension, file_name, r2_object_key,
          mime_type, size_bytes, processing_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', NOW(3), NOW(3))`,
        [
          material.id,
          userId,
          material.subjectId,
          material.title,
          material.type,
          activeDriver,
          r2ObjectKey,
          sanitizedName,
          data.mimeType,
          safeExt,
          material.fileName,
          material.r2ObjectKey,
          material.mimeType,
          material.sizeBytes,
        ]
      );
    } else {
      const list = this.demoMaterials.get(userId) || [];
      list.unshift(material);
      this.demoMaterials.set(userId, list);
    }

    const { uploadUrl } = await storageService.getSignedUploadUrl(r2ObjectKey, data.mimeType);

    return {
      material,
      uploadUrl,
      r2ObjectKey,
    };
  }

  public async createNote(
    userId: string,
    data: {
      title: string;
      subjectId: string;
      contentText: string;
    }
  ): Promise<Material> {
    const id = 'mat_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const sizeBytes = Buffer.byteLength(data.contentText, 'utf-8');

    let resolvedSubjectId = data.subjectId;
    if (db.isHealthy()) {
      let subjectExists = false;
      if (resolvedSubjectId) {
        const rows = await db.query<any>('SELECT id FROM subjects WHERE id = ? AND user_id = ?', [resolvedSubjectId, userId]);
        if (rows.length > 0) {
          subjectExists = true;
        }
      }
      if (!subjectExists) {
        const userSubjects = await SubjectRepository.getInstance().getByUserId(userId);
        if (userSubjects && userSubjects.length > 0) {
          resolvedSubjectId = userSubjects[0].id;
        }
      }
    }

    const material: Material = {
      id,
      userId,
      subjectId: resolvedSubjectId,
      title: data.title.trim(),
      type: 'notes',
      sizeBytes,
      contentText: data.contentText,
      processingStatus: 'queued',
      createdAt: new Date().toISOString(),
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO learning_materials (
          id, user_id, subject_id, title, type, size_bytes, content_text,
          processing_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'notes', ?, ?, 'queued', NOW(3), NOW(3))`,
        [material.id, userId, material.subjectId, material.title, sizeBytes, data.contentText]
      );
    } else {
      const list = this.demoMaterials.get(userId) || [];
      list.unshift(material);
      this.demoMaterials.set(userId, list);
    }

    return material;
  }

  public async createUploadedMaterial(
    userId: string,
    data: {
      materialId: string;
      title: string;
      subjectId: string;
      fileName: string;
      originalFilename: string;
      mimeType: string;
      detectedMime: string;
      extension: string;
      sizeBytes: number;
      sha256: string;
      storageDriver: 'local' | 'r2';
      storageKey: string;
      materialKind?: 'document' | 'book';
    }
  ): Promise<Material> {
    let resolvedSubjectId = data.subjectId;
    if (db.isHealthy()) {
      let subjectExists = false;
      if (resolvedSubjectId) {
        const rows = await db.query<any>('SELECT id FROM subjects WHERE id = ? AND user_id = ?', [resolvedSubjectId, userId]);
        if (rows.length > 0) subjectExists = true;
      }
      if (!subjectExists) {
        const userSubjects = await SubjectRepository.getInstance().getByUserId(userId);
        if (userSubjects && userSubjects.length > 0) {
          resolvedSubjectId = userSubjects[0].id;
        }
      }
    }

    const type: 'pdf' | 'image' | 'notes' | 'docx' | 'epub' | 'txt' =
      data.mimeType.startsWith('image/')
        ? 'image'
        : data.extension === 'docx'
        ? 'docx'
        : data.extension === 'epub'
        ? 'epub'
        : data.extension === 'txt' || data.extension === 'md'
        ? 'txt'
        : 'pdf';

    const material: Material = {
      id: data.materialId,
      userId,
      subjectId: resolvedSubjectId,
      title: data.title.trim(),
      type,
      materialKind: data.materialKind || 'document',
      storageDriver: data.storageDriver,
      storageKey: data.storageKey,
      originalFilename: data.originalFilename,
      detectedMime: data.detectedMime,
      extension: data.extension,
      fileName: data.fileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      sha256: data.sha256,
      processingStatus: 'queued',
      processingProgress: 10,
      createdAt: new Date().toISOString(),
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO learning_materials (
          id, user_id, subject_id, title, type, material_kind, storage_driver, storage_key,
          original_filename, detected_mime, extension, file_name, mime_type,
          size_bytes, sha256, processing_status, processing_progress, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 10, NOW(3), NOW(3))`,
        [
          material.id,
          userId,
          material.subjectId,
          material.title,
          material.type,
          material.materialKind,
          material.storageDriver,
          material.storageKey,
          material.originalFilename,
          material.detectedMime,
          material.extension,
          material.fileName,
          material.mimeType,
          material.sizeBytes,
          material.sha256,
        ]
      );
    } else {
      const list = this.demoMaterials.get(userId) || [];
      list.unshift(material);
      this.demoMaterials.set(userId, list);
    }

    return material;
  }

  public async finalizeUpload(
    userId: string,
    materialId: string,
    meta?: { sizeBytes?: number; sha256?: string }
  ): Promise<Material | null> {
    const material = await this.getById(userId, materialId);
    if (!material) return null;

    let finalSize = meta?.sizeBytes || material.sizeBytes;
    let finalSha = meta?.sha256 || material.sha256;

    const effectiveKey = material.storageKey || material.r2ObjectKey;
    if (effectiveKey) {
      const stored = await storageService.headObject(effectiveKey, material.storageDriver);
      if (stored) {
        finalSize = stored.size;
        finalSha = stored.sha256 || finalSha;
      }
    }

    if (db.isHealthy()) {
      await db.execute(
        `UPDATE learning_materials
         SET processing_status = 'queued', size_bytes = ?, sha256 = ?, updated_at = NOW(3)
         WHERE id = ? AND user_id = ?`,
        [finalSize, finalSha || null, materialId, userId]
      );
    } else {
      material.processingStatus = 'queued';
      material.sizeBytes = finalSize;
      material.sha256 = finalSha;
    }

    return this.getById(userId, materialId);
  }

  public async updateStatus(
    materialId: string,
    status: 'uploading' | 'queued' | 'processing' | 'ready' | 'error',
    summary?: string,
    summaryJson?: StructuredMaterialSummary,
    errorMessage?: string,
    contentText?: string
  ): Promise<void> {
    if (db.isHealthy()) {
      const setParts = ['processing_status = ?', 'updated_at = NOW(3)'];
      const params: any[] = [status];

      if (summary !== undefined) {
        setParts.push('summary = ?');
        params.push(summary);
      }
      if (summaryJson !== undefined) {
        setParts.push('summary_json = ?');
        params.push(JSON.stringify(summaryJson));
      }
      if (errorMessage !== undefined) {
        setParts.push('error_message = ?');
        params.push(errorMessage);
      }
      if (contentText !== undefined) {
        setParts.push('content_text = ?');
        params.push(contentText);
      }

      params.push(materialId);

      await db.execute(
        `UPDATE learning_materials SET ${setParts.join(', ')} WHERE id = ?`,
        params
      );
    } else {
      for (const list of this.demoMaterials.values()) {
        const item = list.find((m) => m.id === materialId);
        if (item) {
          item.processingStatus = status;
          if (summary !== undefined) item.summary = summary;
          if (summaryJson !== undefined) item.summaryJson = summaryJson;
          if (errorMessage !== undefined) item.errorMessage = errorMessage;
          if (contentText !== undefined) item.contentText = contentText;
          item.updatedAt = new Date().toISOString();
        }
      }
    }
  }

  public async create(userId: string, data: Partial<Material>): Promise<Material> {
    if (data.type === 'notes' || data.contentText) {
      return this.createNote(userId, {
        title: data.title || 'Ghi chú học tập',
        subjectId: data.subjectId || 'subj-math',
        contentText: data.contentText || data.summary || '',
      });
    }

    const intent = await this.createUploadIntent(userId, {
      title: data.title || 'Tài liệu học tập',
      subjectId: data.subjectId || 'subj-math',
      fileName: data.fileName || 'document.pdf',
      mimeType: data.mimeType || 'application/pdf',
      sizeBytes: data.sizeBytes || 1024,
    });

    return intent.material;
  }

  public async delete(userId: string, materialId: string): Promise<boolean> {
    const material = await this.getById(userId, materialId);
    if (!material) return false;

    if (db.isHealthy()) {
      const res = await db.execute(
        `UPDATE learning_materials SET deleted_at = NOW(3), processing_status = 'error' WHERE id = ? AND user_id = ?`,
        [materialId, userId]
      );

      // Asynchronously delete stored files
      const effectiveKey = material.storageKey || material.r2ObjectKey;
      if (effectiveKey) {
        if (material.storageDriver === 'local' && effectiveKey.startsWith('materials/')) {
          const dir = path.dirname(effectiveKey);
          storageService.deleteMaterialDirectory(dir, 'local').catch(() => {});
        } else {
          storageService.deleteObject(effectiveKey, material.storageDriver || 'r2').catch(() => {});
        }
      }

      return (res?.affectedRows || 0) > 0;
    }

    const effectiveKey = material.storageKey || material.r2ObjectKey;
    if (effectiveKey) {
      storageService.deleteObject(effectiveKey, material.storageDriver).catch(() => {});
    }

    const list = this.demoMaterials.get(userId) || [];
    const filtered = list.filter((m) => m.id !== materialId);
    this.demoMaterials.set(userId, filtered);
    return true;
  }

  public async rename(userId: string, materialId: string, newTitle: string): Promise<Material | null> {
    const existing = await this.getById(userId, materialId);
    if (!existing) return null;

    const title = newTitle.trim();
    if (!title) return existing;

    if (db.isHealthy()) {
      await db.execute(
        `UPDATE learning_materials SET title = ?, updated_at = NOW(3) WHERE id = ? AND user_id = ?`,
        [title, materialId, userId]
      );
    } else {
      existing.title = title;
      existing.updatedAt = new Date().toISOString();
    }

    return { ...existing, title, updatedAt: new Date().toISOString() };
  }

  public async getDownloadUrl(userId: string, materialId: string): Promise<{ downloadUrl: string; expiresAt: string } | null> {
    const material = await this.getById(userId, materialId);
    if (!material) return null;
    const effectiveKey = material.storageKey || material.r2ObjectKey;
    if (!effectiveKey) return null;

    const downloadUrl = await storageService.getSignedDownloadUrl(effectiveKey, material.originalFilename || material.fileName || 'document', 3600);
    return {
      downloadUrl,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    };
  }

  // ==========================================
  // Outlines Subsystem (6.2)
  // ==========================================

  private demoOutlines: Map<string, any[]> = new Map();

  public async getOutlines(userId: string, subjectId?: string): Promise<any[]> {
    if (db.isHealthy()) {
      let sql = `
        SELECT o.id, o.user_id, o.subject_id, o.material_id, o.title, o.chapter,
               o.content_markdown, o.key_points_json, o.formulas_json, o.is_pinned,
               o.created_at, o.updated_at,
               s.name as subject_name
        FROM outlines o
        LEFT JOIN subjects s ON o.subject_id = s.id
        WHERE o.user_id = ?
      `;
      const params: any[] = [userId];
      if (subjectId) {
        sql += ` AND o.subject_id = ?`;
        params.push(subjectId);
      }
      sql += ` ORDER BY o.is_pinned DESC, o.updated_at DESC`;

      const rows = await db.query<any>(sql, params);
      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        subjectId: r.subject_id,
        subjectName: r.subject_name || 'Môn học',
        materialId: r.material_id || undefined,
        title: r.title,
        chapter: r.chapter || undefined,
        contentMarkdown: r.content_markdown,
        keyPoints: r.key_points_json ? (typeof r.key_points_json === 'string' ? JSON.parse(r.key_points_json) : r.key_points_json) : [],
        formulas: r.formulas_json ? (typeof r.formulas_json === 'string' ? JSON.parse(r.formulas_json) : r.formulas_json) : [],
        isPinned: Boolean(r.is_pinned),
        createdAt: r.created_at?.toISOString?.() || String(r.created_at),
        updatedAt: r.updated_at?.toISOString?.() || String(r.updated_at),
      }));
    }

    const list = this.demoOutlines.get(userId) || [];
    if (subjectId) {
      return list.filter((o) => o.subjectId === subjectId);
    }
    return list;
  }

  public async getOutline(userId: string, outlineId: string): Promise<any | null> {
    const list = await this.getOutlines(userId);
    return list.find((o) => o.id === outlineId) || null;
  }

  public async createOutline(userId: string, data: any): Promise<any> {
    const id = 'out_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const now = new Date().toISOString();

    const created = {
      id,
      userId,
      subjectId: data.subjectId || 'subj-math',
      materialId: data.materialId || null,
      title: data.title || 'Đề cương ôn tập',
      chapter: data.chapter || '',
      contentMarkdown: data.contentMarkdown || '# Đề cương ôn tập\n\nNội dung chính...',
      keyPoints: data.keyPoints || [],
      formulas: data.formulas || [],
      isPinned: Boolean(data.isPinned),
      createdAt: now,
      updatedAt: now,
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO outlines (id, user_id, subject_id, material_id, title, chapter, content_markdown, key_points_json, formulas_json, is_pinned, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
        [
          created.id,
          userId,
          created.subjectId,
          created.materialId,
          created.title,
          created.chapter,
          created.contentMarkdown,
          JSON.stringify(created.keyPoints),
          JSON.stringify(created.formulas),
          created.isPinned ? 1 : 0,
        ]
      );
    } else {
      const list = this.demoOutlines.get(userId) || [];
      list.unshift(created);
      this.demoOutlines.set(userId, list);
    }

    return created;
  }

  public async updateOutline(userId: string, outlineId: string, data: any): Promise<any | null> {
    const existing = await this.getOutline(userId, outlineId);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };

    if (db.isHealthy()) {
      await db.execute(
        `UPDATE outlines
         SET title = ?, chapter = ?, content_markdown = ?, key_points_json = ?, formulas_json = ?, is_pinned = ?, updated_at = NOW(3)
         WHERE id = ? AND user_id = ?`,
        [
          updated.title,
          updated.chapter,
          updated.contentMarkdown,
          JSON.stringify(updated.keyPoints || []),
          JSON.stringify(updated.formulas || []),
          updated.isPinned ? 1 : 0,
          outlineId,
          userId,
        ]
      );
    } else {
      const list = this.demoOutlines.get(userId) || [];
      const idx = list.findIndex((o) => o.id === outlineId);
      if (idx !== -1) list[idx] = updated;
    }

    return updated;
  }

  public async deleteOutline(userId: string, outlineId: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute(
        `DELETE FROM outlines WHERE id = ? AND user_id = ?`,
        [outlineId, userId]
      );
      return res?.affectedRows > 0;
    }

    const list = this.demoOutlines.get(userId) || [];
    this.demoOutlines.set(userId, list.filter((o) => o.id !== outlineId));
    return true;
  }

  public seedDemo(userId: string, materials: Material[]) {
    this.demoMaterials.set(userId, [...materials]);
  }
}

export const materialRepo = MaterialRepository.getInstance();
