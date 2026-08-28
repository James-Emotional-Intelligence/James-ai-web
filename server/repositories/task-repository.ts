import { db } from '../db/mysql';
import { StudyTask, ExecutionGuide, ExecutionStep, TaskEvidence, PreparationChecklistItem } from '../../shared/types';
import crypto from 'crypto';

export class TaskRepository {
  private static instance: TaskRepository;
  private demoTasks: Map<string, StudyTask[]> = new Map();
  private demoGuides: Map<string, ExecutionGuide> = new Map();
  private demoEvidence: Map<string, TaskEvidence[]> = new Map();
  private demoChecklists: Map<string, PreparationChecklistItem[]> = new Map();

  private constructor() {}

  public static getInstance(): TaskRepository {
    if (!TaskRepository.instance) {
      TaskRepository.instance = new TaskRepository();
    }
    return TaskRepository.instance;
  }

  public async getByUserId(
    userId: string,
    filters?: { status?: string; subjectId?: string }
  ): Promise<StudyTask[]> {
    if (db.isHealthy()) {
      let query = `
        SELECT t.id, t.user_id, t.plan_id, t.subject_id, t.exam_id, t.parent_task_id,
               t.title, t.objective, t.status, t.priority, t.difficulty, t.due_at,
               t.estimated_minutes, t.minimum_session_minutes, t.maximum_session_minutes,
               t.splittable, t.locked, t.scheduled_start_at, t.scheduled_end_at,
               t.completion_percent, t.source,
               s.name as subject_name, s.color as subject_color
        FROM study_tasks t
        LEFT JOIN subjects s ON t.subject_id = s.id
        WHERE t.user_id = ?
      `;
      const params: any[] = [userId];

      if (filters?.status) {
        query += ` AND t.status = ?`;
        params.push(filters.status);
      }
      if (filters?.subjectId) {
        query += ` AND t.subject_id = ?`;
        params.push(filters.subjectId);
      }

      query += ` ORDER BY t.scheduled_start_at ASC, t.created_at ASC`;

      const rows = await db.query<any>(query, params);
      return rows.map((r) => this.mapTaskRow(r));
    }

    let list = this.demoTasks.get(userId) || [];
    if (filters?.status) {
      list = list.filter((t) => t.status === filters.status);
    }
    if (filters?.subjectId) {
      list = list.filter((t) => t.subjectId === filters.subjectId);
    }
    return list;
  }

  public async getById(userId: string, taskId: string): Promise<StudyTask | null> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT t.id, t.user_id, t.plan_id, t.subject_id, t.exam_id, t.parent_task_id,
                t.title, t.objective, t.status, t.priority, t.difficulty, t.due_at,
                t.estimated_minutes, t.minimum_session_minutes, t.maximum_session_minutes,
                t.splittable, t.locked, t.scheduled_start_at, t.scheduled_end_at,
                t.completion_percent, t.source,
                s.name as subject_name, s.color as subject_color
         FROM study_tasks t
         LEFT JOIN subjects s ON t.subject_id = s.id
         WHERE t.id = ? AND t.user_id = ?`,
        [taskId, userId]
      );

      if (rows.length === 0) {
        return null;
      }

      const task = this.mapTaskRow(rows[0]);
      task.executionGuide = (await this.getExecutionGuide(userId, taskId)) || undefined;
      return task;
    }

    const list = this.demoTasks.get(userId) || [];
    const task = list.find((t) => t.id === taskId);
    if (!task) return null;

    const copy = { ...task };
    copy.executionGuide = this.demoGuides.get(taskId) || undefined;
    return copy;
  }

  public async createTask(userId: string, task: Partial<StudyTask>): Promise<StudyTask> {
    return this.create(userId, task);
  }

  public async create(userId: string, task: Partial<StudyTask>): Promise<StudyTask> {
    const id = task.id || 'task_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const newTask: StudyTask = {
      id,
      userId,
      planId: task.planId,
      subjectId: task.subjectId || 'subj-general',
      subjectName: task.subjectName,
      examId: task.examId,
      title: (task.title || 'Nhiệm vụ mới').trim(),
      objective: task.objective || '',
      status: task.status || 'pending',
      priority: task.priority || 'medium',
      difficulty: task.difficulty || 'medium',
      dueAt: task.dueAt,
      estimatedMinutes: task.estimatedMinutes || 45,
      minSessionMinutes: task.minSessionMinutes || 20,
      maxSessionMinutes: task.maxSessionMinutes || 60,
      splittable: task.splittable ?? false,
      locked: task.locked ?? false,
      scheduledStartAt: task.scheduledStartAt,
      scheduledEndAt: task.scheduledEndAt,
      completionPercent: task.completionPercent || 0,
      source: task.source || 'user',
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO study_tasks (
          id, user_id, plan_id, subject_id, exam_id, title, objective, status, priority, difficulty,
          due_at, estimated_minutes, minimum_session_minutes, maximum_session_minutes, splittable,
          locked, scheduled_start_at, scheduled_end_at, completion_percent, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
        [
          newTask.id,
          userId,
          newTask.planId || null,
          newTask.subjectId,
          newTask.examId || null,
          newTask.title,
          newTask.objective,
          newTask.status,
          newTask.priority,
          newTask.difficulty,
          newTask.dueAt ? new Date(newTask.dueAt) : null,
          newTask.estimatedMinutes,
          newTask.minSessionMinutes,
          newTask.maxSessionMinutes,
          newTask.splittable ? 1 : 0,
          newTask.locked ? 1 : 0,
          newTask.scheduledStartAt ? new Date(newTask.scheduledStartAt) : null,
          newTask.scheduledEndAt ? new Date(newTask.scheduledEndAt) : null,
          newTask.completionPercent,
          newTask.source,
        ]
      );
    } else {
      const list = this.demoTasks.get(userId) || [];
      list.push(newTask);
      this.demoTasks.set(userId, list);
    }

    return newTask;
  }

  public async update(userId: string, taskId: string, updates: Partial<StudyTask>): Promise<StudyTask | null> {
    if (db.isHealthy()) {
      const setParts: string[] = [];
      const values: any[] = [];

      if (updates.title !== undefined) {
        setParts.push('title = ?');
        values.push(updates.title);
      }
      if (updates.subjectId !== undefined) {
        setParts.push('subject_id = ?');
        values.push(updates.subjectId);
      }
      if (updates.objective !== undefined) {
        setParts.push('objective = ?');
        values.push(updates.objective);
      }
      if (updates.priority !== undefined) {
        setParts.push('priority = ?');
        values.push(updates.priority);
      }
      if (updates.difficulty !== undefined) {
        setParts.push('difficulty = ?');
        values.push(updates.difficulty);
      }
      if (updates.estimatedMinutes !== undefined) {
        setParts.push('estimated_minutes = ?');
        values.push(updates.estimatedMinutes);
      }
      if (updates.dueAt !== undefined) {
        setParts.push('due_at = ?');
        values.push(updates.dueAt ? new Date(updates.dueAt) : null);
      }
      if (updates.scheduledStartAt !== undefined) {
        setParts.push('scheduled_start_at = ?');
        values.push(updates.scheduledStartAt ? new Date(updates.scheduledStartAt) : null);
      }
      if (updates.scheduledEndAt !== undefined) {
        setParts.push('scheduled_end_at = ?');
        values.push(updates.scheduledEndAt ? new Date(updates.scheduledEndAt) : null);
      }
      if (updates.status !== undefined) {
        setParts.push('status = ?');
        values.push(updates.status);
        if (updates.status === 'completed') {
          setParts.push('completion_percent = 100', 'completed_at = NOW(3)');
        }
      }
      if (updates.completionPercent !== undefined) {
        setParts.push('completion_percent = ?');
        values.push(updates.completionPercent);
      }
      if (updates.locked !== undefined) {
        setParts.push('locked = ?');
        values.push(updates.locked ? 1 : 0);
      }

      if (setParts.length > 0) {
        setParts.push('updated_at = NOW(3)');
        values.push(taskId, userId);

        const res = await db.execute(
          `UPDATE study_tasks SET ${setParts.join(', ')} WHERE id = ? AND user_id = ?`,
          values
        );
        if ((res?.affectedRows || 0) === 0) {
          return null;
        }
      }
    } else {
      const list = this.demoTasks.get(userId) || [];
      const task = list.find((t) => t.id === taskId);
      if (!task) return null;

      Object.assign(task, updates);
      if (updates.status === 'completed') {
        task.completionPercent = 100;
      }
    }

    return this.getById(userId, taskId);
  }

  public async deleteTask(userId: string, taskId: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute('DELETE FROM study_tasks WHERE id = ? AND user_id = ?', [taskId, userId]);
      return (res?.affectedRows || 0) > 0;
    }

    const list = this.demoTasks.get(userId) || [];
    const idx = list.findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      list.splice(idx, 1);
      this.demoTasks.set(userId, list);
      this.demoGuides.delete(taskId);
      return true;
    }
    return false;
  }

  public async completeTask(userId: string, taskId: string): Promise<StudyTask | null> {
    return this.update(userId, taskId, { status: 'completed', completionPercent: 100 });
  }

  public async unscheduleTask(userId: string, taskId: string): Promise<StudyTask | null> {
    return this.update(userId, taskId, { scheduledStartAt: null as any, scheduledEndAt: null as any });
  }

  public async generateTasksCsv(userId: string): Promise<string> {
    const tasks = await this.getByUserId(userId);
    const escapeCell = (val: any): string => {
      if (val === null || val === undefined) return '""';
      let str = String(val).replace(/"/g, '""');
      if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
      return `"${str}"`;
    };

    const lines: string[] = [];
    lines.push('\uFEFF"DANH SÁCH NHIỆM VỤ HỌC TẬP JAMI AI"');
    lines.push(`"Ngày xuất",${escapeCell(new Date().toLocaleDateString('vi-VN'))}`);
    lines.push('');
    lines.push('"Tiêu đề","Trạng thái","Thời gian ước tính (phút)","Hạn chót","Lịch học","Ưu tiên","Mô tả"');

    for (const t of tasks) {
      lines.push([
        escapeCell(t.title),
        escapeCell(t.status === 'completed' ? 'Đã hoàn thành' : t.status === 'in_progress' ? 'Đang làm' : 'Chưa bắt đầu'),
        escapeCell(t.estimatedMinutes),
        escapeCell(t.dueAt || 'Không có'),
        escapeCell(t.scheduledStartAt ? `${t.scheduledStartAt}` : 'Chưa xếp lịch'),
        escapeCell(t.priority || 'medium'),
        escapeCell(t.objective || ''),
      ].join(','));
    }

    return lines.join('\r\n');
  }

  // ==========================================
  // Execution Guide & Steps Subsystem
  // ==========================================

  public async getExecutionGuide(userId: string, taskId: string): Promise<ExecutionGuide | null> {
    if (db.isHealthy()) {
      const guideRows = await db.query<any>(
        `SELECT g.id, g.task_id, g.objective, g.why_it_matters, g.prerequisites_json, g.materials_json,
                g.preparation_checklist_json, g.success_criteria_json, g.excellent_criteria_json,
                g.evidence_required_json, g.common_mistakes_json, g.fallback_action,
                g.completion_questions_json, g.next_action, g.version
         FROM execution_guides g
         JOIN study_tasks t ON g.task_id = t.id
         WHERE g.task_id = ? AND t.user_id = ?`,
        [taskId, userId]
      );

      if (guideRows.length === 0) {
        return null;
      }

      const g = guideRows[0];
      const stepRows = await db.query<any>(
        `SELECT id, guide_id, step_order, title, planned_minutes, instruction, expected_output, tips_json, status, started_at, completed_at, actual_minutes
         FROM execution_steps
         WHERE guide_id = ?
         ORDER BY step_order ASC`,
        [g.id]
      );

      const checklistRows = await db.query<any>(
        `SELECT id, text, is_checked, checked_at
         FROM execution_checklist_items
         WHERE task_id = ? AND user_id = ?
         ORDER BY item_order ASC`,
        [taskId, userId]
      );

      const parseJson = (val: any) => {
        if (!val) return [];
        if (typeof val === 'string') {
          try {
            return JSON.parse(val);
          } catch {
            return [];
          }
        }
        return val;
      };

      const steps: ExecutionStep[] = stepRows.map((s) => ({
        id: s.id,
        stepOrder: s.step_order,
        title: s.title,
        plannedMinutes: s.planned_minutes,
        instruction: s.instruction,
        expectedOutput: s.expected_output,
        tips: parseJson(s.tips_json),
        status: s.status,
        actualMinutes: s.actual_minutes || undefined,
        startedAt: s.started_at ? s.started_at.toISOString?.() || String(s.started_at) : undefined,
        completedAt: s.completed_at ? s.completed_at.toISOString?.() || String(s.completed_at) : undefined,
      }));

      const preparationChecklist: PreparationChecklistItem[] =
        checklistRows.length > 0
          ? checklistRows.map((c) => ({
              id: c.id,
              text: c.text,
              checked: Boolean(c.is_checked),
              checkedAt: c.checked_at?.toISOString?.() || (c.checked_at ? String(c.checked_at) : undefined),
            }))
          : parseJson(g.preparation_checklist_json).map((c: any, idx: number) => ({
              id: c.id || `chk_${idx + 1}`,
              text: typeof c === 'string' ? c : c.text || '',
              checked: Boolean(c.checked || c.is_checked),
            }));

      return {
        id: g.id,
        taskId: g.task_id,
        objective: g.objective,
        whyItMatters: g.why_it_matters,
        prerequisites: parseJson(g.prerequisites_json),
        materials: parseJson(g.materials_json),
        preparationChecklist,
        steps,
        successCriteria: parseJson(g.success_criteria_json),
        excellentCriteria: parseJson(g.excellent_criteria_json),
        evidenceRequired: parseJson(g.evidence_required_json),
        commonMistakes: parseJson(g.common_mistakes_json),
        fallbackAction: g.fallback_action || 'Nhờ Jami AI giải thích bước chưa hiểu',
        completionQuestions: parseJson(g.completion_questions_json),
        nextAction: g.next_action || 'Chuyển sang làm bài tập vận dụng',
      };
    }

    return this.demoGuides.get(taskId) || null;
  }

  public async saveExecutionGuide(userId: string, taskId: string, guide: ExecutionGuide): Promise<ExecutionGuide> {
    if (db.isHealthy()) {
      const guideId = guide.id || 'guide_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);

      await db.withTransaction(async (conn) => {
        await conn.execute('DELETE FROM execution_checklist_items WHERE task_id = ? AND user_id = ?', [taskId, userId]);
        await conn.execute('DELETE FROM execution_guides WHERE task_id = ?', [taskId]);

        await conn.execute(
          `INSERT INTO execution_guides (
            id, task_id, objective, why_it_matters, prerequisites_json, materials_json,
            preparation_checklist_json, success_criteria_json, excellent_criteria_json,
            evidence_required_json, common_mistakes_json, fallback_action,
            completion_questions_json, next_action, version, generated_by_ai, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, NOW(3), NOW(3))`,
          [
            guideId,
            taskId,
            guide.objective,
            guide.whyItMatters,
            JSON.stringify(guide.prerequisites || []),
            JSON.stringify(guide.materials || []),
            JSON.stringify(guide.preparationChecklist || []),
            JSON.stringify(guide.successCriteria || []),
            JSON.stringify(guide.excellentCriteria || []),
            JSON.stringify(guide.evidenceRequired || []),
            JSON.stringify(guide.commonMistakes || []),
            guide.fallbackAction,
            JSON.stringify(guide.completionQuestions || []),
            guide.nextAction,
          ]
        );

        for (let i = 0; i < (guide.steps || []).length; i++) {
          const s = guide.steps[i];
          const stepId = 'step_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
          await conn.execute(
            `INSERT INTO execution_steps (
              id, guide_id, step_order, title, planned_minutes, instruction, expected_output, tips_json, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              stepId,
              guideId,
              s.stepOrder || i + 1,
              s.title,
              s.plannedMinutes || 10,
              s.instruction,
              s.expectedOutput,
              JSON.stringify(s.tips || []),
              s.status || 'pending',
            ]
          );
        }

        for (let j = 0; j < (guide.preparationChecklist || []).length; j++) {
          const c = guide.preparationChecklist[j];
          const chkId = 'chk_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
          await conn.execute(
            `INSERT INTO execution_checklist_items (
              id, task_id, guide_id, user_id, item_order, text, is_checked, checked_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
            [
              chkId,
              taskId,
              guideId,
              userId,
              j + 1,
              c.text,
              c.checked ? 1 : 0,
              c.checked ? new Date() : null,
            ]
          );
        }
      });
    } else {
      this.demoGuides.set(taskId, guide);
      this.demoChecklists.set(taskId, guide.preparationChecklist || []);
    }

    const saved = await this.getExecutionGuide(userId, taskId);
    return saved || guide;
  }

  public async updateChecklistItem(
    userId: string,
    taskId: string,
    checklistItemId: string,
    checked: boolean
  ): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute(
        `UPDATE execution_checklist_items
         SET is_checked = ?, checked_at = CASE WHEN ? = 1 THEN NOW(3) ELSE NULL END, updated_at = NOW(3)
         WHERE id = ? AND task_id = ? AND user_id = ?`,
        [checked ? 1 : 0, checked ? 1 : 0, checklistItemId, taskId, userId]
      );

      // Also sync back to execution_guides JSON if row exists
      const guide = await this.getExecutionGuide(userId, taskId);
      if (guide && guide.preparationChecklist) {
        const item = guide.preparationChecklist.find((c) => c.id === checklistItemId);
        if (item) {
          item.checked = checked;
          await db.execute(
            `UPDATE execution_guides SET preparation_checklist_json = ?, updated_at = NOW(3) WHERE task_id = ?`,
            [JSON.stringify(guide.preparationChecklist), taskId]
          );
        }
      }

      return (res?.affectedRows || 0) > 0;
    }

    const list = this.demoChecklists.get(taskId) || [];
    const item = list.find((c) => c.id === checklistItemId);
    if (item) {
      item.checked = checked;
      const guide = this.demoGuides.get(taskId);
      if (guide) {
        const gItem = guide.preparationChecklist.find((c) => c.id === checklistItemId);
        if (gItem) gItem.checked = checked;
      }
      return true;
    }
    return false;
  }

  public async updateExecutionStep(
    userId: string,
    taskId: string,
    stepId: string,
    status: 'pending' | 'in_progress' | 'completed',
    actualMinutes?: number
  ): Promise<{ task: StudyTask | null; guide: ExecutionGuide | null }> {
    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        // 1. Update step
        await conn.execute(
          `UPDATE execution_steps s
           JOIN execution_guides g ON s.guide_id = g.id
           JOIN study_tasks t ON g.task_id = t.id
           SET s.status = ?,
               s.started_at = CASE WHEN ? = 'in_progress' AND s.started_at IS NULL THEN NOW(3) ELSE s.started_at END,
               s.completed_at = CASE WHEN ? = 'completed' THEN NOW(3) ELSE s.completed_at END,
               s.actual_minutes = COALESCE(?, s.actual_minutes)
           WHERE s.id = ? AND g.task_id = ? AND t.user_id = ?`,
          [status, status, status, actualMinutes || null, stepId, taskId, userId]
        );

        // 2. Compute progress from total steps
        const stepRows = await conn.query<any>(
          `SELECT s.status
           FROM execution_steps s
           JOIN execution_guides g ON s.guide_id = g.id
           WHERE g.task_id = ?`,
          [taskId]
        );

        const totalSteps = stepRows.length;
        const completedSteps = stepRows.filter((r: any) => r.status === 'completed').length;
        const inProgressSteps = stepRows.filter((r: any) => r.status === 'in_progress').length;

        let completionPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
        let taskStatus: 'pending' | 'in_progress' | 'completed' = 'pending';

        if (completedSteps === totalSteps && totalSteps > 0) {
          taskStatus = 'completed';
          completionPercent = 100;
        } else if (completedSteps > 0 || inProgressSteps > 0) {
          taskStatus = 'in_progress';
        }

        await conn.execute(
          `UPDATE study_tasks 
           SET status = ?, completion_percent = ?, updated_at = NOW(3)
           WHERE id = ? AND user_id = ?`,
          [taskStatus, completionPercent, taskId, userId]
        );
      });
    } else {
      const guide = this.demoGuides.get(taskId);
      if (guide) {
        const step = guide.steps.find((s) => s.id === stepId);
        if (step) {
          step.status = status;
          if (status === 'completed') {
            step.completedAt = new Date().toISOString();
            if (actualMinutes) step.actualMinutes = actualMinutes;
          } else if (status === 'in_progress') {
            step.startedAt = new Date().toISOString();
          }

          const total = guide.steps.length;
          const done = guide.steps.filter((s) => s.status === 'completed').length;
          const inProgress = guide.steps.filter((s) => s.status === 'in_progress').length;
          const percent = total > 0 ? Math.round((done / total) * 100) : 0;

          const tasks = this.demoTasks.get(userId) || [];
          const task = tasks.find((t) => t.id === taskId);
          if (task) {
            task.completionPercent = percent;
            task.status = done === total && total > 0 ? 'completed' : done > 0 || inProgress > 0 ? 'in_progress' : 'pending';
          }
        }
      }
    }

    const task = await this.getById(userId, taskId);
    const guide = await this.getExecutionGuide(userId, taskId);
    return { task, guide };
  }

  public async completeStep(
    userId: string,
    taskId: string,
    stepId: string,
    actualMinutes?: number
  ): Promise<{ task: StudyTask | null; guide: ExecutionGuide | null }> {
    return this.updateExecutionStep(userId, taskId, stepId, 'completed', actualMinutes);
  }

  public async reorderExecutionSteps(
    userId: string,
    taskId: string,
    orderedStepIds: string[]
  ): Promise<ExecutionGuide | null> {
    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        for (let i = 0; i < orderedStepIds.length; i++) {
          const stepId = orderedStepIds[i];
          await conn.execute(
            `UPDATE execution_steps s
             JOIN execution_guides g ON s.guide_id = g.id
             JOIN study_tasks t ON g.task_id = t.id
             SET s.step_order = ?
             WHERE s.id = ? AND g.task_id = ? AND t.user_id = ?`,
            [i + 1, stepId, taskId, userId]
          );
        }
      });
    } else {
      const guide = this.demoGuides.get(taskId);
      if (guide && guide.steps) {
        const stepMap = new Map(guide.steps.map((s) => [s.id, s]));
        const newSteps: ExecutionStep[] = [];
        for (let i = 0; i < orderedStepIds.length; i++) {
          const s = stepMap.get(orderedStepIds[i]);
          if (s) {
            s.stepOrder = i + 1;
            newSteps.push(s);
          }
        }
        guide.steps = newSteps;
      }
    }

    return this.getExecutionGuide(userId, taskId);
  }

  public async updateExecutionStepDetails(
    userId: string,
    taskId: string,
    stepId: string,
    updates: {
      title?: string;
      instruction?: string;
      expectedOutput?: string;
      plannedMinutes?: number;
      status?: 'pending' | 'in_progress' | 'completed';
    }
  ): Promise<ExecutionGuide | null> {
    if (db.isHealthy()) {
      const setParts: string[] = [];
      const values: any[] = [];

      if (updates.title !== undefined) {
        setParts.push('s.title = ?');
        values.push(updates.title);
      }
      if (updates.instruction !== undefined) {
        setParts.push('s.instruction = ?');
        values.push(updates.instruction);
      }
      if (updates.expectedOutput !== undefined) {
        setParts.push('s.expected_output = ?');
        values.push(updates.expectedOutput);
      }
      if (updates.plannedMinutes !== undefined) {
        setParts.push('s.planned_minutes = ?');
        values.push(updates.plannedMinutes);
      }
      if (updates.status !== undefined) {
        setParts.push('s.status = ?');
        values.push(updates.status);
        if (updates.status === 'completed') {
          setParts.push('s.completed_at = NOW(3)');
        }
      }

      if (setParts.length > 0) {
        values.push(stepId, taskId, userId);
        await db.execute(
          `UPDATE execution_steps s
           JOIN execution_guides g ON s.guide_id = g.id
           JOIN study_tasks t ON g.task_id = t.id
           SET ${setParts.join(', ')}
           WHERE s.id = ? AND g.task_id = ? AND t.user_id = ?`,
          values
        );
      }
    } else {
      const guide = this.demoGuides.get(taskId);
      if (guide && guide.steps) {
        const step = guide.steps.find((s) => s.id === stepId);
        if (step) {
          if (updates.title !== undefined) step.title = updates.title;
          if (updates.instruction !== undefined) step.instruction = updates.instruction;
          if (updates.expectedOutput !== undefined) step.expectedOutput = updates.expectedOutput;
          if (updates.plannedMinutes !== undefined) step.plannedMinutes = updates.plannedMinutes;
          if (updates.status !== undefined) step.status = updates.status;
        }
      }
    }

    return this.getExecutionGuide(userId, taskId);
  }

  public async addEvidence(userId: string, evidence: Partial<TaskEvidence>): Promise<TaskEvidence> {
    const id = evidence.id || 'evid_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const created: TaskEvidence = {
      id,
      userId,
      taskId: evidence.taskId!,
      stepId: evidence.stepId,
      type: evidence.type || 'text',
      textValue: evidence.textValue,
      r2ObjectKey: evidence.r2ObjectKey,
      fileUrl: evidence.fileUrl,
      scoreValue: evidence.scoreValue,
      notes: evidence.notes,
      verified: Boolean(evidence.verified),
      createdAt: new Date().toISOString(),
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO task_evidence (id, user_id, task_id, step_id, type, text_value, r2_object_key, score_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
        [
          created.id,
          userId,
          created.taskId,
          created.stepId || null,
          created.type,
          created.textValue || null,
          created.r2ObjectKey || null,
          created.scoreValue || null,
        ]
      );
    } else {
      const list = this.demoEvidence.get(created.taskId) || [];
      list.push(created);
      this.demoEvidence.set(created.taskId, list);
    }

    return created;
  }

  public async getEvidenceByTaskId(userId: string, taskId: string): Promise<TaskEvidence[]> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT id, user_id, task_id, step_id, type, text_value, r2_object_key, score_value, created_at
         FROM task_evidence
         WHERE task_id = ? AND user_id = ?
         ORDER BY created_at DESC`,
        [taskId, userId]
      );

      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        taskId: r.task_id,
        stepId: r.step_id || undefined,
        type: r.type,
        textValue: r.text_value || undefined,
        r2ObjectKey: r.r2_object_key || undefined,
        scoreValue: r.score_value !== null ? Number(r.score_value) : undefined,
        verified: false,
        createdAt: r.created_at?.toISOString?.() || String(r.created_at),
      }));
    }

    return this.demoEvidence.get(taskId) || [];
  }

  private mapTaskRow(r: any): StudyTask {
    return {
      id: r.id,
      userId: r.user_id,
      planId: r.plan_id || undefined,
      subjectId: r.subject_id,
      subjectName: r.subject_name || 'Môn học',
      examId: r.exam_id || undefined,
      title: r.title,
      objective: r.objective || '',
      status: r.status,
      priority: r.priority,
      difficulty: r.difficulty,
      dueAt: r.due_at ? r.due_at.toISOString?.() || String(r.due_at) : undefined,
      estimatedMinutes: Number(r.estimated_minutes) || 45,
      minSessionMinutes: Number(r.minimum_session_minutes) || 20,
      maxSessionMinutes: Number(r.maximum_session_minutes) || 60,
      splittable: Boolean(r.splittable),
      locked: Boolean(r.locked),
      scheduledStartAt: r.scheduled_start_at ? r.scheduled_start_at.toISOString?.() || String(r.scheduled_start_at) : undefined,
      scheduledEndAt: r.scheduled_end_at ? r.scheduled_end_at.toISOString?.() || String(r.scheduled_end_at) : undefined,
      completionPercent: Number(r.completion_percent) || 0,
      source: r.source || 'user',
    };
  }

  public seedDemo(userId: string, tasks: StudyTask[], guides: Map<string, ExecutionGuide> = new Map()) {
    this.demoTasks.set(userId, [...tasks]);
    if (guides) {
      for (const [k, v] of guides.entries()) {
        this.demoGuides.set(k, v);
      }
    }
  }
}

export const taskRepo = TaskRepository.getInstance();
