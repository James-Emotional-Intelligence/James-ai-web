import { db } from '../db/mysql';
import { DbExecutor } from '../db/mysql';
import { Exam, ExamTopic, ExamMilestone } from '../../shared/types';
import { subjectRepo } from './subject-repository';
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

  /**
   * Helper to compute exact milestones for an exam date and check if related quizzes exist
   */
  public computeMilestones(examId: string, examAtIso: string, completedQuizMilestones: Set<string> = new Set()): ExamMilestone[] {
    const examDate = new Date(examAtIso);
    const now = Date.now();
    const msInDay = 86400000;

    const milestonesConfig: { type: 'D-14' | 'D-7' | 'D-3' | 'D-1'; daysBefore: number; label: string }[] = [
      { type: 'D-14', daysBefore: 14, label: 'D-14: Đề chẩn đoán nền tảng' },
      { type: 'D-7', daysBefore: 7, label: 'D-7: Luyện đề tổng hợp' },
      { type: 'D-3', daysBefore: 3, label: 'D-3: Thi thử mô phỏng' },
      { type: 'D-1', daysBefore: 1, label: 'D-1: Rà soát & ôn lỗi sai' },
    ];

    return milestonesConfig.map((cfg, idx) => {
      const targetDate = new Date(examDate.getTime() - cfg.daysBefore * msInDay);
      const isCompleted = completedQuizMilestones.has(cfg.type);

      let status: ExamMilestone['status'];
      if (isCompleted) {
        status = 'completed';
      } else {
        const targetMs = targetDate.getTime();
        const nextTargetMs = idx < milestonesConfig.length - 1
          ? examDate.getTime() - milestonesConfig[idx + 1].daysBefore * msInDay
          : examDate.getTime();

        if (now >= targetMs && now < nextTargetMs) {
          status = 'current';
        } else if (now >= nextTargetMs) {
          status = 'overdue';
        } else {
          status = 'pending';
        }
      }

      return {
        examId,
        milestoneType: cfg.type,
        name: cfg.label,
        date: targetDate.toISOString(),
        status,
      };
    });
  }

  public async getByUserId(userId: string): Promise<Exam[]> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT e.id, e.user_id, e.subject_id, e.title, e.exam_at, e.importance, e.target_score, e.scope_text, e.status, e.created_at, e.updated_at,
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
          weight: Number(t.weight) || 1,
          notes: t.notes || undefined,
        }));

        // Check submitted quiz attempts for this exam
        const completedMilestoneRows = await db.query<any>(
          `SELECT DISTINCT q.milestone
           FROM quizzes q
           JOIN quiz_attempts qa ON q.id = qa.quiz_id
           WHERE q.exam_id = ? AND qa.user_id = ? AND qa.status = 'submitted' AND q.milestone IS NOT NULL`,
          [r.id, userId]
        );

        const completedSet = new Set<string>(completedMilestoneRows.map((m: any) => String(m.milestone)));
        const examAt = r.exam_at?.toISOString?.() || String(r.exam_at);
        const milestones = this.computeMilestones(r.id, examAt, completedSet);

        exams.push({
          id: r.id,
          userId: r.user_id,
          subjectId: r.subject_id,
          subjectName: r.subject_name || 'Môn học',
          subjectColor: r.subject_color || '#22C55E',
          title: r.title,
          examAt,
          importance: r.importance || 'high',
          targetScore: r.target_score !== null && r.target_score !== undefined ? Number(r.target_score) : undefined,
          scopeText: r.scope_text || '',
          topics,
          milestones,
          status: r.status || 'upcoming',
          createdAt: r.created_at?.toISOString?.() || String(r.created_at),
          updatedAt: r.updated_at?.toISOString?.() || String(r.updated_at),
        });
      }

      return exams;
    }

    return this.demoExams.get(userId) || [];
  }

  public async getById(userId: string, examId: string): Promise<Exam | null> {
    const list = await this.getByUserId(userId);
    return list.find((e) => e.id === examId) || null;
  }

  public async createExam(userId: string, data: Partial<Exam>, executor?: DbExecutor): Promise<Exam> {
    return this.create(userId, data, executor);
  }

  public async create(userId: string, data: Partial<Exam>, executor?: DbExecutor): Promise<Exam> {
    // 1. Verify subject ownership
    const subjects = await subjectRepo.getByUserId(userId);
    const targetSubject = data.subjectId ? subjects.find((s) => s.id === data.subjectId) : undefined;
    if (!targetSubject) throw new Error('INVALID_SUBJECT');
    if (!data.title?.trim() || !data.examAt) throw new Error('INVALID_EXAM_INPUT');
    const subjectId = targetSubject.id;
    const subjectName = targetSubject.name;
    const subjectColor = targetSubject.color;

    const id = 'exam_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const examAt = data.examAt;
    const milestones = this.computeMilestones(id, examAt);

    const created: Exam = {
      id,
      userId,
      subjectId,
      subjectName,
      subjectColor,
      title: data.title.trim(),
      examAt,
      importance: data.importance || 'high',
      targetScore: data.targetScore !== undefined && data.targetScore !== null ? Number(data.targetScore) : undefined,
      examFormat: data.examFormat || 'combined',
      scopeText: data.scopeText || '',
      topics: data.topics && data.topics.length > 0 ? data.topics : [],
      milestones,
      status: 'upcoming',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (executor || db.isHealthy()) {
      const write = async (conn: DbExecutor) => {
        await conn.execute(
          `INSERT INTO exams (id, user_id, subject_id, title, exam_at, importance, target_score, scope_text, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', NOW(3), NOW(3))`,
          [
            created.id,
            userId,
            created.subjectId,
            created.title,
            new Date(created.examAt),
            created.importance,
            created.targetScore ?? null,
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

        // Insert / Upsert exam_milestones
        for (const m of created.milestones || []) {
          const msId = 'ms_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
          await conn.execute(
            `INSERT INTO exam_milestones (id, exam_id, user_id, milestone_type, title, target_date, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
            [msId, created.id, userId, m.milestoneType, m.name, new Date(m.date), m.status]
          );
        }
      };
      if (executor) await write(executor);
      else await db.withTransaction(write);
    } else {
      const list = this.demoExams.get(userId) || [];
      list.push(created);
      this.demoExams.set(userId, list);
    }

    return created;
  }

  public async update(userId: string, examId: string, data: Partial<Exam>): Promise<Exam | null> {
    const existing = await this.getById(userId, examId);
    if (!existing) return null;

    const updated: Exam = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };

    if (data.examAt) {
      updated.milestones = this.computeMilestones(examId, data.examAt);
    }

    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        await conn.execute(
          `UPDATE exams 
           SET title = ?, subject_id = ?, exam_at = ?, importance = ?, target_score = ?, scope_text = ?, status = ?, updated_at = NOW(3)
           WHERE id = ? AND user_id = ?`,
          [
            updated.title,
            updated.subjectId,
            new Date(updated.examAt),
            updated.importance,
            updated.targetScore ?? null,
            updated.scopeText,
            updated.status || 'upcoming',
            examId,
            userId,
          ]
        );
      });
    } else {
      const list = this.demoExams.get(userId) || [];
      const idx = list.findIndex((e) => e.id === examId);
      if (idx !== -1) {
        list[idx] = updated;
        this.demoExams.set(userId, list);
      }
    }

    return updated;
  }

  public async delete(userId: string, examId: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute('DELETE FROM exams WHERE id = ? AND user_id = ?', [examId, userId]);
      return (res?.affectedRows || 0) > 0;
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
