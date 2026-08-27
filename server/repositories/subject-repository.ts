import { db } from '../db/mysql';
import { Subject } from '../../shared/types';
import { env } from '../config/env';
import crypto from 'crypto';

export class SubjectRepository {
  private static instance: SubjectRepository;
  private demoSubjects: Map<string, Subject[]> = new Map();

  private constructor() {}

  public static getInstance(): SubjectRepository {
    if (!SubjectRepository.instance) {
      SubjectRepository.instance = new SubjectRepository();
    }
    return SubjectRepository.instance;
  }

  public async getByUserId(userId: string): Promise<Subject[]> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT id, user_id, name, color, icon, sort_order, archived_at
         FROM subjects
         WHERE user_id = ? AND archived_at IS NULL
         ORDER BY sort_order ASC, name ASC`,
        [userId]
      );

      if (rows.length === 0) {
        // Auto-provision standard Vietnamese curriculum subjects for student
        const defaults = [
          { name: 'Toán học', color: '#3B82F6', icon: 'Calculator' },
          { name: 'Ngữ văn', color: '#F59E0B', icon: 'BookOpen' },
          { name: 'Tiếng Anh', color: '#06B6D4', icon: 'Languages' },
          { name: 'Vật lý', color: '#8B5CF6', icon: 'Zap' },
          { name: 'Hóa học', color: '#EC4899', icon: 'FlaskConical' },
          { name: 'Sinh học', color: '#10B981', icon: 'Dna' },
          { name: 'Lịch sử', color: '#D97706', icon: 'Hourglass' },
          { name: 'Địa lý', color: '#14B8A6', icon: 'Compass' },
          { name: 'Tin học', color: '#6366F1', icon: 'Laptop' },
          { name: 'GDCD', color: '#64748B', icon: 'Scale' },
        ];

        for (const d of defaults) {
          const id = 'subj_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
          await db.execute(
            `INSERT INTO subjects (id, user_id, name, color, icon, sort_order, archived_at)
             VALUES (?, ?, ?, ?, ?, 0, NULL)`,
            [id, userId, d.name, d.color, d.icon]
          ).catch(() => {});
        }

        const freshRows = await db.query<any>(
          `SELECT id, user_id, name, color, icon, sort_order, archived_at
           FROM subjects
           WHERE user_id = ? AND archived_at IS NULL
           ORDER BY sort_order ASC, name ASC`,
          [userId]
        );
        return freshRows.map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color || '#3B82F6',
          icon: r.icon || 'BookOpen',
        }));
      }

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color || '#3B82F6',
        icon: r.icon || 'BookOpen',
      }));
    }

    const demo = this.demoSubjects.get(userId);
    if (!demo || demo.length === 0) {
      const defaults: Subject[] = [
        { id: 'subj-math', name: 'Toán học', color: '#3B82F6', icon: 'Calculator' },
        { id: 'subj-literature', name: 'Ngữ văn', color: '#F59E0B', icon: 'BookOpen' },
        { id: 'subj-english', name: 'Tiếng Anh', color: '#06B6D4', icon: 'Languages' },
        { id: 'subj-physics', name: 'Vật lý', color: '#8B5CF6', icon: 'Zap' },
        { id: 'subj-chemistry', name: 'Hóa học', color: '#EC4899', icon: 'FlaskConical' },
        { id: 'subj-biology', name: 'Sinh học', color: '#10B981', icon: 'Dna' },
        { id: 'subj-history', name: 'Lịch sử', color: '#D97706', icon: 'Hourglass' },
        { id: 'subj-geography', name: 'Địa lý', color: '#14B8A6', icon: 'Compass' },
        { id: 'subj-informatics', name: 'Tin học', color: '#6366F1', icon: 'Laptop' },
        { id: 'subj-civics', name: 'GDCD', color: '#64748B', icon: 'Scale' },
      ];
      this.demoSubjects.set(userId, defaults);
      return defaults;
    }

    return demo;
  }

  public async create(userId: string, data: { name: string; color?: string; icon?: string }): Promise<Subject> {
    const id = 'subj_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const subject: Subject = {
      id,
      name: data.name.trim(),
      color: data.color || '#3B82F6',
      icon: data.icon || 'BookOpen',
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO subjects (id, user_id, name, color, icon, sort_order, archived_at)
         VALUES (?, ?, ?, ?, ?, 0, NULL)`,
        [subject.id, userId, subject.name, subject.color, subject.icon]
      );
    } else {
      const list = this.demoSubjects.get(userId) || [];
      list.push(subject);
      this.demoSubjects.set(userId, list);
    }

    return subject;
  }

  public async delete(userId: string, id: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute(
        `UPDATE subjects SET archived_at = NOW(3) WHERE id = ? AND user_id = ?`,
        [id, userId]
      );
      return res?.affectedRows > 0;
    }

    const list = this.demoSubjects.get(userId) || [];
    const filtered = list.filter((s) => s.id !== id);
    this.demoSubjects.set(userId, filtered);
    return true;
  }

  public seedDemoSubjects(userId: string, subjects: Subject[]) {
    this.demoSubjects.set(userId, [...subjects]);
  }
}

export const subjectRepo = SubjectRepository.getInstance();
