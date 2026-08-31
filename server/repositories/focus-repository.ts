import { db } from '../db/mysql';
import { FocusSession } from '../../shared/types';
import crypto from 'crypto';

export class FocusRepository {
  private static instance: FocusRepository;
  private demoSessions: Map<string, FocusSession[]> = new Map();

  private constructor() {}

  public static getInstance(): FocusRepository {
    if (!FocusRepository.instance) {
      FocusRepository.instance = new FocusRepository();
    }
    return FocusRepository.instance;
  }

  public async getSessionsByUserId(userId: string): Promise<FocusSession[]> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT f.id, f.user_id, f.task_id, f.mode, f.phase, f.planned_minutes, f.break_minutes, f.state,
                f.started_at, f.paused_at, f.ended_at, f.last_resumed_at, f.target_end_at,
                f.remaining_seconds_at_pause, f.actual_focus_seconds, f.accumulated_pause_seconds,
                f.pause_count, f.notes, f.outcome, f.created_at,
                t.title as task_title, s.name as subject_name
         FROM focus_sessions f
         LEFT JOIN study_tasks t ON f.task_id = t.id
         LEFT JOIN subjects s ON t.subject_id = s.id
         WHERE f.user_id = ?
         ORDER BY f.created_at DESC`,
        [userId]
      );

      return rows.map((r) => this.mapSessionRow(r));
    }

    return this.demoSessions.get(userId) || [];
  }

  public async getCurrentSession(userId: string): Promise<FocusSession | null> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT f.id, f.user_id, f.task_id, f.mode, f.phase, f.planned_minutes, f.break_minutes, f.state,
                f.started_at, f.paused_at, f.ended_at, f.last_resumed_at, f.target_end_at,
                f.remaining_seconds_at_pause, f.actual_focus_seconds, f.accumulated_pause_seconds,
                f.pause_count, f.notes, f.outcome, f.created_at,
                t.title as task_title, s.name as subject_name
         FROM focus_sessions f
         LEFT JOIN study_tasks t ON f.task_id = t.id
         LEFT JOIN subjects s ON t.subject_id = s.id
         WHERE f.user_id = ? AND f.state IN ('running', 'paused', 'break')
         ORDER BY f.created_at DESC
         LIMIT 1`,
        [userId]
      );

      if (rows.length > 0) {
        return this.mapSessionRow(rows[0]);
      }
      return null;
    }

    const list = this.demoSessions.get(userId) || [];
    const active = list.find((s) => s.state === 'running' || s.state === 'paused' || s.state === 'break');
    return active ? { ...active, serverNow: new Date().toISOString() } : null;
  }

  public async getCurrentActiveSession(userId: string): Promise<FocusSession | null> {
    return this.getCurrentSession(userId);
  }

  public async createSession(userId: string, data: Partial<FocusSession>): Promise<FocusSession> {
    return this.startSession(userId, data.taskId, data.mode || '25_5', data.plannedMinutes, data.breakMinutes, data.idempotencyKey);
  }

  public async startSession(
    userId: string,
    taskId?: string,
    mode: string = '25_5',
    minutes?: number,
    breakMinutes?: number,
    idempotencyKey?: string
  ): Promise<FocusSession> {
    const plannedM =
      minutes ||
      (mode === '15'
        ? 15
        : mode === '25' || mode === '25_5'
        ? 25
        : mode === '45' || mode === '45_10'
        ? 45
        : mode === '60'
        ? 60
        : mode === 'custom'
        ? 30
        : 25);
    const breakM =
      breakMinutes ||
      (mode === '15'
        ? 3
        : mode === '25' || mode === '25_5'
        ? 5
        : mode === '45' || mode === '45_10'
        ? 10
        : mode === '60'
        ? 15
        : 5);
    const totalSeconds = plannedM * 60;
    const now = new Date();
    const targetEndAt = new Date(now.getTime() + totalSeconds * 1000);
    const id = 'foc_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);

    const session: FocusSession = {
      id,
      userId,
      taskId: taskId || undefined,
      mode,
      phase: 'work',
      plannedMinutes: plannedM,
      breakMinutes: breakM,
      state: 'running',
      startedAt: now.toISOString(),
      lastResumedAt: now.toISOString(),
      targetEndAt: targetEndAt.toISOString(),
      remainingSecondsAtPause: totalSeconds,
      actualFocusSeconds: 0,
      accumulatedPauseSeconds: 0,
      pauseCount: 0,
      idempotencyKey,
      serverNow: now.toISOString(),
      createdAt: now.toISOString(),
    };

    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        // Abandon any existing active session to enforce single active session constraint
        await conn.execute(
          `UPDATE focus_sessions 
           SET state = 'abandoned', ended_at = NOW(3), outcome = 'replaced_by_new_session', updated_at = NOW(3)
           WHERE user_id = ? AND state IN ('running', 'paused', 'break')`,
          [userId]
        );

        let validTaskId: string | null = null;
        if (session.taskId) {
          const taskRows = await conn.query<any>('SELECT id FROM study_tasks WHERE id = ?', [session.taskId]);
          if (taskRows && taskRows.length > 0) {
            validTaskId = session.taskId;
          }
        }

        await conn.execute(
          `INSERT INTO focus_sessions 
           (id, user_id, task_id, mode, phase, planned_minutes, break_minutes, state, started_at, last_resumed_at, target_end_at, remaining_seconds_at_pause, actual_focus_seconds, accumulated_pause_seconds, pause_count, idempotency_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'work', ?, ?, 'running', NOW(3), NOW(3), ?, ?, 0, 0, 0, ?, NOW(3), NOW(3))`,
          [
            session.id,
            userId,
            validTaskId,
            session.mode,
            session.plannedMinutes,
            session.breakMinutes,
            targetEndAt,
            totalSeconds,
            session.idempotencyKey || null,
          ]
        );
      });
    } else {
      const list = this.demoSessions.get(userId) || [];
      // Abandon prior active sessions
      for (const s of list) {
        if (s.state === 'running' || s.state === 'paused' || s.state === 'break') {
          s.state = 'abandoned';
          s.endedAt = now.toISOString();
        }
      }
      list.unshift(session);
      this.demoSessions.set(userId, list);
    }

    return session;
  }

  public async pauseSession(userId: string, sessionId: string): Promise<FocusSession> {
    const existing = await this.getCurrentSession(userId);
    if (!existing || existing.id !== sessionId) {
      throw new Error('Phiên tập trung không tồn tại hoặc đã kết thúc');
    }
    if (existing.state !== 'running' && existing.state !== 'break') {
      throw new Error(`Không thể tạm dừng phiên ở trạng thái "${existing.state}"`);
    }

    const now = Date.now();
    const lastResumed = existing.lastResumedAt ? new Date(existing.lastResumedAt).getTime() : (existing.startedAt ? new Date(existing.startedAt).getTime() : now);
    const elapsedSinceResume = Math.max(0, Math.floor((now - lastResumed) / 1000));
    const accumulatedFocusSeconds = (existing.actualFocusSeconds || 0) + elapsedSinceResume;

    let remainingSeconds = existing.remainingSecondsAtPause || existing.plannedMinutes * 60;
    if (existing.targetEndAt) {
      remainingSeconds = Math.max(0, Math.ceil((new Date(existing.targetEndAt).getTime() - now) / 1000));
    }

    const pausedAtIso = new Date().toISOString();
    const pauseCount = (existing.pauseCount || 0) + 1;

    if (db.isHealthy()) {
      await db.execute(
        `UPDATE focus_sessions 
         SET state = 'paused', paused_at = NOW(3), remaining_seconds_at_pause = ?, actual_focus_seconds = ?, pause_count = ?, updated_at = NOW(3)
         WHERE id = ? AND user_id = ?`,
        [remainingSeconds, accumulatedFocusSeconds, pauseCount, sessionId, userId]
      );
    } else {
      const list = this.demoSessions.get(userId) || [];
      const target = list.find((s) => s.id === sessionId);
      if (target) {
        target.state = 'paused';
        target.pausedAt = pausedAtIso;
        target.remainingSecondsAtPause = remainingSeconds;
        target.actualFocusSeconds = accumulatedFocusSeconds;
        target.pauseCount = pauseCount;
      }
    }

    const updated = await this.getCurrentSession(userId);
    return updated || existing;
  }

  public async resumeSession(userId: string, sessionId: string): Promise<FocusSession> {
    const existing = await this.getCurrentSession(userId);
    if (!existing || existing.id !== sessionId) {
      throw new Error('Phiên tập trung không tồn tại hoặc đã kết thúc');
    }
    if (existing.state !== 'paused') {
      throw new Error(`Không thể tiếp tục phiên ở trạng thái "${existing.state}"`);
    }

    const now = Date.now();
    const remainingSeconds = existing.remainingSecondsAtPause || existing.plannedMinutes * 60;
    const newTargetEndAt = new Date(now + remainingSeconds * 1000);
    const pausedAtMs = existing.pausedAt ? new Date(existing.pausedAt).getTime() : now;
    const pauseDurationSeconds = Math.max(0, Math.floor((now - pausedAtMs) / 1000));
    const totalAccumulatedPause = (existing.accumulatedPauseSeconds || 0) + pauseDurationSeconds;

    if (db.isHealthy()) {
      await db.execute(
        `UPDATE focus_sessions 
         SET state = 'running', last_resumed_at = NOW(3), target_end_at = ?, paused_at = NULL, accumulated_pause_seconds = ?, updated_at = NOW(3)
         WHERE id = ? AND user_id = ?`,
        [newTargetEndAt, totalAccumulatedPause, sessionId, userId]
      );
    } else {
      const list = this.demoSessions.get(userId) || [];
      const target = list.find((s) => s.id === sessionId);
      if (target) {
        target.state = 'running';
        target.lastResumedAt = new Date().toISOString();
        target.targetEndAt = newTargetEndAt.toISOString();
        target.pausedAt = undefined;
        target.accumulatedPauseSeconds = totalAccumulatedPause;
      }
    }

    const updated = await this.getCurrentSession(userId);
    return updated || existing;
  }

  public async completeSession(userId: string, sessionId: string, notes?: string): Promise<FocusSession> {
    const existing = await this.getSessionById(userId, sessionId);
    if (!existing) {
      throw new Error('Phiên tập trung không tồn tại');
    }

    // Idempotent: if already completed, return immediately
    if (existing.state === 'completed') {
      return existing;
    }

    const now = Date.now();
    let finalFocusSeconds = existing.actualFocusSeconds || 0;
    if (existing.state === 'running' && existing.lastResumedAt) {
      const elapsed = Math.max(0, Math.floor((now - new Date(existing.lastResumedAt).getTime()) / 1000));
      finalFocusSeconds += elapsed;
    }
    // Cap focus seconds at planned duration
    finalFocusSeconds = Math.min(existing.plannedMinutes * 60, Math.max(finalFocusSeconds, 60));
    const actualMinutes = Math.max(1, Math.round(finalFocusSeconds / 60));

    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        await conn.execute(
          `UPDATE focus_sessions 
           SET state = 'completed', ended_at = NOW(3), actual_focus_seconds = ?, notes = ?, outcome = 'completed_full', updated_at = NOW(3)
           WHERE id = ? AND user_id = ?`,
          [finalFocusSeconds, notes || null, sessionId, userId]
        );

        // Record in study_sessions if task was linked
        if (existing.taskId) {
          const studId = 'stud_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
          await conn.execute(
            `INSERT INTO study_sessions 
             (id, user_id, task_id, planned_start_at, actual_start_at, actual_end_at, planned_minutes, actual_minutes, completion_status, notes)
             VALUES (?, ?, ?, NOW(3), NOW(3), NOW(3), ?, ?, 'completed', ?)`,
            [studId, userId, existing.taskId, existing.plannedMinutes, actualMinutes, notes || null]
          );
        }
      });
    } else {
      const list = this.demoSessions.get(userId) || [];
      const target = list.find((s) => s.id === sessionId);
      if (target) {
        target.state = 'completed';
        target.endedAt = new Date().toISOString();
        target.actualFocusSeconds = finalFocusSeconds;
        target.actualMinutes = actualMinutes;
        target.notes = notes;
        target.outcome = 'completed_full';
      }
    }

    const completed = await this.getSessionById(userId, sessionId);
    return completed || existing;
  }

  public async abandonSession(userId: string, sessionId: string, notes?: string): Promise<FocusSession> {
    const existing = await this.getSessionById(userId, sessionId);
    if (!existing) {
      throw new Error('Phiên tập trung không tồn tại');
    }

    if (existing.state === 'abandoned' || existing.state === 'completed') {
      return existing;
    }

    const now = Date.now();
    let finalFocusSeconds = existing.actualFocusSeconds || 0;
    if (existing.state === 'running' && existing.lastResumedAt) {
      const elapsed = Math.max(0, Math.floor((now - new Date(existing.lastResumedAt).getTime()) / 1000));
      finalFocusSeconds += elapsed;
    }
    const actualMinutes = Math.round(finalFocusSeconds / 60);

    if (db.isHealthy()) {
      await db.execute(
        `UPDATE focus_sessions 
         SET state = 'abandoned', ended_at = NOW(3), actual_focus_seconds = ?, notes = ?, outcome = 'early_exit', updated_at = NOW(3)
         WHERE id = ? AND user_id = ?`,
        [finalFocusSeconds, notes || null, sessionId, userId]
      );
    } else {
      const list = this.demoSessions.get(userId) || [];
      const target = list.find((s) => s.id === sessionId);
      if (target) {
        target.state = 'abandoned';
        target.endedAt = new Date().toISOString();
        target.actualFocusSeconds = finalFocusSeconds;
        target.actualMinutes = actualMinutes;
        target.notes = notes;
        target.outcome = 'early_exit';
      }
    }

    const abandoned = await this.getSessionById(userId, sessionId);
    return abandoned || existing;
  }

  public async getSessionById(userId: string, sessionId: string): Promise<FocusSession | null> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT f.id, f.user_id, f.task_id, f.mode, f.phase, f.planned_minutes, f.break_minutes, f.state,
                f.started_at, f.paused_at, f.ended_at, f.last_resumed_at, f.target_end_at,
                f.remaining_seconds_at_pause, f.actual_focus_seconds, f.accumulated_pause_seconds,
                f.pause_count, f.notes, f.outcome, f.created_at,
                t.title as task_title, s.name as subject_name
         FROM focus_sessions f
         LEFT JOIN study_tasks t ON f.task_id = t.id
         LEFT JOIN subjects s ON t.subject_id = s.id
         WHERE f.id = ? AND f.user_id = ?`,
        [sessionId, userId]
      );

      if (rows.length > 0) {
        return this.mapSessionRow(rows[0]);
      }
      return null;
    }

    const list = this.demoSessions.get(userId) || [];
    return list.find((s) => s.id === sessionId) || null;
  }

  private mapSessionRow(r: any): FocusSession {
    const actualSeconds = Number(r.actual_focus_seconds) || 0;
    return {
      id: r.id,
      userId: r.user_id,
      taskId: r.task_id || undefined,
      taskTitle: r.task_title || undefined,
      subjectName: r.subject_name || undefined,
      mode: r.mode || '25_5',
      phase: r.phase || 'work',
      plannedMinutes: Number(r.planned_minutes) || 25,
      breakMinutes: Number(r.break_minutes) || 5,
      actualMinutes: Math.round(actualSeconds / 60),
      actualFocusSeconds: actualSeconds,
      state: r.state || 'ready',
      startedAt: r.started_at?.toISOString?.() || (r.started_at ? String(r.started_at) : undefined),
      pausedAt: r.paused_at?.toISOString?.() || (r.paused_at ? String(r.paused_at) : undefined),
      endedAt: r.ended_at?.toISOString?.() || (r.ended_at ? String(r.ended_at) : undefined),
      lastResumedAt: r.last_resumed_at?.toISOString?.() || (r.last_resumed_at ? String(r.last_resumed_at) : undefined),
      targetEndAt: r.target_end_at?.toISOString?.() || (r.target_end_at ? String(r.target_end_at) : undefined),
      remainingSecondsAtPause: r.remaining_seconds_at_pause !== null ? Number(r.remaining_seconds_at_pause) : undefined,
      accumulatedPauseSeconds: Number(r.accumulated_pause_seconds) || 0,
      pauseCount: Number(r.pause_count) || 0,
      notes: r.notes || undefined,
      outcome: r.outcome || undefined,
      serverNow: new Date().toISOString(),
      createdAt: r.created_at?.toISOString?.() || (r.created_at ? String(r.created_at) : undefined),
    };
  }

  public seedDemo(userId: string, sessions: FocusSession[]) {
    this.demoSessions.set(userId, [...sessions]);
  }
}

export const focusRepo = FocusRepository.getInstance();
