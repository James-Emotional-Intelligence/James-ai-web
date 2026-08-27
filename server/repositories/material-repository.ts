import { db } from '../db/mysql';
import { Material, StructuredMaterialSummary } from '../../shared/types';
import { storageService, generateMaterialObjectKey, sanitizeFileName } from '../services/storage-service';
import crypto from 'crypto';

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
        `SELECT m.id, m.user_id, m.subject_id, m.title, m.type, m.r2_object_key,
                m.file_name, m.mime_type, m.size_bytes, m.sha256, m.processing_status,
                m.summary, m.summary_json, m.content_text, m.error_message, m.created_at, m.updated_at,
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
          fileName: r.file_name || undefined,
          r2ObjectKey: r.r2_object_key || undefined,
          mimeType: r.mime_type || undefined,
          sizeBytes: Number(r.size_bytes) || 0,
          sha256: r.sha256 || undefined,
          processingStatus: r.processing_status || 'ready',
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
    const r2ObjectKey = generateMaterialObjectKey(userId, sanitizedName);

    const type: 'pdf' | 'image' | 'notes' = data.mimeType.startsWith('image/') ? 'image' : 'pdf';

    const material: Material = {
      id,
      userId,
      subjectId: data.subjectId,
      title: data.title.trim(),
      type,
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
          id, user_id, subject_id, title, type, file_name, r2_object_key, mime_type,
          size_bytes, processing_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', NOW(3), NOW(3))`,
        [
          material.id,
          userId,
          material.subjectId,
          material.title,
          material.type,
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

    const material: Material = {
      id,
      userId,
      subjectId: data.subjectId,
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

  public async finalizeUpload(
    userId: string,
    materialId: string,
    meta?: { sizeBytes?: number; sha256?: string }
  ): Promise<Material | null> {
    const material = await this.getById(userId, materialId);
    if (!material) return null;

    let finalSize = meta?.sizeBytes || material.sizeBytes;
    let finalSha = meta?.sha256 || material.sha256;

    if (material.r2ObjectKey) {
      const stored = await storageService.headObject(material.r2ObjectKey);
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

      // Asynchronously delete R2 object
      if (material.r2ObjectKey) {
        storageService.deleteObject(material.r2ObjectKey).catch(() => {});
      }

      return res?.affectedRows > 0;
    }

    if (material.r2ObjectKey) {
      storageService.deleteObject(material.r2ObjectKey).catch(() => {});
    }

    const list = this.demoMaterials.get(userId) || [];
    const filtered = list.filter((m) => m.id !== materialId);
    this.demoMaterials.set(userId, filtered);
    return true;
  }

  public seedDemo(userId: string, materials: Material[]) {
    this.demoMaterials.set(userId, [...materials]);
  }
}

export const materialRepo = MaterialRepository.getInstance();
