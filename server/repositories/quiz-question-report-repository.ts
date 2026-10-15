import crypto from 'node:crypto';
import { db } from '../db/mysql';
import { quizRepo } from './quiz-repository';
import type { DbExecutor } from '../db/mysql';

export type QuestionReportStatus = 'pending' | 'reviewing' | 'confirmed_error' | 'rejected' | 'fixed';
export interface QuestionReport {
  id: string;
  quizId: string;
  questionId: string;
  attemptId?: string | null;
  reason: string;
  description?: string | null;
  status: QuestionReportStatus;
  reviewerNote?: string | null;
  createdAt: string;
  questionPrompt?: string;
  correctAnswer?: string;
  explanation?: string;
}

const clean = (value?: string) => value?.replace(/[<>]/g, ' ').split('').map((char) => char.charCodeAt(0) < 32 ? ' ' : char).join('').trim().slice(0, 1000) || null;
const missing = () => Object.assign(new Error('Không tìm thấy câu hỏi hoặc em không có quyền xem.'), { status: 404, code: 'QUESTION_NOT_FOUND' });

class QuizQuestionReportRepository {
  private demo = new Map<string, QuestionReport & { reporterUserId: string }>();

  private async reconcileQuestion(conn: DbExecutor, questionId: string): Promise<void> {
    const [impacted] = await conn.execute<any[]>(
      `SELECT DISTINCT a.id AS attempt_id, a.user_id, qz.subject_id, q.topic_ref
       FROM quiz_answers ans JOIN quiz_attempts a ON a.id = ans.attempt_id
       JOIN quiz_questions q ON q.id = ans.question_id JOIN quizzes qz ON qz.id = q.quiz_id
       WHERE ans.question_id = ? AND a.status = 'submitted'`, [questionId]
    );
    const affectedTopics = new Map<string, { userId: string; subjectId: string; topicKey: string }>();
    for (const row of impacted) {
      const [stats] = await conn.execute<any[]>(
        `SELECT COUNT(ans.is_correct) AS total, COALESCE(SUM(ans.is_correct), 0) AS correct_count
         FROM quiz_answers ans JOIN quiz_questions q ON q.id = ans.question_id
         WHERE ans.attempt_id = ? AND NOT EXISTS (
           SELECT 1 FROM quiz_question_reports r WHERE r.question_id = q.id
           AND r.status IN ('pending', 'reviewing', 'confirmed_error'))`, [row.attempt_id]
      );
      const total = Number(stats[0]?.total || 0);
      const score = total ? Number(((Number(stats[0].correct_count) / total) * 10).toFixed(2)) : 10;
      await conn.execute('UPDATE quiz_attempts SET score = ? WHERE id = ? AND user_id = ?', [score, row.attempt_id, row.user_id]);
      const topicKey = row.topic_ref || 'Kiến thức chung';
      affectedTopics.set(`${row.user_id}:${row.subject_id}:${topicKey}`, { userId: row.user_id, subjectId: row.subject_id, topicKey });
    }
    for (const topic of affectedTopics.values()) {
      const [stats] = await conn.execute<any[]>(
        `SELECT COUNT(ans.is_correct) AS total, COALESCE(SUM(ans.is_correct), 0) AS correct_count,
                COUNT(DISTINCT CASE WHEN ans.is_correct IS NOT NULL THEN ans.attempt_id END) AS attempts
         FROM quiz_answers ans JOIN quiz_questions q ON q.id = ans.question_id
         JOIN quizzes qz ON qz.id = q.quiz_id JOIN quiz_attempts a ON a.id = ans.attempt_id
         WHERE a.user_id = ? AND a.status = 'submitted' AND qz.subject_id = ? AND COALESCE(q.topic_ref, 'Kiến thức chung') = ?
         AND NOT EXISTS (SELECT 1 FROM quiz_question_reports r WHERE r.question_id = q.id
                         AND r.status IN ('pending', 'reviewing', 'confirmed_error'))`,
        [topic.userId, topic.subjectId, topic.topicKey]
      );
      const total = Number(stats[0]?.total || 0);
      const attempts = Number(stats[0]?.attempts || 0);
      await conn.execute(
        `UPDATE topic_mastery SET mastery_score = ?, evidence_count = ?, confidence = ?, updated_at = NOW(3)
         WHERE user_id = ? AND subject_id = ? AND topic_key = ?`,
        [total ? Math.round(Number(stats[0].correct_count) / total * 100) : 50,
          attempts, total ? Math.min(95, 30 + attempts * 15) : 0,
          topic.userId, topic.subjectId, topic.topicKey]
      );
    }
  }

  async create(userId: string, quizId: string, questionId: string, input: { reason: string; description?: string; attemptId?: string }): Promise<QuestionReport> {
    const quiz = await quizRepo.getById(userId, quizId, false);
    if (!quiz?.questions.some((q) => q.id === questionId)) throw missing();
    if (input.attemptId) {
      if (!(await quizRepo.ownsAttempt(userId, quizId, input.attemptId))) throw missing();
    }
    const existing = await this.getStatus(userId, quizId, questionId);
    if (existing) return existing;
    const report: QuestionReport = {
      id: `qr_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
      quizId, questionId, attemptId: input.attemptId || null,
      reason: input.reason, description: clean(input.description), status: 'pending', createdAt: new Date().toISOString(),
    };
    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        await conn.execute(
          `INSERT INTO quiz_question_reports (id, reporter_user_id, question_id, quiz_id, attempt_id, reason, description_sanitized, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending') ON DUPLICATE KEY UPDATE id = id`,
          [report.id, userId, questionId, quizId, report.attemptId, report.reason, report.description]
        );
        await this.reconcileQuestion(conn, questionId);
      });
      return (await this.getStatus(userId, quizId, questionId))!;
    }
    this.demo.set(`${userId}:${questionId}`, { ...report, reporterUserId: userId });
    return report;
  }

  async getStatus(userId: string, quizId: string, questionId: string): Promise<QuestionReport | null> {
    const quiz = await quizRepo.getById(userId, quizId, false);
    if (!quiz?.questions.some((q) => q.id === questionId)) throw missing();
    if (!db.isHealthy()) return this.demo.get(`${userId}:${questionId}`) || null;
    const rows = await db.query<any>(
      `SELECT id, quiz_id, question_id, attempt_id, reason, description_sanitized, status, reviewer_note, created_at
       FROM quiz_question_reports WHERE reporter_user_id = ? AND quiz_id = ? AND question_id = ? LIMIT 1`,
      [userId, quizId, questionId]
    );
    if (!rows.length) return null;
    const row = rows[0];
    return { id: row.id, quizId: row.quiz_id, questionId: row.question_id, attemptId: row.attempt_id,
      reason: row.reason, description: row.description_sanitized, status: row.status,
      reviewerNote: row.reviewer_note, createdAt: row.created_at?.toISOString?.() || String(row.created_at) };
  }

  async list(status: QuestionReportStatus | 'all', limit: number, offset: number): Promise<QuestionReport[]> {
    if (!db.isHealthy()) return [...this.demo.values()].filter((r) => status === 'all' || r.status === status).slice(offset, offset + limit).map(({ reporterUserId: _reporterUserId, ...report }) => report);
    const rows = await db.query<any>(
      `SELECT r.id, r.quiz_id, r.question_id, r.attempt_id, r.reason, r.description_sanitized, r.status, r.reviewer_note, r.created_at,
              q.prompt AS question_prompt, q.correct_answer_server_only AS correct_answer, q.explanation_server_only AS explanation
       FROM quiz_question_reports r JOIN quiz_questions q ON q.id = r.question_id
       ${status === 'all' ? '' : 'WHERE r.status = ?'} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      status === 'all' ? [limit, offset] : [status, limit, offset]
    );
    return rows.map((row: any) => ({ id: row.id, quizId: row.quiz_id, questionId: row.question_id,
      attemptId: row.attempt_id, reason: row.reason, description: row.description_sanitized,
      status: row.status, reviewerNote: row.reviewer_note,
      createdAt: row.created_at?.toISOString?.() || String(row.created_at),
      questionPrompt: row.question_prompt, correctAnswer: row.correct_answer, explanation: row.explanation }));
  }

  async review(id: string, reviewerId: string, status: QuestionReportStatus, note?: string): Promise<void> {
    if (!db.isHealthy()) {
      const report = [...this.demo.values()].find((r) => r.id === id);
      if (!report) throw Object.assign(new Error('Không tìm thấy phản ánh.'), { status: 404 });
      report.status = status;
      report.reviewerNote = clean(note);
      return;
    }
    await db.withTransaction(async (conn) => {
      const [rows] = await conn.execute<any[]>('SELECT status, question_id FROM quiz_question_reports WHERE id = ? FOR UPDATE', [id]);
      if (!rows.length) throw Object.assign(new Error('Không tìm thấy phản ánh.'), { status: 404 });
      const oldStatus = rows[0].status as string;
      if (oldStatus === status) return;
      await conn.execute(
        `UPDATE quiz_question_reports SET status = ?, reviewer_id = ?, reviewer_note = ?,
         resolved_at = CASE WHEN ? IN ('confirmed_error','rejected','fixed') THEN NOW(3) ELSE NULL END
         WHERE id = ?`, [status, reviewerId, clean(note), status, id]
      );
      await this.reconcileQuestion(conn, rows[0].question_id);
      await conn.execute(
        `INSERT INTO quiz_question_review_audit (id, report_id, reviewer_id, old_status, new_status, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [`qa_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`, id, reviewerId, oldStatus, status, clean(note)]
      );
    });
  }
}

export const quizQuestionReportRepo = new QuizQuestionReportRepository();
