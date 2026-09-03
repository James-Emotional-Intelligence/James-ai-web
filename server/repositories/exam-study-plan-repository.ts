import { db } from '../db/mysql';
import { isProduction, isDatabaseRequired } from '../config/env';
import {
  ExamStudyPlan,
  ExamStudyPlanItem,
  ExamStudyPlanVersion,
  ExamPlanActivityType,
  ExamPlanItemStatus,
} from '../../shared/types';
import crypto from 'crypto';

export class ExamStudyPlanRepository {
  private demoPlans = new Map<string, ExamStudyPlan[]>();
  private demoVersions = new Map<string, ExamStudyPlanVersion[]>();

  public async getPlanByExamId(userId: string, examId: string): Promise<ExamStudyPlan | null> {
    if (db.isHealthy()) {
      const planRows = await db.query<any>(
        `SELECT p.id, p.user_id, p.exam_id, p.start_date, p.target_date, p.daily_minutes,
                p.status, p.current_version, p.generated_at, p.accepted_at, p.completed_at,
                p.created_at, p.updated_at,
                e.title as exam_title, e.subject_id, s.name as subject_name
         FROM exam_study_plans p
         JOIN exams e ON p.exam_id = e.id
         LEFT JOIN subjects s ON e.subject_id = s.id
         WHERE p.user_id = ? AND p.exam_id = ?
         ORDER BY p.created_at DESC
         LIMIT 1`,
        [userId, examId]
      );
      if (planRows.length === 0) return null;

      const p = planRows[0];
      const items = await this.getItemsByPlanId(p.id);

      return {
        id: p.id,
        userId: p.user_id,
        examId: p.exam_id,
        examTitle: p.exam_title,
        subjectId: p.subject_id,
        subjectName: p.subject_name,
        startDate: p.start_date,
        targetDate: p.target_date,
        dailyMinutes: Number(p.daily_minutes || 45),
        status: p.status,
        currentVersion: Number(p.current_version || 1),
        generatedAt: new Date(p.generated_at).toISOString(),
        acceptedAt: p.accepted_at ? new Date(p.accepted_at).toISOString() : undefined,
        completedAt: p.completed_at ? new Date(p.completed_at).toISOString() : undefined,
        items,
        totalPlannedMinutes: items.reduce((acc, i) => acc + i.plannedMinutes, 0),
        createdAt: new Date(p.created_at).toISOString(),
        updatedAt: new Date(p.updated_at).toISOString(),
      };
    }

    const list = this.demoPlans.get(userId) || [];
    const found = list.find((p) => p.examId === examId);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  public async getPlanById(userId: string, planId: string): Promise<ExamStudyPlan | null> {
    if (db.isHealthy()) {
      const planRows = await db.query<any>(
        `SELECT p.id, p.user_id, p.exam_id, p.start_date, p.target_date, p.daily_minutes,
                p.status, p.current_version, p.generated_at, p.accepted_at, p.completed_at,
                p.created_at, p.updated_at,
                e.title as exam_title, e.subject_id, s.name as subject_name
         FROM exam_study_plans p
         JOIN exams e ON p.exam_id = e.id
         LEFT JOIN subjects s ON e.subject_id = s.id
         WHERE p.user_id = ? AND p.id = ?
         LIMIT 1`,
        [userId, planId]
      );
      if (planRows.length === 0) return null;

      const p = planRows[0];
      const items = await this.getItemsByPlanId(p.id);

      return {
        id: p.id,
        userId: p.user_id,
        examId: p.exam_id,
        examTitle: p.exam_title,
        subjectId: p.subject_id,
        subjectName: p.subject_name,
        startDate: p.start_date,
        targetDate: p.target_date,
        dailyMinutes: Number(p.daily_minutes || 45),
        status: p.status,
        currentVersion: Number(p.current_version || 1),
        generatedAt: new Date(p.generated_at).toISOString(),
        acceptedAt: p.accepted_at ? new Date(p.accepted_at).toISOString() : undefined,
        completedAt: p.completed_at ? new Date(p.completed_at).toISOString() : undefined,
        items,
        totalPlannedMinutes: items.reduce((acc, i) => acc + i.plannedMinutes, 0),
        createdAt: new Date(p.created_at).toISOString(),
        updatedAt: new Date(p.updated_at).toISOString(),
      };
    }

    const list = this.demoPlans.get(userId) || [];
    const found = list.find((p) => p.id === planId);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  public async getItemsByPlanId(planId: string): Promise<ExamStudyPlanItem[]> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT i.id, i.plan_id, i.subject_id, i.title, i.description, i.activity_type,
                i.source_type, i.source_id, i.priority, i.planned_date, i.start_at, i.end_at,
                i.planned_minutes, i.status, i.completed_at, i.sort_order, i.task_id,
                i.created_at, i.updated_at,
                s.name as subject_name
         FROM exam_study_plan_items i
         LEFT JOIN subjects s ON i.subject_id = s.id
         WHERE i.plan_id = ?
         ORDER BY i.planned_date ASC, i.start_at ASC, i.sort_order ASC`,
        [planId]
      );
      return rows.map(this.mapItemRow);
    }
    return [];
  }

  public async createOrReplacePlan(
    userId: string,
    planData: {
      examId: string;
      examTitle?: string;
      subjectId?: string;
      startDate: string;
      targetDate: string;
      dailyMinutes: number;
      status?: ExamStudyPlan['status'];
    },
    items: Array<Omit<ExamStudyPlanItem, 'id' | 'planId' | 'createdAt' | 'updatedAt'>>
  ): Promise<ExamStudyPlan> {
    const planId = 'eplan_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const nowIso = new Date().toISOString();
    const status = planData.status || 'draft';

    const createdItems: ExamStudyPlanItem[] = items.map((item, idx) => ({
      id: 'epitem_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24),
      planId,
      subjectId: item.subjectId,
      subjectName: item.subjectName,
      title: item.title,
      description: item.description,
      activityType: item.activityType || 'theory_review',
      sourceType: item.sourceType || 'exam_scope',
      sourceId: item.sourceId,
      priority: item.priority || 'medium',
      plannedDate: item.plannedDate,
      startAt: item.startAt,
      endAt: item.endAt,
      plannedMinutes: item.plannedMinutes,
      status: item.status || 'pending',
      sortOrder: item.sortOrder ?? idx,
      taskId: item.taskId,
      createdAt: nowIso,
      updatedAt: nowIso,
    }));

    const plan: ExamStudyPlan = {
      id: planId,
      userId,
      examId: planData.examId,
      examTitle: planData.examTitle,
      subjectId: planData.subjectId,
      startDate: planData.startDate,
      targetDate: planData.targetDate,
      dailyMinutes: planData.dailyMinutes,
      status,
      currentVersion: 1,
      generatedAt: nowIso,
      items: createdItems,
      totalPlannedMinutes: createdItems.reduce((acc, i) => acc + i.plannedMinutes, 0),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (db.isHealthy()) {
      // Clean up previous draft plans for this exam if any
      const existing = await db.query<any>(
        `SELECT id FROM exam_study_plans WHERE user_id = ? AND exam_id = ? AND status = 'draft'`,
        [userId, planData.examId]
      );
      for (const ex of existing) {
        await db.execute(`DELETE FROM exam_study_plans WHERE id = ?`, [ex.id]);
      }

      await db.execute(
        `INSERT INTO exam_study_plans
          (id, user_id, exam_id, start_date, target_date, daily_minutes, status, current_version, generated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(3), NOW(3), NOW(3))`,
        [planId, userId, planData.examId, planData.startDate, planData.targetDate, planData.dailyMinutes, status]
      );

      for (const item of createdItems) {
        await db.execute(
          `INSERT INTO exam_study_plan_items
            (id, plan_id, subject_id, title, description, activity_type, source_type, source_id, priority, planned_date, start_at, end_at, planned_minutes, status, sort_order, task_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
          [
            item.id,
            planId,
            item.subjectId || null,
            item.title,
            item.description || null,
            item.activityType,
            item.sourceType,
            item.sourceId || null,
            item.priority,
            item.plannedDate,
            item.startAt,
            item.endAt,
            item.plannedMinutes,
            item.status,
            item.sortOrder,
            item.taskId || null,
          ]
        );
      }
    } else {
      if (isProduction || isDatabaseRequired) {
        throw new Error('[JAMI Database] Database is unreachable. Cannot record exam study plan.');
      }
      const list = this.demoPlans.get(userId) || [];
      const filtered = list.filter((p) => !(p.examId === planData.examId && p.status === 'draft'));
      filtered.push(plan);
      this.demoPlans.set(userId, filtered);
    }

    // Save initial version snapshot
    await this.createPlanVersionSnapshot(userId, planId, 'Khởi tạo kế hoạch ban đầu');

    return plan;
  }

  public async updatePlanStatus(
    userId: string,
    planId: string,
    status: ExamStudyPlan['status'],
    acceptedAt?: string,
    completedAt?: string
  ): Promise<boolean> {
    const now = new Date();
    if (db.isHealthy()) {
      let query = `UPDATE exam_study_plans SET status = ?, updated_at = NOW(3)`;
      const params: any[] = [status];

      if (acceptedAt !== undefined) {
        query += `, accepted_at = ?`;
        params.push(acceptedAt);
      } else if (status === 'accepted') {
        query += `, accepted_at = NOW(3)`;
      }

      if (completedAt !== undefined) {
        query += `, completed_at = ?`;
        params.push(completedAt);
      } else if (status === 'completed') {
        query += `, completed_at = NOW(3)`;
      }

      query += ` WHERE user_id = ? AND id = ?`;
      params.push(userId, planId);

      const res = await db.execute(query, params);
      return (res?.affectedRows || 0) > 0;
    }

    const list = this.demoPlans.get(userId) || [];
    const plan = list.find((p) => p.id === planId);
    if (plan) {
      plan.status = status;
      if (status === 'accepted') plan.acceptedAt = acceptedAt || now.toISOString();
      if (status === 'completed') plan.completedAt = completedAt || now.toISOString();
      plan.updatedAt = now.toISOString();
      return true;
    }
    return false;
  }

  public async updatePlanItem(
    userId: string,
    planId: string,
    itemId: string,
    data: Partial<ExamStudyPlanItem>
  ): Promise<ExamStudyPlanItem | null> {
    const plan = await this.getPlanById(userId, planId);
    if (!plan) return null;

    if (db.isHealthy()) {
      const setClauses: string[] = ['updated_at = NOW(3)'];
      const params: any[] = [];

      if (data.title !== undefined) {
        setClauses.push('title = ?');
        params.push(data.title);
      }
      if (data.description !== undefined) {
        setClauses.push('description = ?');
        params.push(data.description);
      }
      if (data.plannedDate !== undefined) {
        setClauses.push('planned_date = ?');
        params.push(data.plannedDate);
      }
      if (data.startAt !== undefined) {
        setClauses.push('start_at = ?');
        params.push(data.startAt);
      }
      if (data.endAt !== undefined) {
        setClauses.push('end_at = ?');
        params.push(data.endAt);
      }
      if (data.plannedMinutes !== undefined) {
        setClauses.push('planned_minutes = ?');
        params.push(data.plannedMinutes);
      }
      if (data.status !== undefined) {
        setClauses.push('status = ?');
        params.push(data.status);
        if (data.status === 'completed') {
          setClauses.push('completed_at = NOW(3)');
        }
      }

      params.push(itemId, planId);
      await db.execute(
        `UPDATE exam_study_plan_items SET ${setClauses.join(', ')} WHERE id = ? AND plan_id = ?`,
        params
      );
    } else {
      const list = this.demoPlans.get(userId) || [];
      const storedPlan = list.find((p) => p.id === planId);
      if (!storedPlan) return null;
      const item = storedPlan.items.find((i) => i.id === itemId);
      if (!item) return null;
      Object.assign(item, data, { updatedAt: new Date().toISOString() });
      if (data.status === 'completed') {
        item.completedAt = new Date().toISOString();
      }
    }

    const updated = await this.getPlanById(userId, planId);
    return updated?.items.find((i) => i.id === itemId) || null;
  }

  public async deletePlanItem(userId: string, planId: string, itemId: string): Promise<boolean> {
    const plan = await this.getPlanById(userId, planId);
    if (!plan) return false;

    if (db.isHealthy()) {
      const res = await db.execute(
        `DELETE FROM exam_study_plan_items WHERE id = ? AND plan_id = ?`,
        [itemId, planId]
      );
      return (res?.affectedRows || 0) > 0;
    }

    const list = this.demoPlans.get(userId) || [];
    const storedPlan = list.find((p) => p.id === planId);
    if (storedPlan) {
      const idx = storedPlan.items.findIndex((i) => i.id === itemId);
      if (idx >= 0) {
        storedPlan.items.splice(idx, 1);
        return true;
      }
    }
    return false;
  }

  public async replacePlanItems(
    userId: string,
    planId: string,
    items: Array<Omit<ExamStudyPlanItem, 'id' | 'planId' | 'createdAt' | 'updatedAt'>>
  ): Promise<ExamStudyPlanItem[]> {
    const plan = await this.getPlanById(userId, planId);
    if (!plan) throw new Error('Không tìm thấy kế hoạch ôn tập');

    const nowIso = new Date().toISOString();
    const createdItems: ExamStudyPlanItem[] = items.map((item, idx) => ({
      id: 'epitem_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24),
      planId,
      subjectId: item.subjectId,
      subjectName: item.subjectName,
      title: item.title,
      description: item.description,
      activityType: item.activityType || 'theory_review',
      sourceType: item.sourceType || 'exam_scope',
      sourceId: item.sourceId,
      priority: item.priority || 'medium',
      plannedDate: item.plannedDate,
      startAt: item.startAt,
      endAt: item.endAt,
      plannedMinutes: item.plannedMinutes,
      status: item.status || 'pending',
      sortOrder: item.sortOrder ?? idx,
      taskId: item.taskId,
      createdAt: nowIso,
      updatedAt: nowIso,
    }));

    if (db.isHealthy()) {
      await db.execute(`DELETE FROM exam_study_plan_items WHERE plan_id = ?`, [planId]);

      for (const item of createdItems) {
        await db.execute(
          `INSERT INTO exam_study_plan_items
            (id, plan_id, subject_id, title, description, activity_type, source_type, source_id, priority, planned_date, start_at, end_at, planned_minutes, status, sort_order, task_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
          [
            item.id,
            planId,
            item.subjectId || null,
            item.title,
            item.description || null,
            item.activityType,
            item.sourceType,
            item.sourceId || null,
            item.priority,
            item.plannedDate,
            item.startAt,
            item.endAt,
            item.plannedMinutes,
            item.status,
            item.sortOrder,
            item.taskId || null,
          ]
        );
      }
    } else {
      const list = this.demoPlans.get(userId) || [];
      const storedPlan = list.find((p) => p.id === planId);
      if (storedPlan) {
        storedPlan.items = createdItems;
        storedPlan.updatedAt = nowIso;
      }
    }

    return createdItems;
  }

  public async createPlanVersionSnapshot(
    userId: string,
    planId: string,
    reason?: string
  ): Promise<ExamStudyPlanVersion> {
    const plan = await this.getPlanById(userId, planId);
    if (!plan) throw new Error('Không tìm thấy kế hoạch');

    const nextVersion = plan.currentVersion + 1;
    const versionId = 'epver_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const snapshotJson = JSON.stringify(plan);
    const nowIso = new Date().toISOString();

    const ver: ExamStudyPlanVersion = {
      id: versionId,
      planId,
      versionNumber: plan.currentVersion,
      snapshotJson,
      reason,
      createdAt: nowIso,
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO exam_study_plan_versions (id, plan_id, version_number, snapshot_json, reason, created_at)
         VALUES (?, ?, ?, ?, ?, NOW(3))`,
        [versionId, planId, plan.currentVersion, snapshotJson, reason || null]
      );
      await db.execute(
        `UPDATE exam_study_plans SET current_version = ?, updated_at = NOW(3) WHERE id = ?`,
        [nextVersion, planId]
      );
    } else {
      const versList = this.demoVersions.get(planId) || [];
      versList.push(ver);
      this.demoVersions.set(planId, versList);
      const list = this.demoPlans.get(userId) || [];
      const storedPlan = list.find((p) => p.id === planId);
      if (storedPlan) {
        storedPlan.currentVersion = nextVersion;
      }
    }

    return ver;
  }

  public async restorePlanVersion(
    userId: string,
    planId: string,
    versionNumber: number
  ): Promise<ExamStudyPlan | null> {
    let snapshotJson: string | null = null;

    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT snapshot_json FROM exam_study_plan_versions WHERE plan_id = ? AND version_number = ? LIMIT 1`,
        [planId, versionNumber]
      );
      if (rows.length > 0) {
        snapshotJson = rows[0].snapshot_json;
      }
    } else {
      const versList = this.demoVersions.get(planId) || [];
      const v = versList.find((ver) => ver.versionNumber === versionNumber);
      if (v) snapshotJson = v.snapshotJson;
    }

    if (!snapshotJson) return null;

    const restoredPlan: ExamStudyPlan = JSON.parse(snapshotJson);
    await this.replacePlanItems(userId, planId, restoredPlan.items);

    if (db.isHealthy()) {
      await db.execute(
        `UPDATE exam_study_plans SET current_version = ?, updated_at = NOW(3) WHERE id = ?`,
        [versionNumber, planId]
      );
    } else {
      const list = this.demoPlans.get(userId) || [];
      const storedPlan = list.find((p) => p.id === planId);
      if (storedPlan) {
        storedPlan.currentVersion = versionNumber;
      }
    }

    return await this.getPlanById(userId, planId);
  }

  private mapItemRow(r: any): ExamStudyPlanItem {
    return {
      id: r.id,
      planId: r.plan_id,
      subjectId: r.subject_id || undefined,
      subjectName: r.subject_name || undefined,
      title: r.title,
      description: r.description || undefined,
      activityType: r.activity_type as ExamPlanActivityType,
      sourceType: r.source_type,
      sourceId: r.source_id || undefined,
      priority: r.priority || 'medium',
      plannedDate: r.planned_date,
      startAt: r.start_at,
      endAt: r.end_at,
      plannedMinutes: Number(r.planned_minutes || 30),
      status: r.status as ExamPlanItemStatus,
      completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : undefined,
      sortOrder: Number(r.sort_order || 0),
      taskId: r.task_id || undefined,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }
}

export const examStudyPlanRepo = new ExamStudyPlanRepository();
