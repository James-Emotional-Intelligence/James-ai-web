import { db } from '../db/mysql';
import { ScheduleProposal, StudyTask } from '../../shared/types';
import { taskRepo } from './task-repository';
import crypto from 'crypto';

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
        `INSERT INTO schedule_proposals (id, user_id, base_plan_version, status, reason, diff_json, expires_at, created_at)
         VALUES (?, ?, 1, 'pending', ?, ?, ?, NOW(3))
         ON DUPLICATE KEY UPDATE reason = VALUES(reason), diff_json = VALUES(diff_json), expires_at = VALUES(expires_at)`,
        [
          proposal.id,
          proposal.userId,
          proposal.reason,
          JSON.stringify(proposal),
          new Date(proposal.expiresAt),
        ]
      );
    } else {
      this.demoProposals.set(proposal.id, proposal);
    }
  }

  public async getProposal(userId: string, proposalId: string): Promise<ScheduleProposal | null> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT id, user_id, status, reason, diff_json, expires_at FROM schedule_proposals WHERE id = ? AND user_id = ?`,
        [proposalId, userId]
      );

      if (rows.length > 0) {
        const r = rows[0];
        const diff = typeof r.diff_json === 'string' ? JSON.parse(r.diff_json) : r.diff_json;
        return {
          ...diff,
          id: r.id,
          userId: r.user_id,
          reason: r.reason,
          expiresAt: r.expires_at?.toISOString?.() || String(r.expires_at),
        };
      }
      return null;
    }

    return this.demoProposals.get(proposalId) || null;
  }

  public async confirmProposal(userId: string, proposalId: string): Promise<{ success: boolean; tasks: StudyTask[] }> {
    const proposal = await this.getProposal(userId, proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    const updatedTasks: StudyTask[] = [];

    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        await conn.execute(
          `UPDATE schedule_proposals SET status = 'confirmed', confirmed_at = NOW(3) WHERE id = ? AND user_id = ?`,
          [proposalId, userId]
        );

        for (const item of proposal.tasksToSchedule) {
          // Check if task exists
          const [exists] = await conn.query<any>('SELECT id FROM study_tasks WHERE id = ? AND user_id = ?', [item.taskId, userId]);
          if (exists.length > 0) {
            await conn.execute(
              `UPDATE study_tasks SET scheduled_start_at = ?, scheduled_end_at = ?, locked = 1, updated_at = NOW(3) WHERE id = ? AND user_id = ?`,
              [new Date(item.proposedStart), new Date(item.proposedEnd), item.taskId, userId]
            );
          } else {
            // Insert newly decomposed task
            await conn.execute(
              `INSERT INTO study_tasks (id, user_id, subject_id, title, objective, status, priority, difficulty, estimated_minutes, splittable, locked, scheduled_start_at, scheduled_end_at, completion_percent, source, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'pending', 'high', 'medium', ?, 0, 1, ?, ?, 0, 'voice_proposal', NOW(3), NOW(3))`,
              [
                item.taskId,
                userId,
                item.subjectId || 'subj-math',
                item.title,
                item.reason || 'Nhiệm vụ từ mục tiêu giọng nói',
                item.estimatedMinutes || 45,
                new Date(item.proposedStart),
                new Date(item.proposedEnd),
              ]
            );
          }
        }
      });
    } else {
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
            subjectId: item.subjectId || 'subj-math',
            estimatedMinutes: item.estimatedMinutes || 45,
            scheduledStartAt: item.proposedStart,
            scheduledEndAt: item.proposedEnd,
            locked: true,
            source: 'voice_proposal',
          });
          updatedTasks.push(newTask);
        }
      }
    }

    const allTasks = await taskRepo.getByUserId(userId);
    return { success: true, tasks: allTasks };
  }
}

export const plannerRepo = PlannerRepository.getInstance();
