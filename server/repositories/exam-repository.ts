import { db } from '../db/mysql';
import { Exam, ExamTopic } from '../../shared/types';
import crypto from 'crypto';

export class ExamRepository {
  private static instance: ExamRepository;
  private demoExams: Map<string, Exam[]> = new Map();

  private constructor() {}

  public static getInstance(): ExamRepository {
    if (!ExamRepository.instance) {
      ExamRepository.instance = new ExamRepository();
    }
    return ExamRepository.instance;
  }

  public async getByUserId(userId: string): Promise<Exam[]> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT e.id, e.user_id, e.subject_id, e.title, e.exam_at, e.importance, e.scope_text, e.status,
                s.name as subject_name, s.color as subject_color
         FROM exams e
         JOIN subjects s ON e.subject_id = s.id
         WHERE e.user_id = ?
         ORDER BY e.exam_at ASC`,
        [userId]
      );

      const exams: Exam[] = [];

      for (const r of rows) {
        const topicRows = await db.query<any>(
          `SELECT id, topic_name, weight, notes, source_material_id FROM exam_topics WHERE exam_id = ?`,
          [r.id]
        );

        const topics: ExamTopic[] = topicRows.map((t) => ({
          id: t.id,
          name: t.topic_name,
          weight: t.weight,
          notes: t.notes,
        }));

        const examAt = r.exam_at?.toISOString?.() || String(r.exam_at);
        const daysRemaining = Math.max(0, Math.ceil((new Date(examAt).getTime() - Date.now()) / (24 * 3600 * 1000)));

        exams.push({
          id: r.id,
          userId: r.user_id,
          subjectId: r.subject_id,
          subjectName: r.subject_name || 'Môn học',
          title: r.title,
          examAt,
          importance: r.importance || 'high',
          scopeText: r.scope_text || '',
          topics,
          milestones: [
            { name: 'D-14: Ôn tập nền tảng', date: new Date(new Date(examAt).getTime() - 14 * 86400000).toISOString(), status: daysRemaining <= 14 ? 'completed' : 'pending' },
            { name: 'D-7: Luyện đề tổng hợp', date: new Date(new Date(examAt).getTime() - 7 * 86400000).toISOString(), status: daysRemaining <= 7 ? 'in_progress' : 'pending' },
            { name: 'D-3: Rà soát lỗi sai', date: new Date(new Date(examAt).getTime() - 3 * 86400000).toISOString(), status: daysRemaining <= 3 ? 'pending' : 'pending' },
            { name: 'D-1: Giữ tinh thần thoải mái', date: new Date(new Date(examAt).getTime() - 1 * 86400000).toISOString(), status: 'pending' },
          ],
        });
      }

      return exams;
    }

    return this.demoExams.get(userId) || [];
  }

  public async create(userId: string, data: Partial<Exam>): Promise<Exam> {
    const id = 'exam_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const examAt = data.examAt || new Date(Date.now() + 7 * 86400000).toISOString();
    const daysRemaining = Math.max(0, Math.ceil((new Date(examAt).getTime() - Date.now()) / (24 * 3600 * 1000)));

    const created: Exam = {
      id,
      userId,
      subjectId: data.subjectId || 'subj-math',
      subjectName: data.subjectName || 'Toán học',
      title: (data.title || 'Bài kiểm tra').trim(),
      examAt,
      importance: data.importance || 'high',
      scopeText: data.scopeText || '',
      topics: data.topics || [],
      milestones: [
        { name: 'D-14: Ôn tập nền tảng', date: new Date(new Date(examAt).getTime() - 14 * 86400000).toISOString(), status: daysRemaining <= 14 ? 'completed' : 'pending' },
        { name: 'D-7: Luyện đề tổng hợp', date: new Date(new Date(examAt).getTime() - 7 * 86400000).toISOString(), status: daysRemaining <= 7 ? 'in_progress' : 'pending' },
        { name: 'D-3: Rà soát lỗi sai', date: new Date(new Date(examAt).getTime() - 3 * 86400000).toISOString(), status: 'pending' },
        { name: 'D-1: Chuẩn bị dụng cụ & tâm lý', date: new Date(new Date(examAt).getTime() - 1 * 86400000).toISOString(), status: 'pending' },
      ],
    };

    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        await conn.execute(
          `INSERT INTO exams (id, user_id, subject_id, title, exam_at, importance, scope_text, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'upcoming', NOW(3), NOW(3))`,
          [
            created.id,
            userId,
            created.subjectId,
            created.title,
            new Date(created.examAt),
            created.importance,
            created.scopeText,
          ]
        );

        for (const topic of created.topics) {
          const topicId = topic.id || 'topic_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
          await conn.execute(
            `INSERT INTO exam_topics (id, exam_id, topic_name, weight, notes)
             VALUES (?, ?, ?, ?, ?)`,
            [topicId, created.id, topic.name, topic.weight || 1, topic.notes || null]
          );
        }
      });
    } else {
      const list = this.demoExams.get(userId) || [];
      list.push(created);
      this.demoExams.set(userId, list);
    }

    return created;
  }

  public async delete(userId: string, examId: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute('DELETE FROM exams WHERE id = ? AND user_id = ?', [examId, userId]);
      return res?.affectedRows > 0;
    }

    const list = this.demoExams.get(userId) || [];
    const filtered = list.filter((e) => e.id !== examId);
    this.demoExams.set(userId, filtered);
    return true;
  }

  public seedDemo(userId: string, exams: Exam[]) {
    this.demoExams.set(userId, [...exams]);
  }
}

export const examRepo = ExamRepository.getInstance();
