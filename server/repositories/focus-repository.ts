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
        `SELECT id, user_id, task_id, mode, planned_minutes, state, started_at, paused_at, ended_at, accumulated_pause_seconds, pause_count, notes, outcome, created_at
         FROM focus_sessions
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        [userId]
      );

      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        taskId: r.task_id,
        mode: r.mode,
        plannedMinutes: r.planned_minutes,
        state: r.state,
        startedAt: r.started_at ? r.started_at.toISOString?.() || String(r.started_at) : undefined,
        pausedAt: r.paused_at ? r.paused_at.toISOString?.() || String(r.paused_at) : undefined,
        endedAt: r.ended_at ? r.ended_at.toISOString?.() || String(r.ended_at) : undefined,
        accumulatedPauseSeconds: r.accumulated_pause_seconds || 0,
        pauseCount: r.pause_count || 0,
        notes: r.notes || undefined,
        outcome: r.outcome || undefined,
      }));
    }

    return this.demoSessions.get(userId) || [];
  }

  public async getCurrentSession(userId: string): Promise<FocusSession | null> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT id, user_id, task_id, mode, planned_minutes, state, started_at, paused_at, ended_at, accumulated_pause_seconds, pause_count, notes, outcome, created_at
         FROM focus_sessions
         WHERE user_id = ? AND state IN ('running', 'paused')
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId]
      );

      if (rows.length > 0) {
        const r = rows[0];
        return {
          id: r.id,
          userId: r.user_id,
          taskId: r.task_id,
          mode: r.mode,
          plannedMinutes: r.planned_minutes,
          state: r.state,
          startedAt: r.started_at ? r.started_at.toISOString?.() || String(r.started_at) : undefined,
          pausedAt: r.paused_at ? r.paused_at.toISOString?.() || String(r.paused_at) : undefined,
          endedAt: r.ended_at ? r.ended_at.toISOString?.() || String(r.ended_at) : undefined,
          accumulatedPauseSeconds: r.accumulated_pause_seconds || 0,
          pauseCount: r.pause_count || 0,
          notes: r.notes || undefined,
          outcome: r.outcome || undefined,
        };
      }
      return null;
    }

    const list = this.demoSessions.get(userId) || [];
    return list.find((s) => s.state === 'running' || s.state === 'paused') || null;
  }

  public async getCurrentActiveSession(userId: string): Promise<FocusSession | null> {
    return this.getCurrentSession(userId);
  }

  public async createSession(userId: string, data: Partial<FocusSession>): Promise<FocusSession> {
    const id = 'foc_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const session: FocusSession = {
      id,
      userId,
      taskId: data.taskId,
      mode: data.mode || '25_5',
      plannedMinutes: data.plannedMinutes || 25,
      state: 'running',
      startedAt: new Date().toISOString(),
      accumulatedPauseSeconds: 0,
      pauseCount: 0,
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO focus_sessions (id, user_id, task_id, mode, planned_minutes, state, started_at, paused_at, ended_at, accumulated_pause_seconds, pause_count, created_at)
         VALUES (?, ?, ?, ?, ?, 'running', NOW(3), NULL, NULL, 0, 0, NOW(3))`,
        [session.id, userId, session.taskId || null, session.mode, session.plannedMinutes]
      );
    } else {
      const list = this.demoSessions.get(userId) || [];
      list.unshift(session);
      this.demoSessions.set(userId, list);
    }

    return session;
  }

  public async startSession(
    userId: string,
    taskId?: string,
    mode?: '25_5' | '45_10' | 'custom' | string,
    minutes?: number
  ): Promise<FocusSession> {
    const validMode: '25_5' | '45_10' | 'custom' =
      mode === '45_10' || mode === 'custom' ? mode : '25_5';
    return this.createSession(userId, { taskId, mode: validMode, plannedMinutes: minutes });
  }

  public async updateSession(
    userId: string,
    sessionId: string,
    updates: Partial<FocusSession>
  ): Promise<FocusSession | null> {
    if (db.isHealthy()) {
      const setParts: string[] = [];
      const values: any[] = [];

      if (updates.state !== undefined) {
        setParts.push('state = ?');
        values.push(updates.state);
      }
      if (updates.pausedAt !== undefined) {
        setParts.push('paused_at = ?');
        values.push(updates.pausedAt ? new Date(updates.pausedAt) : null);
      }
      if (updates.endedAt !== undefined) {
        setParts.push('ended_at = ?');
        values.push(updates.endedAt ? new Date(updates.endedAt) : null);
      }
      if (updates.accumulatedPauseSeconds !== undefined) {
        setParts.push('accumulated_pause_seconds = ?');
        values.push(updates.accumulatedPauseSeconds);
      }
      if (updates.pauseCount !== undefined) {
        setParts.push('pause_count = ?');
        values.push(updates.pauseCount);
      }
      if (updates.notes !== undefined) {
        setParts.push('notes = ?');
        values.push(updates.notes);
      }
      if (updates.outcome !== undefined) {
        setParts.push('outcome = ?');
        values.push(updates.outcome);
      }

      if (setParts.length > 0) {
        values.push(sessionId, userId);
        await db.execute(
          `UPDATE focus_sessions SET ${setParts.join(', ')} WHERE id = ? AND user_id = ?`,
          values
        );
      }

      if (updates.state === 'completed' && updates.taskId) {
        await db.execute(
          `INSERT INTO study_sessions (id, user_id, task_id, planned_start_at, actual_start_at, actual_end_at, planned_minutes, actual_minutes, completion_status, notes)
           VALUES (?, ?, ?, NOW(3), NOW(3), NOW(3), ?, ?, 'completed', ?)`,
          [
            'stud_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24),
            userId,
            updates.taskId,
            updates.plannedMinutes || 25,
            updates.plannedMinutes || 25,
            updates.notes || null,
          ]
        );
      }
    } else {
      const list = this.demoSessions.get(userId) || [];
      const session = list.find((s) => s.id === sessionId);
      if (session) {
        Object.assign(session, updates);
      }
    }

    const all = await this.getSessionsByUserId(userId);
    return all.find((s) => s.id === sessionId) || null;
  }

  public async pauseSession(userId: string, sessionId: string): Promise<FocusSession | null> {
    return this.updateSession(userId, sessionId, { state: 'paused', pausedAt: new Date().toISOString() });
  }

  public async resumeSession(userId: string, sessionId: string): Promise<FocusSession | null> {
    return this.updateSession(userId, sessionId, { state: 'running' });
  }

  public async completeSession(userId: string, sessionId: string, notes?: string): Promise<FocusSession | null> {
    return this.updateSession(userId, sessionId, {
      state: 'completed',
      endedAt: new Date().toISOString(),
      notes,
      outcome: 'completed_full',
    });
  }

  public async abandonSession(userId: string, sessionId: string, notes?: string): Promise<FocusSession | null> {
    return this.updateSession(userId, sessionId, {
      state: 'abandoned',
      endedAt: new Date().toISOString(),
      notes,
      outcome: 'early_exit',
    });
  }

  public seedDemo(userId: string, sessions: FocusSession[]) {
    this.demoSessions.set(userId, [...sessions]);
  }
}

export const focusRepo = FocusRepository.getInstance();
