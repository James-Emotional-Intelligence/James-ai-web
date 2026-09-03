import { db } from '../db/mysql';
import { isProduction, isDatabaseRequired } from '../config/env';
import {
  MistakeNotebookEntry,
  MistakeReviewAttempt,
  MistakeReason,
  MistakeStatus,
  MistakeDifficulty,
  MistakeSourceType,
} from '../../shared/types';
import crypto from 'crypto';

const SPACED_REPETITION_INTERVALS = [1, 3, 7, 14, 30];

export class MistakeRepository {
  private demoMistakes = new Map<string, MistakeNotebookEntry[]>();
  private demoAttempts = new Map<string, MistakeReviewAttempt[]>();

  public async getByUserId(
    userId: string,
    filters?: {
      subjectId?: string;
      topic?: string;
      status?: string;
      difficulty?: string;
      dueOnly?: boolean;
      search?: string;
    }
  ): Promise<MistakeNotebookEntry[]> {
    if (db.isHealthy()) {
      let query = `
        SELECT m.id, m.user_id, m.subject_id, m.topic, m.question_text, m.question_data_json,
               m.selected_answer, m.correct_answer, m.mistake_reason, m.correct_explanation,
               m.difficulty, m.source_type, m.source_id, m.first_mistake_at, m.last_reviewed_at,
               m.next_review_at, m.review_count, m.correct_streak, m.status,
               m.created_at, m.updated_at,
               s.name as subject_name
        FROM mistake_notebook_entries m
        LEFT JOIN subjects s ON m.subject_id = s.id
        WHERE m.user_id = ?
      `;
      const params: any[] = [userId];

      if (filters?.subjectId) {
        query += ' AND m.subject_id = ?';
        params.push(filters.subjectId);
      }
      if (filters?.topic) {
        query += ' AND m.topic = ?';
        params.push(filters.topic);
      }
      if (filters?.status && filters.status !== 'all') {
        query += ' AND m.status = ?';
        params.push(filters.status);
      }
      if (filters?.difficulty && filters.difficulty !== 'all') {
        query += ' AND m.difficulty = ?';
        params.push(filters.difficulty);
      }
      if (filters?.dueOnly) {
        query += ' AND m.next_review_at <= NOW(3) AND m.status != "mastered"';
      }
      if (filters?.search) {
        query += ' AND (m.question_text LIKE ? OR m.topic LIKE ? OR m.correct_explanation LIKE ?)';
        const term = `%${filters.search}%`;
        params.push(term, term, term);
      }

      query += ' ORDER BY m.next_review_at ASC, m.created_at DESC';

      const rows = await db.query<any>(query, params);
      return rows.map(this.mapMistakeRow);
    }

    let list = this.demoMistakes.get(userId) || [];
    if (filters?.subjectId) list = list.filter((m) => m.subjectId === filters.subjectId);
    if (filters?.topic) list = list.filter((m) => m.topic === filters.topic);
    if (filters?.status && filters.status !== 'all') list = list.filter((m) => m.status === filters.status);
    if (filters?.difficulty && filters.difficulty !== 'all') list = list.filter((m) => m.difficulty === filters.difficulty);
    if (filters?.dueOnly) {
      const now = new Date().toISOString();
      list = list.filter((m) => m.nextReviewAt <= now && m.status !== 'mastered');
    }
    if (filters?.search) {
      const term = filters.search.toLowerCase();
      list = list.filter(
        (m) =>
          m.questionText.toLowerCase().includes(term) ||
          m.topic.toLowerCase().includes(term) ||
          (m.correctExplanation && m.correctExplanation.toLowerCase().includes(term))
      );
    }
    return JSON.parse(JSON.stringify(list));
  }

  public async getById(userId: string, mistakeId: string): Promise<MistakeNotebookEntry | null> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT m.id, m.user_id, m.subject_id, m.topic, m.question_text, m.question_data_json,
                m.selected_answer, m.correct_answer, m.mistake_reason, m.correct_explanation,
                m.difficulty, m.source_type, m.source_id, m.first_mistake_at, m.last_reviewed_at,
                m.next_review_at, m.review_count, m.correct_streak, m.status,
                m.created_at, m.updated_at,
                s.name as subject_name
         FROM mistake_notebook_entries m
         LEFT JOIN subjects s ON m.subject_id = s.id
         WHERE m.user_id = ? AND m.id = ?
         LIMIT 1`,
        [userId, mistakeId]
      );
      if (rows.length === 0) return null;
      return this.mapMistakeRow(rows[0]);
    }

    const list = this.demoMistakes.get(userId) || [];
    const found = list.find((m) => m.id === mistakeId);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  public async create(
    userId: string,
    data: {
      subjectId?: string | null;
      topic: string;
      questionText: string;
      questionDataJson?: string | null;
      selectedAnswer?: string | null;
      correctAnswer: string;
      mistakeReason?: MistakeReason;
      correctExplanation?: string | null;
      difficulty?: MistakeDifficulty;
      sourceType?: MistakeSourceType;
      sourceId?: string | null;
    }
  ): Promise<MistakeNotebookEntry> {
    const id = 'mst_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const nowIso = new Date().toISOString();
    // Next review starts at 1 day from now
    const nextReview = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    const entry: MistakeNotebookEntry = {
      id,
      userId,
      subjectId: data.subjectId || undefined,
      topic: data.topic,
      questionText: data.questionText,
      questionDataJson: data.questionDataJson || undefined,
      selectedAnswer: data.selectedAnswer || undefined,
      correctAnswer: data.correctAnswer,
      mistakeReason: data.mistakeReason || 'other',
      correctExplanation: data.correctExplanation || undefined,
      difficulty: data.difficulty || 'medium',
      sourceType: data.sourceType || 'manual',
      sourceId: data.sourceId || undefined,
      firstMistakeAt: nowIso,
      nextReviewAt: nextReview,
      reviewCount: 0,
      correctStreak: 0,
      status: 'new',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO mistake_notebook_entries
          (id, user_id, subject_id, topic, question_text, question_data_json, selected_answer, correct_answer,
           mistake_reason, correct_explanation, difficulty, source_type, source_id, first_mistake_at, next_review_at,
           review_count, correct_streak, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), ?, 0, 0, 'new', NOW(3), NOW(3))`,
        [
          id,
          userId,
          data.subjectId || null,
          data.topic,
          data.questionText,
          data.questionDataJson || null,
          data.selectedAnswer || null,
          data.correctAnswer,
          data.mistakeReason || 'other',
          data.correctExplanation || null,
          data.difficulty || 'medium',
          data.sourceType || 'manual',
          data.sourceId || null,
          nextReview,
        ]
      );
    } else {
      if (isProduction || isDatabaseRequired) {
        throw new Error('[JAMI Database] Database is unreachable. Cannot record mistake notebook entry.');
      }
      const list = this.demoMistakes.get(userId) || [];
      list.push(entry);
      this.demoMistakes.set(userId, list);
    }

    return entry;
  }

  public async update(
    userId: string,
    mistakeId: string,
    data: {
      subjectId?: string | null;
      topic?: string;
      questionText?: string;
      selectedAnswer?: string | null;
      correctAnswer?: string;
      mistakeReason?: MistakeReason;
      correctExplanation?: string | null;
      difficulty?: MistakeDifficulty;
      status?: MistakeStatus;
    }
  ): Promise<MistakeNotebookEntry | null> {
    const existing = await this.getById(userId, mistakeId);
    if (!existing) return null;

    if (db.isHealthy()) {
      const setClauses: string[] = ['updated_at = NOW(3)'];
      const params: any[] = [];

      if (data.subjectId !== undefined) {
        setClauses.push('subject_id = ?');
        params.push(data.subjectId);
      }
      if (data.topic !== undefined) {
        setClauses.push('topic = ?');
        params.push(data.topic);
      }
      if (data.questionText !== undefined) {
        setClauses.push('question_text = ?');
        params.push(data.questionText);
      }
      if (data.selectedAnswer !== undefined) {
        setClauses.push('selected_answer = ?');
        params.push(data.selectedAnswer);
      }
      if (data.correctAnswer !== undefined) {
        setClauses.push('correct_answer = ?');
        params.push(data.correctAnswer);
      }
      if (data.mistakeReason !== undefined) {
        setClauses.push('mistake_reason = ?');
        params.push(data.mistakeReason);
      }
      if (data.correctExplanation !== undefined) {
        setClauses.push('correct_explanation = ?');
        params.push(data.correctExplanation);
      }
      if (data.difficulty !== undefined) {
        setClauses.push('difficulty = ?');
        params.push(data.difficulty);
      }
      if (data.status !== undefined && data.status !== 'mastered') {
        setClauses.push('status = ?');
        params.push(data.status);
      }

      params.push(userId, mistakeId);
      await db.execute(
        `UPDATE mistake_notebook_entries SET ${setClauses.join(', ')} WHERE user_id = ? AND id = ?`,
        params
      );
    } else {
      const list = this.demoMistakes.get(userId) || [];
      const item = list.find((m) => m.id === mistakeId);
      if (item) {
        Object.assign(item, data, { updatedAt: new Date().toISOString() });
      }
    }

    return await this.getById(userId, mistakeId);
  }

  public async recordReviewAttempt(
    userId: string,
    mistakeId: string,
    answer: string,
    isCorrect: boolean
  ): Promise<{ entry: MistakeNotebookEntry; attempt: MistakeReviewAttempt }> {
    const existing = await this.getById(userId, mistakeId);
    if (!existing) {
      throw new Error('Không tìm thấy mục lỗi sai trong sổ');
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const newStreak = isCorrect ? existing.correctStreak + 1 : 0;
    let newStatus: MistakeStatus;

    // Spaced repetition interval in days (1, 3, 7, 14, 30)
    let daysToAdd: number;
    if (isCorrect) {
      const intervalIdx = Math.min(newStreak - 1, SPACED_REPETITION_INTERVALS.length - 1);
      daysToAdd = SPACED_REPETITION_INTERVALS[intervalIdx] || 1;
      newStatus = newStreak >= SPACED_REPETITION_INTERVALS.length ? 'mastered' : 'reviewing';
    } else {
      daysToAdd = 1;
      newStatus = 'needs_retry';
    }

    const nextReviewDate = new Date(now.getTime() + daysToAdd * 24 * 3600 * 1000);
    const nextReviewIso = nextReviewDate.toISOString();
    const reviewCount = existing.reviewCount + 1;

    const attemptId = 'att_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const attempt: MistakeReviewAttempt = {
      id: attemptId,
      mistakeEntryId: mistakeId,
      userId,
      answer,
      isCorrect,
      reviewedAt: nowIso,
      nextReviewAt: nextReviewIso,
      createdAt: nowIso,
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO mistake_review_attempts
          (id, mistake_entry_id, user_id, answer, is_correct, reviewed_at, next_review_at, created_at)
         VALUES (?, ?, ?, ?, ?, NOW(3), ?, NOW(3))`,
        [attemptId, mistakeId, userId, answer, isCorrect ? 1 : 0, nextReviewIso]
      );

      await db.execute(
        `UPDATE mistake_notebook_entries
         SET last_reviewed_at = NOW(3),
             next_review_at = ?,
             review_count = ?,
             correct_streak = ?,
             status = ?,
             updated_at = NOW(3)
         WHERE user_id = ? AND id = ?`,
        [nextReviewIso, reviewCount, newStreak, newStatus, userId, mistakeId]
      );
    } else {
      const list = this.demoMistakes.get(userId) || [];
      const item = list.find((m) => m.id === mistakeId);
      if (item) {
        item.lastReviewedAt = nowIso;
        item.nextReviewAt = nextReviewIso;
        item.reviewCount = reviewCount;
        item.correctStreak = newStreak;
        item.status = newStatus;
        item.updatedAt = nowIso;
      }
      const attemptsList = this.demoAttempts.get(userId) || [];
      attemptsList.push(attempt);
      this.demoAttempts.set(userId, attemptsList);
    }

    const updated = await this.getById(userId, mistakeId);
    return { entry: updated!, attempt };
  }

  public async delete(userId: string, mistakeId: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute(
        `DELETE FROM mistake_notebook_entries WHERE user_id = ? AND id = ?`,
        [userId, mistakeId]
      );
      return (res?.affectedRows || 0) > 0;
    }

    const list = this.demoMistakes.get(userId) || [];
    const idx = list.findIndex((m) => m.id === mistakeId);
    if (idx >= 0) {
      list.splice(idx, 1);
      this.demoMistakes.set(userId, list);
      return true;
    }
    return false;
  }

  private mapMistakeRow(r: any): MistakeNotebookEntry {
    return {
      id: r.id,
      userId: r.user_id,
      subjectId: r.subject_id || undefined,
      subjectName: r.subject_name || undefined,
      topic: r.topic,
      questionText: r.question_text,
      questionDataJson: r.question_data_json || undefined,
      selectedAnswer: r.selected_answer || undefined,
      correctAnswer: r.correct_answer,
      mistakeReason: r.mistake_reason as MistakeReason,
      correctExplanation: r.correct_explanation || undefined,
      difficulty: r.difficulty as MistakeDifficulty,
      sourceType: r.source_type as MistakeSourceType,
      sourceId: r.source_id || undefined,
      firstMistakeAt: new Date(r.first_mistake_at).toISOString(),
      lastReviewedAt: r.last_reviewed_at ? new Date(r.last_reviewed_at).toISOString() : undefined,
      nextReviewAt: new Date(r.next_review_at).toISOString(),
      reviewCount: Number(r.review_count || 0),
      correctStreak: Number(r.correct_streak || 0),
      status: r.status as MistakeStatus,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }
}

export const mistakeRepo = new MistakeRepository();
