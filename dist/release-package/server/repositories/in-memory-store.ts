import {
  User,
  StudentProfile,
  Subject,
  TimetableEntry,
  BusyEvent,
  Exam,
  StudyTask,
  ExecutionGuide,
  FocusSession,
  Quiz,
  QuizAttempt,
  TopicMastery,
  LearningMaterial,
  NotificationItem,
  JamiMemorySummary,
  ScheduleProposal,
} from '../../shared/types';
import {
  DEMO_USER,
  DEMO_PROFILE,
  DEMO_SUBJECTS,
  DEMO_TIMETABLE_ENTRIES,
  DEMO_BUSY_EVENTS,
  DEMO_EXAM,
  DEMO_TASKS,
  DEMO_QUIZ,
  DEMO_NOTIFICATIONS,
  DEMO_TOPIC_MASTERY,
  DEMO_MATERIALS,
  DEMO_JAMI_MEMORIES,
} from '../db/demo-data';
import { db } from '../db/mysql';

export class InMemoryStore {
  private static instance: InMemoryStore;

  public user: User = { ...DEMO_USER };
  public profile: StudentProfile = { ...DEMO_PROFILE };
  public subjects: Subject[] = [...DEMO_SUBJECTS];
  public timetableEntries: TimetableEntry[] = [...DEMO_TIMETABLE_ENTRIES];
  public busyEvents: BusyEvent[] = [...DEMO_BUSY_EVENTS];
  public exams: Exam[] = [{ ...DEMO_EXAM }];
  public tasks: StudyTask[] = JSON.parse(JSON.stringify(DEMO_TASKS));
  public quizzes: Quiz[] = [JSON.parse(JSON.stringify(DEMO_QUIZ))];
  public quizAttempts: QuizAttempt[] = [];
  public notifications: NotificationItem[] = [...DEMO_NOTIFICATIONS];
  public topicMasteries: TopicMastery[] = [...DEMO_TOPIC_MASTERY];
  public materials: LearningMaterial[] = [...DEMO_MATERIALS];
  public jamiMemories: JamiMemorySummary[] = [...DEMO_JAMI_MEMORIES];
  public proposals: ScheduleProposal[] = [];
  public currentFocusSession: FocusSession | null = null;
  public jamiPreferences = {
    voiceEnabled: true,
    animationEnabled: true,
    reducedMotion: false,
    memoryEnabled: true,
    responseLength: 'balanced',
  };

  public static getInstance(): InMemoryStore {
    if (!InMemoryStore.instance) {
      InMemoryStore.instance = new InMemoryStore();
    }
    return InMemoryStore.instance;
  }

  public async syncWithMySQL() {
    if (!db.isHealthy()) return;

    try {
      // 1. Seed demo subjects if none exist in MySQL
      const dbSubjects = await db.query<any>('SELECT * FROM subjects WHERE user_id = ?', [this.user.id]);
      if (dbSubjects.length === 0) {
        for (const s of DEMO_SUBJECTS) {
          await db.execute(
            `INSERT INTO subjects (id, user_id, name, color, icon, sort_order)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE name=VALUES(name)`,
            [s.id, s.userId, s.name, s.color, s.icon, s.sortOrder]
          );
        }
      }

      // 2. Seed demo timetable if none exist
      const dbTimetables = await db.query<any>('SELECT * FROM school_timetable_entries WHERE user_id = ?', [this.user.id]);
      if (dbTimetables.length === 0) {
        for (const t of DEMO_TIMETABLE_ENTRIES) {
          await db.execute(
            `INSERT INTO school_timetable_entries (id, user_id, subject_id, title, day_of_week, start_local_time, end_local_time, location, commute_before_minutes, commute_after_minutes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE title=VALUES(title)`,
            [t.id, this.user.id, t.subjectId || null, t.title, t.dayOfWeek, t.startLocalTime, t.endLocalTime, t.location || null, t.commuteBeforeMinutes || 15, t.commuteAfterMinutes || 15]
          );
        }
      }

      // 3. Seed demo busy events
      const dbBusy = await db.query<any>('SELECT * FROM busy_events WHERE user_id = ?', [this.user.id]);
      if (dbBusy.length === 0) {
        for (const b of DEMO_BUSY_EVENTS) {
          await db.execute(
            `INSERT INTO busy_events (id, user_id, type, title, starts_at, ends_at, recurrence_rule, timezone, is_fixed, source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE title=VALUES(title)`,
            [b.id, b.userId, b.type, b.title, b.startsAt, b.endsAt, b.recurrenceRule || null, b.timezone || 'Asia/Ho_Chi_Minh', b.isFixed ? 1 : 0, 'user']
          );
        }
      }

      // 4. Seed demo exams
      const dbExams = await db.query<any>('SELECT * FROM exams WHERE user_id = ?', [this.user.id]);
      if (dbExams.length === 0) {
        await db.execute(
          `INSERT INTO exams (id, user_id, subject_id, title, exam_at, importance, scope_text, topics_json, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE title=VALUES(title)`,
          [
            DEMO_EXAM.id,
            DEMO_EXAM.userId,
            DEMO_EXAM.subjectId,
            DEMO_EXAM.title,
            DEMO_EXAM.examAt,
            DEMO_EXAM.importance,
            DEMO_EXAM.scopeText,
            JSON.stringify(DEMO_EXAM.topics),
            DEMO_EXAM.status,
          ]
        );
      }

      // 5. Seed tasks
      const dbTasks = await db.query<any>('SELECT * FROM study_tasks WHERE user_id = ?', [this.user.id]);
      if (dbTasks.length === 0) {
        for (const t of DEMO_TASKS) {
          await db.execute(
            `INSERT INTO study_tasks (id, user_id, subject_id, exam_id, title, objective, status, priority, difficulty, due_at, estimated_minutes, minimum_session_minutes, maximum_session_minutes, splittable, locked, scheduled_start_at, scheduled_end_at, completion_percent, source, execution_guide_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE title=VALUES(title)`,
            [
              t.id,
              t.userId,
              t.subjectId,
              t.examId || null,
              t.title,
              t.objective || null,
              t.status,
              t.priority,
              t.difficulty,
              t.dueAt || null,
              t.estimatedMinutes,
              t.minimumSessionMinutes || 20,
              t.maximumSessionMinutes || 60,
              t.splittable ? 1 : 0,
              t.locked ? 1 : 0,
              t.scheduledStartAt || null,
              t.scheduledEndAt || null,
              t.completionPercent,
              'planner',
              t.executionGuide ? JSON.stringify(t.executionGuide) : null,
            ]
          );
        }
      }

      // 6. Seed Quiz
      const dbQuizzes = await db.query<any>('SELECT * FROM quizzes WHERE user_id = ?', [this.user.id]);
      if (dbQuizzes.length === 0) {
        await db.execute(
          `INSERT INTO quizzes (id, user_id, exam_id, subject_id, title, type, milestone, difficulty, status, questions_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE title=VALUES(title)`,
          [
            DEMO_QUIZ.id,
            this.user.id,
            DEMO_QUIZ.examId || null,
            DEMO_QUIZ.subjectId,
            DEMO_QUIZ.title,
            DEMO_QUIZ.type,
            DEMO_QUIZ.milestone || null,
            DEMO_QUIZ.difficulty,
            'ready',
            JSON.stringify(DEMO_QUIZ.questions),
          ]
        );
      }

      console.log('[JAMI MySQL] In-memory store successfully synchronized with MySQL!');
    } catch (err: any) {
      console.warn('[JAMI MySQL] Store sync warning:', err.message);
    }
  }

  // --- Task Methods ---
  public getTask(id: string): StudyTask | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  public updateTask(id: string, updates: Partial<StudyTask>): StudyTask | null {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    this.tasks[idx] = { ...this.tasks[idx], ...updates };
    const task = this.tasks[idx];

    // Async sync to MySQL
    if (db.isHealthy()) {
      db.execute(
        `UPDATE study_tasks
         SET status = ?, completion_percent = ?, scheduled_start_at = ?, scheduled_end_at = ?, execution_guide_json = ?
         WHERE id = ?`,
        [
          task.status,
          task.completionPercent,
          task.scheduledStartAt || null,
          task.scheduledEndAt || null,
          task.executionGuide ? JSON.stringify(task.executionGuide) : null,
          task.id,
        ]
      ).catch((err) => console.warn('[JAMI MySQL] Failed to update task in MySQL:', err.message));
    }

    return task;
  }

  public completeTaskStep(taskId: string, stepId: string): StudyTask | null {
    const task = this.getTask(taskId);
    if (!task || !task.executionGuide) return null;

    const step = task.executionGuide.steps.find((s) => s.id === stepId);
    if (step) {
      step.status = 'completed';
      step.actualMinutes = step.plannedMinutes;
    }

    const totalSteps = task.executionGuide.steps.length;
    const completedSteps = task.executionGuide.steps.filter((s) => s.status === 'completed').length;
    task.completionPercent = Math.round((completedSteps / totalSteps) * 100);

    if (task.completionPercent === 100) {
      task.status = 'completed';
    } else {
      task.status = 'in_progress';
    }

    // Sync updated task to MySQL
    this.updateTask(task.id, {
      completionPercent: task.completionPercent,
      status: task.status,
      executionGuide: task.executionGuide,
    });

    return task;
  }

  // --- Focus Session Methods ---
  public startFocusSession(taskId?: string, mode: FocusSession['mode'] = '25_5', minutes = 25): FocusSession {
    const now = new Date();
    const session: FocusSession = {
      id: 'focus-' + Math.random().toString(36).substring(2, 9),
      userId: this.user.id,
      taskId,
      mode,
      plannedMinutes: minutes,
      state: 'running',
      startedAt: now.toISOString(),
      accumulatedPauseSeconds: 0,
      targetEndAt: new Date(now.getTime() + minutes * 60 * 1000).toISOString(),
    };
    this.currentFocusSession = session;

    if (db.isHealthy()) {
      db.execute(
        `INSERT INTO focus_sessions (id, user_id, task_id, mode, planned_minutes, state, started_at, accumulated_pause_seconds)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [session.id, session.userId, session.taskId || null, session.mode, session.plannedMinutes, session.state, session.startedAt, 0]
      ).catch((err) => console.warn('[JAMI MySQL] Failed to record focus session:', err.message));
    }

    return session;
  }

  public updateFocusState(action: 'pause' | 'resume' | 'complete' | 'abandon', notes?: string): FocusSession | null {
    if (!this.currentFocusSession) return null;
    const now = new Date();

    if (action === 'pause') {
      this.currentFocusSession.state = 'paused';
      this.currentFocusSession.pausedAt = now.toISOString();
    } else if (action === 'resume') {
      if (this.currentFocusSession.pausedAt) {
        const pauseDurationSec = Math.floor((now.getTime() - new Date(this.currentFocusSession.pausedAt).getTime()) / 1000);
        this.currentFocusSession.accumulatedPauseSeconds += pauseDurationSec;
        this.currentFocusSession.pausedAt = undefined;
      }
      this.currentFocusSession.state = 'running';
    } else if (action === 'complete') {
      this.currentFocusSession.state = 'completed';
      this.currentFocusSession.endedAt = now.toISOString();
      this.currentFocusSession.notes = notes;
    } else if (action === 'abandon') {
      this.currentFocusSession.state = 'abandoned';
      this.currentFocusSession.endedAt = now.toISOString();
      this.currentFocusSession.notes = notes;
    }

    if (db.isHealthy() && this.currentFocusSession) {
      db.execute(
        `UPDATE focus_sessions
         SET state = ?, paused_at = ?, ended_at = ?, accumulated_pause_seconds = ?, notes = ?
         WHERE id = ?`,
        [
          this.currentFocusSession.state,
          this.currentFocusSession.pausedAt || null,
          this.currentFocusSession.endedAt || null,
          this.currentFocusSession.accumulatedPauseSeconds,
          this.currentFocusSession.notes || null,
          this.currentFocusSession.id,
        ]
      ).catch((err) => console.warn('[JAMI MySQL] Failed to update focus session in MySQL:', err.message));
    }

    return this.currentFocusSession;
  }

  // --- Quiz Submission & Grading ---
  public submitQuizAttempt(
    quizId: string,
    answers: { questionId: string; answer: string }[]
  ): { attempt: QuizAttempt; answersFeedback: any[] } {
    const quiz = this.quizzes.find((q) => q.id === quizId);
    if (!quiz) throw new Error('Quiz not found');

    let correctCount = 0;
    const scoredAnswers = answers.map((ans) => {
      const q = quiz.questions.find((quest) => quest.id === ans.questionId);
      const isCorrect = q ? q.correctAnswer?.trim().toLowerCase() === ans.answer.trim().toLowerCase() : false;
      if (isCorrect) correctCount++;
      return {
        questionId: ans.questionId,
        answer: ans.answer,
        isCorrect,
        correctAnswer: q?.correctAnswer,
        explanation: q?.explanation,
        feedback: isCorrect ? 'Chính xác! Em làm rất tốt.' : `Chưa chính xác. Đáp án đúng là: ${q?.correctAnswer}`,
      };
    });

    const score = Number(((correctCount / quiz.questions.length) * 10).toFixed(1));
    const attempt: QuizAttempt = {
      id: 'att-' + Math.random().toString(36).substring(2, 9),
      quizId,
      userId: this.user.id,
      startedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      submittedAt: new Date().toISOString(),
      score,
      maxScore: 10,
      status: 'submitted',
      feedbackSummary:
        score >= 8
          ? 'Xuất sắc! Em đã nắm rất vững kiến thức phần này.'
          : score >= 5
          ? 'Khá tốt! Em hãy xem lại các câu giải thích để củng cố điểm yếu nhé.'
          : 'Cần cố gắng thêm. Jami khuyên em nên đọc lại lý thuyết tóm tắt và làm lại đề nhé.',
      answers: scoredAnswers,
    };

    this.quizAttempts.push(attempt);

    // Save to MySQL
    if (db.isHealthy()) {
      db.execute(
        `INSERT INTO quiz_attempts (id, quiz_id, user_id, started_at, submitted_at, score, max_score, status, feedback_summary, answers_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          attempt.id,
          attempt.quizId,
          attempt.userId,
          attempt.startedAt,
          attempt.submittedAt,
          attempt.score,
          attempt.maxScore,
          attempt.status,
          attempt.feedbackSummary,
          JSON.stringify(attempt.answers),
        ]
      ).catch((err) => console.warn('[JAMI MySQL] Failed to record quiz attempt in MySQL:', err.message));
    }

    // Update topic mastery
    const topic = this.topicMasteries.find((t) => t.subjectId === quiz.subjectId);
    if (topic) {
      topic.masteryScore = Math.min(100, Math.round(topic.masteryScore * 0.7 + (score * 10) * 0.3));
      topic.evidenceCount += 1;
      topic.lastPracticedAt = new Date().toISOString();

      if (db.isHealthy()) {
        db.execute(
          `INSERT INTO topic_mastery (id, user_id, subject_id, topic_key, topic_name, mastery_score, confidence, evidence_count, last_practiced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             mastery_score = VALUES(mastery_score),
             evidence_count = VALUES(evidence_count),
             last_practiced_at = VALUES(last_practiced_at)`,
          [
            topic.id,
            this.user.id,
            topic.subjectId,
            topic.topicKey,
            topic.topicKey,
            topic.masteryScore,
            topic.confidence,
            topic.evidenceCount,
            topic.lastPracticedAt,
          ]
        ).catch((err) => console.warn('[JAMI MySQL] Failed to update topic mastery in MySQL:', err.message));
      }
    }

    return { attempt, answersFeedback: scoredAnswers };
  }

  // --- Proposal Confirmation ---
  public confirmProposal(proposalId: string): boolean {
    const proposal = this.proposals.find((p) => p.id === proposalId);
    if (!proposal) return false;

    for (const item of proposal.tasksToSchedule) {
      const task = this.getTask(item.taskId);
      if (task) {
        task.scheduledStartAt = item.proposedStart;
        task.scheduledEndAt = item.proposedEnd;
        this.updateTask(task.id, {
          scheduledStartAt: item.proposedStart,
          scheduledEndAt: item.proposedEnd,
        });
      }
    }
    return true;
  }
}
