import { db } from '../db/mysql';
import { isProduction, isDatabaseRequired } from '../config/env';
import { ScheduleProposal, StudyTask } from '../../shared/types';
import { taskRepo } from './task-repository';
import { subjectRepo } from './subject-repository';

export class PlannerRepository {
  private static instance: PlannerRepository;
  private demoProposals: Map<string, ScheduleProposal> = new Map();

  private constructor() {}

  public static getInstance(): PlannerRepository {
    if (!PlannerRepository.instance) {
      PlannerRepository.instance = new PlannerRepository();
    }
    return PlannerRepository.instance;
  }

  public async saveProposal(proposal: ScheduleProposal): Promise<void> {
    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO schedule_proposals (id, user_id, base_plan_version, status, reason, diff_json, expires_at, idempotency_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
         ON DUPLICATE KEY UPDATE reason = VALUES(reason), diff_json = VALUES(diff_json), expires_at = VALUES(expires_at), idempotency_key = VALUES(idempotency_key)`,
        [
          proposal.id,
          proposal.userId,
          proposal.basePlanVersion || 1,
          proposal.status || 'pending',
          proposal.reason,
          JSON.stringify(proposal),
          new Date(proposal.expiresAt),
          proposal.idempotencyKey || null,
        ]
      );
    } else {
      if (isProduction || isDatabaseRequired) {
        throw new Error('[JAMI Database] Database is unreachable. Cannot save schedule proposal.');
      }
      this.demoProposals.set(proposal.id, proposal);
    }
  }

  public async getProposal(userId: string, proposalId: string): Promise<ScheduleProposal | null> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT id, user_id, base_plan_version, status, reason, diff_json, expires_at, confirmed_at, idempotency_key
         FROM schedule_proposals
         WHERE id = ? AND user_id = ?`,
        [proposalId, userId]
      );

      if (rows.length > 0) {
        const r = rows[0];
        const diff = typeof r.diff_json === 'string' ? JSON.parse(r.diff_json) : r.diff_json;
        return {
          ...diff,
          id: r.id,
          userId: r.user_id,
          basePlanVersion: r.base_plan_version,
          status: r.status,
          reason: r.reason,
          expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : new Date().toISOString(),
          confirmedAt: r.confirmed_at ? new Date(r.confirmed_at).toISOString() : undefined,
          idempotencyKey: r.idempotency_key || undefined,
        };
      }
      return null;
    }

    if (isProduction || isDatabaseRequired) {
      throw new Error('[JAMI Database] Database is unreachable. Cannot retrieve schedule proposal.');
    }

    return this.demoProposals.get(proposalId) || null;
  }

  public async confirmProposal(
    userId: string,
    proposalId: string,
    idempotencyKey?: string
  ): Promise<{ success: boolean; tasks: StudyTask[]; proposal: ScheduleProposal }> {
    const updatedTasks: StudyTask[] = [];

    if (db.isHealthy()) {
      let confirmedProposal: ScheduleProposal | null = null;

      await db.withTransaction(async (conn) => {
        // 1. SELECT FOR UPDATE
        const [rows] = await conn.query<any>(
          `SELECT id, user_id, base_plan_version, status, reason, diff_json, expires_at, confirmed_at, idempotency_key
           FROM schedule_proposals
           WHERE id = ? AND user_id = ?
           FOR UPDATE`,
          [proposalId, userId]
        );

        if (rows.length === 0) {
          const notFoundErr: any = new Error('Không tìm thấy đề xuất lịch học');
          notFoundErr.code = 'PROPOSAL_NOT_FOUND';
          notFoundErr.status = 404;
          throw notFoundErr;
        }

        const row = rows[0];

        // 2. Idempotency check: If already confirmed with same proposal or key, return cleanly
        if (row.status === 'confirmed') {
          if (idempotencyKey && row.idempotency_key === idempotencyKey) {
            const diff = typeof row.diff_json === 'string' ? JSON.parse(row.diff_json) : row.diff_json;
            confirmedProposal = {
              ...diff,
              id: row.id,
              userId: row.user_id,
              status: 'confirmed',
              confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : new Date().toISOString(),
            };
            return;
          }
          const conflictErr: any = new Error('Đề xuất này đã được xác nhận trước đó.');
          conflictErr.code = 'PROPOSAL_ALREADY_CONFIRMED';
          conflictErr.status = 409;
          throw conflictErr;
        }

        if (row.status !== 'pending') {
          const conflictErr: any = new Error(`Đề xuất không ở trạng thái chờ duyệt (trạng thái hiện tại: ${row.status}).`);
          conflictErr.code = 'PROPOSAL_INVALID_STATUS';
          conflictErr.status = 409;
          throw conflictErr;
        }

        // 3. Expiration check
        const expiresAt = new Date(row.expires_at);
        if (expiresAt.getTime() < Date.now()) {
          const expiredErr: any = new Error('Đề xuất lịch học đã hết hạn. Vui lòng tạo đề xuất mới.');
          expiredErr.code = 'PROPOSAL_EXPIRED';
          expiredErr.status = 410;
          throw expiredErr;
        }

        const proposalData: ScheduleProposal = typeof row.diff_json === 'string' ? JSON.parse(row.diff_json) : row.diff_json;

        // Fetch user subjects to ensure foreign keys are valid and owned by user
        const [userSubjects] = await conn.query<any>('SELECT id, name FROM subjects WHERE user_id = ?', [userId]);
        const defaultSubjectId = userSubjects.length > 0 ? userSubjects[0].id : null;

        // 4. Update or Insert tasks
        for (const item of proposalData.tasksToSchedule) {
          let resolvedSubjectId = item.subjectId;
          if (!resolvedSubjectId || !userSubjects.some((s: any) => s.id === resolvedSubjectId)) {
            resolvedSubjectId = defaultSubjectId;
          }

          const [exists] = await conn.query<any>(
            'SELECT id FROM study_tasks WHERE id = ? AND user_id = ?',
            [item.taskId, userId]
          );

          if (exists.length > 0) {
            await conn.execute(
              `UPDATE study_tasks
               SET scheduled_start_at = ?, scheduled_end_at = ?, locked = 1, updated_at = NOW(3)
               WHERE id = ? AND user_id = ?`,
              [new Date(item.proposedStart), new Date(item.proposedEnd), item.taskId, userId]
            );
          } else {
            await conn.execute(
              `INSERT INTO study_tasks (id, user_id, subject_id, title, objective, status, priority, difficulty, estimated_minutes, splittable, locked, scheduled_start_at, scheduled_end_at, completion_percent, source, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'pending', 'high', 'medium', ?, 0, 1, ?, ?, 0, 'proposal', NOW(3), NOW(3))`,
              [
                item.taskId,
                userId,
                resolvedSubjectId,
                item.title,
                item.reason || 'Nhiệm vụ từ kế hoạch Jami AI',
                item.estimatedMinutes || 45,
                new Date(item.proposedStart),
                new Date(item.proposedEnd),
              ]
            );
          }
        }

        // 5. Update proposal status
        await conn.execute(
          `UPDATE schedule_proposals
           SET status = 'confirmed', confirmed_at = NOW(3), idempotency_key = ?
           WHERE id = ? AND user_id = ?`,
          [idempotencyKey || null, proposalId, userId]
        );

        confirmedProposal = {
          ...proposalData,
          id: proposalId,
          userId,
          status: 'confirmed',
          confirmedAt: new Date().toISOString(),
          idempotencyKey,
        };
      });

      const currentTasks = await taskRepo.getByUserId(userId);
      return {
        success: true,
        tasks: currentTasks,
        proposal: confirmedProposal!,
      };
    }

    if (isProduction || isDatabaseRequired) {
      throw new Error('[JAMI Database] Database is unreachable. Cannot confirm schedule proposal.');
    }

    // Demo in-memory fallback
    const proposal = this.demoProposals.get(proposalId);
    if (!proposal || proposal.userId !== userId) {
      const notFoundErr: any = new Error('Không tìm thấy đề xuất lịch học');
      notFoundErr.code = 'PROPOSAL_NOT_FOUND';
      notFoundErr.status = 404;
      throw notFoundErr;
    }

    if (proposal.status === 'confirmed') {
      const allTasks = await taskRepo.getByUserId(userId);
      return { success: true, tasks: allTasks, proposal };
    }

    const expiresAt = new Date(proposal.expiresAt);
    if (expiresAt.getTime() < Date.now()) {
      const expiredErr: any = new Error('Đề xuất lịch học đã hết hạn. Vui lòng tạo đề xuất mới.');
      expiredErr.code = 'PROPOSAL_EXPIRED';
      expiredErr.status = 410;
      throw expiredErr;
    }

    const userSubjects = await subjectRepo.getByUserId(userId);
    const defaultSubjectId = userSubjects.length > 0 ? userSubjects[0].id : 'subj_default';

    for (const item of proposal.tasksToSchedule) {
      const existing = await taskRepo.getById(userId, item.taskId);
      if (existing) {
        existing.scheduledStartAt = item.proposedStart;
        existing.scheduledEndAt = item.proposedEnd;
        existing.locked = true;
        updatedTasks.push(existing);
      } else {
        const newTask = await taskRepo.create(userId, {
          id: item.taskId,
          title: item.title,
          subjectId: item.subjectId || defaultSubjectId,
          estimatedMinutes: item.estimatedMinutes || 45,
          scheduledStartAt: item.proposedStart,
          scheduledEndAt: item.proposedEnd,
          locked: true,
          status: 'pending',
          priority: 'high',
        });
        updatedTasks.push(newTask);
      }
    }

    proposal.status = 'confirmed';
    proposal.confirmedAt = new Date().toISOString();
    proposal.idempotencyKey = idempotencyKey;

    const allTasks = await taskRepo.getByUserId(userId);
    return {
      success: true,
      tasks: allTasks,
      proposal,
    };
  }

  public async cancelProposal(userId: string, proposalId: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute(
        `UPDATE schedule_proposals SET status = 'rejected' WHERE id = ? AND user_id = ? AND status = 'pending'`,
        [proposalId, userId]
      );
      return res?.affectedRows > 0;
    }

    if (isProduction || isDatabaseRequired) {
      throw new Error('[JAMI Database] Database is unreachable. Cannot cancel schedule proposal.');
    }

    const item = this.demoProposals.get(proposalId);
    if (item && item.userId === userId && item.status === 'pending') {
      item.status = 'rejected';
      return true;
    }
    return false;
  }
}

export const plannerRepo = PlannerRepository.getInstance();
