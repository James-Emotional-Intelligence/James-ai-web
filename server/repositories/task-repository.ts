import { db } from '../db/mysql';
import { StudyTask, ExecutionGuide, ExecutionStep, TaskEvidence } from '../../shared/types';
import crypto from 'crypto';

export class TaskRepository {
  private static instance: TaskRepository;
  private demoTasks: Map<string, StudyTask[]> = new Map();
  private demoGuides: Map<string, ExecutionGuide> = new Map();
  private demoEvidence: Map<string, TaskEvidence[]> = new Map();

  private constructor() {}

  public static getInstance(): TaskRepository {
    if (!TaskRepository.instance) {
      TaskRepository.instance = new TaskRepository();
    }
    return TaskRepository.instance;
  }

  public async getByUserId(userId: string): Promise<StudyTask[]> {
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
         WHERE t.user_id = ?
         ORDER BY t.scheduled_start_at ASC, t.created_at ASC`,
        [userId]
      );

      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        planId: r.plan_id,
        subjectId: r.subject_id,
        subjectName: r.subject_name || 'Môn học',
        examId: r.exam_id,
        title: r.title,
        objective: r.objective || '',
        status: r.status,
        priority: r.priority,
        difficulty: r.difficulty,
        dueAt: r.due_at ? r.due_at.toISOString?.() || String(r.due_at) : undefined,
        estimatedMinutes: r.estimated_minutes || 45,
        minSessionMinutes: r.minimum_session_minutes || 20,
        maxSessionMinutes: r.maximum_session_minutes || 60,
        splittable: Boolean(r.splittable),
        locked: Boolean(r.locked),
        scheduledStartAt: r.scheduled_start_at ? r.scheduled_start_at.toISOString?.() || String(r.scheduled_start_at) : undefined,
        scheduledEndAt: r.scheduled_end_at ? r.scheduled_end_at.toISOString?.() || String(r.scheduled_end_at) : undefined,
        completionPercent: r.completion_percent || 0,
        source: r.source || 'planner',
      }));
    }

    return this.demoTasks.get(userId) || [];
  }

  public async getById(userId: string, taskId: string): Promise<StudyTask | null> {
    const tasks = await this.getByUserId(userId);
    return tasks.find((t) => t.id === taskId) || null;
  }

  public async create(userId: string, task: Partial<StudyTask>): Promise<StudyTask> {
    const id = task.id || 'task_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const newTask: StudyTask = {
      id,
      userId,
      planId: task.planId,
      subjectId: task.subjectId || 'subj-math',
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
      source: task.source || 'planner',
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

      if (updates.status !== undefined) {
        setParts.push('status = ?');
        values.push(updates.status);
        if (updates.status === 'completed') {
          setParts.push('completion_percent = 100');
        }
      }
      if (updates.completionPercent !== undefined) {
        setParts.push('completion_percent = ?');
        values.push(updates.completionPercent);
      }
      if (updates.scheduledStartAt !== undefined) {
        setParts.push('scheduled_start_at = ?');
        values.push(updates.scheduledStartAt ? new Date(updates.scheduledStartAt) : null);
      }
      if (updates.scheduledEndAt !== undefined) {
        setParts.push('scheduled_end_at = ?');
        values.push(updates.scheduledEndAt ? new Date(updates.scheduledEndAt) : null);
      }
      if (updates.locked !== undefined) {
        setParts.push('locked = ?');
        values.push(updates.locked ? 1 : 0);
      }
      if (updates.priority !== undefined) {
        setParts.push('priority = ?');
        values.push(updates.priority);
      }
      if (updates.title !== undefined) {
        setParts.push('title = ?');
        values.push(updates.title);
      }

      if (setParts.length > 0) {
        setParts.push('updated_at = NOW(3)');
        values.push(taskId, userId);

        await db.execute(
          `UPDATE study_tasks SET ${setParts.join(', ')} WHERE id = ? AND user_id = ?`,
          values
        );
      }
    } else {
      const list = this.demoTasks.get(userId) || [];
      const task = list.find((t) => t.id === taskId);
      if (task) {
        Object.assign(task, updates);
        if (updates.status === 'completed') {
          task.completionPercent = 100;
        }
      }
    }

    return this.getById(userId, taskId);
  }

  public async completeTask(userId: string, taskId: string): Promise<StudyTask | null> {
    return this.update(userId, taskId, { status: 'completed', completionPercent: 100 });
  }

  public async completeStep(userId: string, taskId: string, stepId: string): Promise<StudyTask | null> {
    await this.updateExecutionStep(userId, taskId, stepId, 'completed');
    return this.getById(userId, taskId);
  }

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
        order: s.step_order,
        title: s.title,
        minutes: s.planned_minutes,
        instruction: s.instruction,
        expectedOutput: s.expected_output,
        tips: parseJson(s.tips_json),
        status: s.status,
        startedAt: s.started_at ? s.started_at.toISOString?.() || String(s.started_at) : undefined,
        completedAt: s.completed_at ? s.completed_at.toISOString?.() || String(s.completed_at) : undefined,
      }));

      return {
        taskId: g.task_id,
        objective: g.objective,
        whyItMatters: g.why_it_matters,
        prerequisites: parseJson(g.prerequisites_json),
        materials: parseJson(g.materials_json),
        preparationChecklist: parseJson(g.preparation_checklist_json),
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

  public async saveExecutionGuide(userId: string, taskId: string, guide: ExecutionGuide): Promise<void> {
    if (db.isHealthy()) {
      const guideId = 'guide_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);

      await db.withTransaction(async (conn) => {
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
          const stepId = s.id || 'step_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
          await conn.execute(
            `INSERT INTO execution_steps (
              id, guide_id, step_order, title, planned_minutes, instruction, expected_output, tips_json, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              stepId,
              guideId,
              i + 1,
              s.title,
              s.minutes,
              s.instruction,
              s.expectedOutput,
              JSON.stringify(s.tips || []),
              s.status || 'pending',
            ]
          );
        }
      });
    } else {
      this.demoGuides.set(taskId, guide);
    }
  }

  public async updateExecutionStep(
    userId: string,
    taskId: string,
    stepId: string,
    status: 'pending' | 'in_progress' | 'completed',
    actualMinutes?: number
  ): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute(
        `UPDATE execution_steps s
         JOIN execution_guides g ON s.guide_id = g.id
         JOIN study_tasks t ON g.task_id = t.id
         SET s.status = ?, s.completed_at = CASE WHEN ? = 'completed' THEN NOW(3) ELSE NULL END, s.actual_minutes = ?
         WHERE s.id = ? AND g.task_id = ? AND t.user_id = ?`,
        [status, status, actualMinutes || null, stepId, taskId, userId]
      );
      return res?.affectedRows > 0;
    }

    const guide = this.demoGuides.get(taskId);
    if (guide) {
      const step = guide.steps.find((s) => s.id === stepId);
      if (step) {
        step.status = status;
        if (status === 'completed') {
          step.completedAt = new Date().toISOString();
        }
        return true;
      }
    }
    return false;
  }

  public async addEvidence(userId: string, evidence: TaskEvidence): Promise<TaskEvidence> {
    const id = evidence.id || 'evid_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const created: TaskEvidence = {
      ...evidence,
      id,
      userId,
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

  public seedDemo(userId: string, tasks: StudyTask[], guides: Map<string, ExecutionGuide>) {
    this.demoTasks.set(userId, [...tasks]);
    for (const [k, v] of guides.entries()) {
      this.demoGuides.set(k, v);
    }
  }
}

export const taskRepo = TaskRepository.getInstance();
