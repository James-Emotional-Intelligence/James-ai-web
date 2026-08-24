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
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color || '#3B82F6',
        icon: r.icon || 'BookOpen',
      }));
    }

    return this.demoSubjects.get(userId) || [];
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
