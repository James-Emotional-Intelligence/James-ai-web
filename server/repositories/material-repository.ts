import { db } from '../db/mysql';
import { Material } from '../../shared/types';
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
                m.mime_type, m.size_bytes, m.processing_status, m.summary, m.created_at,
                s.name as subject_name
         FROM learning_materials m
         JOIN subjects s ON m.subject_id = s.id
         WHERE m.user_id = ? AND m.deleted_at IS NULL
         ORDER BY m.created_at DESC`,
        [userId]
      );

      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        subjectId: r.subject_id,
        subjectName: r.subject_name || 'Môn học',
        title: r.title,
        type: r.type,
        sizeBytes: Number(r.size_bytes) || 0,
        processingStatus: r.processing_status,
        summary: r.summary || undefined,
        createdAt: r.created_at ? r.created_at.toISOString?.() || String(r.created_at) : new Date().toISOString(),
      }));
    }

    return this.demoMaterials.get(userId) || [];
  }

  public async getById(userId: string, materialId: string): Promise<Material | null> {
    const list = await this.getByUserId(userId);
    return list.find((m) => m.id === materialId) || null;
  }

  public async create(userId: string, data: Partial<Material>): Promise<Material> {
    const id = 'mat_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const material: Material = {
      id,
      userId,
      subjectId: data.subjectId || 'subj-math',
      subjectName: data.subjectName || 'Toán học',
      title: (data.title || 'Tài liệu học tập').trim(),
      type: data.type || 'pdf',
      sizeBytes: data.sizeBytes || 1024 * 500,
      processingStatus: 'ready',
      summary: data.summary || 'Tóm tắt nội dung trọng tâm bài học theo chuẩn GDPT 2018.',
      createdAt: new Date().toISOString(),
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO learning_materials (id, user_id, subject_id, title, type, size_bytes, processing_status, summary, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, NOW(3))`,
        [material.id, userId, material.subjectId, material.title, material.type, material.sizeBytes, material.summary]
      );
    } else {
      const list = this.demoMaterials.get(userId) || [];
      list.unshift(material);
      this.demoMaterials.set(userId, list);
    }

    return material;
  }

  public async delete(userId: string, materialId: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute(
        `UPDATE learning_materials SET deleted_at = NOW(3) WHERE id = ? AND user_id = ?`,
        [materialId, userId]
      );
      return res?.affectedRows > 0;
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
