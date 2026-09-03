import { db } from '../db/mysql';
import { isProduction, isDatabaseRequired } from '../config/env';
import {
  TomorrowPreparationPlan,
  TomorrowPreparationItem,
  TomorrowPlanEnergyLevel,
  TomorrowPlanStatus,
  TomorrowPlanItemStatus,
} from '../../shared/types';
import crypto from 'crypto';

export class TomorrowPlanRepository {
  // In-memory fallback for demo mode
  private demoPlans = new Map<string, TomorrowPreparationPlan[]>();

  public async getPlanByDate(userId: string, planDate: string): Promise<TomorrowPreparationPlan | null> {
    if (db.isHealthy()) {
      const planRows = await db.query<any>(
        `SELECT id, user_id, plan_date, target_date, available_start, available_end,
                energy_level, total_minutes, status, generated_at, accepted_at, completed_at,
                created_at, updated_at
         FROM tomorrow_preparation_plans
         WHERE user_id = ? AND plan_date = ?
         LIMIT 1`,
        [userId, planDate]
      );
      if (planRows.length === 0) return null;

      const p = planRows[0];
      const itemRows = await db.query<any>(
        `SELECT i.id, i.plan_id, i.subject_id, i.title, i.description, i.reason,
                i.source_type, i.source_id, i.priority, i.planned_minutes,
                i.start_at, i.end_at, i.status, i.sort_order, i.task_id,
                i.created_at, i.updated_at,
                s.name as subject_name, s.color as subject_color
         FROM tomorrow_preparation_items i
         LEFT JOIN subjects s ON i.subject_id = s.id
         WHERE i.plan_id = ?
         ORDER BY i.sort_order ASC, i.start_at ASC`,
        [p.id]
      );

      return {
        id: p.id,
        userId: p.user_id,
        planDate: p.plan_date,
        targetDate: p.target_date,
        availableStart: p.available_start,
        availableEnd: p.available_end,
        energyLevel: p.energy_level as TomorrowPlanEnergyLevel,
        totalMinutes: Number(p.total_minutes || 0),
        status: p.status as TomorrowPlanStatus,
        generatedAt: new Date(p.generated_at).toISOString(),
        acceptedAt: p.accepted_at ? new Date(p.accepted_at).toISOString() : undefined,
        completedAt: p.completed_at ? new Date(p.completed_at).toISOString() : undefined,
        items: itemRows.map(this.mapItemRow),
        createdAt: new Date(p.created_at).toISOString(),
        updatedAt: new Date(p.updated_at).toISOString(),
      };
    }

    const list = this.demoPlans.get(userId) || [];
    const plan = list.find((p) => p.planDate === planDate);
    return plan ? JSON.parse(JSON.stringify(plan)) : null;
  }

  public async getPlanById(userId: string, planId: string): Promise<TomorrowPreparationPlan | null> {
    if (db.isHealthy()) {
      const planRows = await db.query<any>(
        `SELECT id, user_id, plan_date, target_date, available_start, available_end,
                energy_level, total_minutes, status, generated_at, accepted_at, completed_at,
                created_at, updated_at
         FROM tomorrow_preparation_plans
         WHERE user_id = ? AND id = ?
         LIMIT 1`,
        [userId, planId]
      );
      if (planRows.length === 0) return null;

      const p = planRows[0];
      const itemRows = await db.query<any>(
        `SELECT i.id, i.plan_id, i.subject_id, i.title, i.description, i.reason,
                i.source_type, i.source_id, i.priority, i.planned_minutes,
                i.start_at, i.end_at, i.status, i.sort_order, i.task_id,
                i.created_at, i.updated_at,
                s.name as subject_name, s.color as subject_color
         FROM tomorrow_preparation_items i
         LEFT JOIN subjects s ON i.subject_id = s.id
         WHERE i.plan_id = ?
         ORDER BY i.sort_order ASC, i.start_at ASC`,
        [p.id]
      );

      return {
        id: p.id,
        userId: p.user_id,
        planDate: p.plan_date,
        targetDate: p.target_date,
        availableStart: p.available_start,
        availableEnd: p.available_end,
        energyLevel: p.energy_level as TomorrowPlanEnergyLevel,
        totalMinutes: Number(p.total_minutes || 0),
        status: p.status as TomorrowPlanStatus,
        generatedAt: new Date(p.generated_at).toISOString(),
        acceptedAt: p.accepted_at ? new Date(p.accepted_at).toISOString() : undefined,
        completedAt: p.completed_at ? new Date(p.completed_at).toISOString() : undefined,
        items: itemRows.map(this.mapItemRow),
        createdAt: new Date(p.created_at).toISOString(),
        updatedAt: new Date(p.updated_at).toISOString(),
      };
    }

    const list = this.demoPlans.get(userId) || [];
    const plan = list.find((p) => p.id === planId);
    return plan ? JSON.parse(JSON.stringify(plan)) : null;
  }

  public async createOrReplacePlan(
    userId: string,
    planData: {
      planDate: string;
      targetDate: string;
      availableStart: string;
      availableEnd: string;
      energyLevel: TomorrowPlanEnergyLevel;
      totalMinutes: number;
      status?: TomorrowPlanStatus;
    },
    items: Array<Omit<TomorrowPreparationItem, 'id' | 'planId' | 'createdAt' | 'updatedAt'>>
  ): Promise<TomorrowPreparationPlan> {
    const planId = 'plan_tom_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const nowIso = new Date().toISOString();
    const status = planData.status || 'draft';

    const createdItems: TomorrowPreparationItem[] = items.map((item, idx) => ({
      id: 'item_tom_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24),
      planId,
      subjectId: item.subjectId,
      subjectName: item.subjectName,
      subjectColor: item.subjectColor,
      title: item.title,
      description: item.description,
      reason: item.reason,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      priority: item.priority || 'medium',
      plannedMinutes: item.plannedMinutes,
      startAt: item.startAt,
      endAt: item.endAt,
      status: item.status || 'pending',
      sortOrder: item.sortOrder ?? idx,
      taskId: item.taskId,
      createdAt: nowIso,
      updatedAt: nowIso,
    }));

    const plan: TomorrowPreparationPlan = {
      id: planId,
      userId,
      planDate: planData.planDate,
      targetDate: planData.targetDate,
      availableStart: planData.availableStart,
      availableEnd: planData.availableEnd,
      energyLevel: planData.energyLevel,
      totalMinutes: planData.totalMinutes,
      status,
      generatedAt: nowIso,
      items: createdItems,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (db.isHealthy()) {
      // Delete existing plan on this plan_date if any
      const existing = await db.query<any>(
        `SELECT id FROM tomorrow_preparation_plans WHERE user_id = ? AND plan_date = ?`,
        [userId, planData.planDate]
      );
      if (existing.length > 0) {
        await db.execute(`DELETE FROM tomorrow_preparation_plans WHERE id = ?`, [existing[0].id]);
      }

      await db.execute(
        `INSERT INTO tomorrow_preparation_plans
          (id, user_id, plan_date, target_date, available_start, available_end, energy_level, total_minutes, status, generated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3), NOW(3))`,
        [
          planId,
          userId,
          planData.planDate,
          planData.targetDate,
          planData.availableStart,
          planData.availableEnd,
          planData.energyLevel,
          planData.totalMinutes,
          status,
        ]
      );

      for (const item of createdItems) {
        await db.execute(
          `INSERT INTO tomorrow_preparation_items
            (id, plan_id, subject_id, title, description, reason, source_type, source_id, priority, planned_minutes, start_at, end_at, status, sort_order, task_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
          [
            item.id,
            planId,
            item.subjectId || null,
            item.title,
            item.description || null,
            item.reason || null,
            item.sourceType,
            item.sourceId || null,
            item.priority,
            item.plannedMinutes,
            item.startAt,
            item.endAt,
            item.status,
            item.sortOrder,
            item.taskId || null,
          ]
        );
      }
    } else {
      if (isProduction || isDatabaseRequired) {
        throw new Error('[JAMI Database] Database is unreachable. Cannot record tomorrow preparation plan.');
      }
      const list = this.demoPlans.get(userId) || [];
      const filtered = list.filter((p) => p.planDate !== planData.planDate);
      filtered.push(plan);
      this.demoPlans.set(userId, filtered);
    }

    return plan;
  }

  public async updatePlanStatus(
    userId: string,
    planId: string,
    status: TomorrowPlanStatus,
    acceptedAt?: string,
    completedAt?: string
  ): Promise<boolean> {
    const now = new Date();
    if (db.isHealthy()) {
      let query = `UPDATE tomorrow_preparation_plans SET status = ?, updated_at = NOW(3)`;
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

  public async updatePlanEnergyLevel(
    userId: string,
    planId: string,
    energyLevel: TomorrowPlanEnergyLevel
  ): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute(
        `UPDATE tomorrow_preparation_plans SET energy_level = ?, updated_at = NOW(3) WHERE user_id = ? AND id = ?`,
        [energyLevel, userId, planId]
      );
      return (res?.affectedRows || 0) > 0;
    }

    const list = this.demoPlans.get(userId) || [];
    const plan = list.find((p) => p.id === planId);
    if (plan) {
      plan.energyLevel = energyLevel;
      plan.updatedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  public async replacePlanItems(
    userId: string,
    planId: string,
    items: Array<Omit<TomorrowPreparationItem, 'id' | 'planId' | 'createdAt' | 'updatedAt'>>
  ): Promise<TomorrowPreparationItem[]> {
    const plan = await this.getPlanById(userId, planId);
    if (!plan) throw new Error('Không tìm thấy kế hoạch');

    const nowIso = new Date().toISOString();
    const createdItems: TomorrowPreparationItem[] = items.map((item, idx) => ({
      id: 'item_tom_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24),
      planId,
      subjectId: item.subjectId,
      subjectName: item.subjectName,
      subjectColor: item.subjectColor,
      title: item.title,
      description: item.description,
      reason: item.reason,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      priority: item.priority || 'medium',
      plannedMinutes: item.plannedMinutes,
      startAt: item.startAt,
      endAt: item.endAt,
      status: item.status || 'pending',
      sortOrder: item.sortOrder ?? idx,
      taskId: item.taskId,
      createdAt: nowIso,
      updatedAt: nowIso,
    }));

    const totalMinutes = createdItems.reduce((acc, i) => acc + i.plannedMinutes, 0);

    if (db.isHealthy()) {
      await db.execute(`DELETE FROM tomorrow_preparation_items WHERE plan_id = ?`, [planId]);
      await db.execute(
        `UPDATE tomorrow_preparation_plans SET total_minutes = ?, updated_at = NOW(3) WHERE id = ?`,
        [totalMinutes, planId]
      );

      for (const item of createdItems) {
        await db.execute(
          `INSERT INTO tomorrow_preparation_items
            (id, plan_id, subject_id, title, description, reason, source_type, source_id, priority, planned_minutes, start_at, end_at, status, sort_order, task_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
          [
            item.id,
            planId,
            item.subjectId || null,
            item.title,
            item.description || null,
            item.reason || null,
            item.sourceType,
            item.sourceId || null,
            item.priority,
            item.plannedMinutes,
            item.startAt,
            item.endAt,
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
        storedPlan.totalMinutes = totalMinutes;
        storedPlan.updatedAt = nowIso;
      }
    }

    return createdItems;
  }

  public async updateItem(
    userId: string,
    planId: string,
    itemId: string,
    data: Partial<TomorrowPreparationItem>
  ): Promise<TomorrowPreparationItem | null> {
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
      if (data.reason !== undefined) {
        setClauses.push('reason = ?');
        params.push(data.reason);
      }
      if (data.plannedMinutes !== undefined) {
        setClauses.push('planned_minutes = ?');
        params.push(data.plannedMinutes);
      }
      if (data.startAt !== undefined) {
        setClauses.push('start_at = ?');
        params.push(data.startAt);
      }
      if (data.endAt !== undefined) {
        setClauses.push('end_at = ?');
        params.push(data.endAt);
      }
      if (data.status !== undefined) {
        setClauses.push('status = ?');
        params.push(data.status);
      }
      if (data.taskId !== undefined) {
        setClauses.push('task_id = ?');
        params.push(data.taskId);
      }

      params.push(itemId, planId);
      await db.execute(
        `UPDATE tomorrow_preparation_items SET ${setClauses.join(', ')} WHERE id = ? AND plan_id = ?`,
        params
      );

      // Recalculate total_minutes
      const sumRows = await db.query<any>(
        `SELECT SUM(planned_minutes) as total FROM tomorrow_preparation_items WHERE plan_id = ?`,
        [planId]
      );
      const total = Number(sumRows[0]?.total || 0);
      await db.execute(`UPDATE tomorrow_preparation_plans SET total_minutes = ? WHERE id = ?`, [total, planId]);
    } else {
      const list = this.demoPlans.get(userId) || [];
      const storedPlan = list.find((p) => p.id === planId);
      if (!storedPlan) return null;
      const item = storedPlan.items.find((i) => i.id === itemId);
      if (!item) return null;
      Object.assign(item, data, { updatedAt: new Date().toISOString() });
      storedPlan.totalMinutes = storedPlan.items.reduce((acc, i) => acc + i.plannedMinutes, 0);
      storedPlan.updatedAt = new Date().toISOString();
    }

    const updatedPlan = await this.getPlanById(userId, planId);
    return updatedPlan?.items.find((i) => i.id === itemId) || null;
  }

  public async deleteItem(userId: string, planId: string, itemId: string): Promise<boolean> {
    const plan = await this.getPlanById(userId, planId);
    if (!plan) return false;

    if (db.isHealthy()) {
      const res = await db.execute(
        `DELETE FROM tomorrow_preparation_items WHERE id = ? AND plan_id = ?`,
        [itemId, planId]
      );
      if ((res?.affectedRows || 0) > 0) {
        const sumRows = await db.query<any>(
          `SELECT SUM(planned_minutes) as total FROM tomorrow_preparation_items WHERE plan_id = ?`,
          [planId]
        );
        const total = Number(sumRows[0]?.total || 0);
        await db.execute(`UPDATE tomorrow_preparation_plans SET total_minutes = ? WHERE id = ?`, [total, planId]);
        return true;
      }
      return false;
    }

    const list = this.demoPlans.get(userId) || [];
    const storedPlan = list.find((p) => p.id === planId);
    if (storedPlan) {
      const idx = storedPlan.items.findIndex((i) => i.id === itemId);
      if (idx >= 0) {
        storedPlan.items.splice(idx, 1);
        storedPlan.totalMinutes = storedPlan.items.reduce((acc, i) => acc + i.plannedMinutes, 0);
        storedPlan.updatedAt = new Date().toISOString();
        return true;
      }
    }
    return false;
  }

  private mapItemRow(r: any): TomorrowPreparationItem {
    return {
      id: r.id,
      planId: r.plan_id,
      subjectId: r.subject_id || undefined,
      subjectName: r.subject_name || undefined,
      subjectColor: r.subject_color || undefined,
      title: r.title,
      description: r.description || undefined,
      reason: r.reason || undefined,
      sourceType: r.source_type,
      sourceId: r.source_id || undefined,
      priority: r.priority || 'medium',
      plannedMinutes: Number(r.planned_minutes || 15),
      startAt: r.start_at,
      endAt: r.end_at,
      status: r.status || 'pending',
      sortOrder: Number(r.sort_order || 0),
      taskId: r.task_id || undefined,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }
}

export const tomorrowPlanRepo = new TomorrowPlanRepository();
