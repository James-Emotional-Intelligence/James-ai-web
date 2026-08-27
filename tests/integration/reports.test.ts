import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { authService } from '../../server/services/auth-service';
import { taskRepo } from '../../server/repositories/task-repository';
import { focusRepo } from '../../server/repositories/focus-repository';
import { quizRepo } from '../../server/repositories/quiz-repository';

describe('Study Reports Subsystem Integration Tests', () => {
  const app = createApp();
  let userAId: string;
  let userASession: string;
  let userBId: string;
  let userBSession: string;

  beforeAll(async () => {
    // 1. Register User A (Active Student with data)
    const regA = await authService.registerAtomic({
      email: `user.report.a.${Date.now()}@jami.edu.vn`,
      password: 'Password123!',
      displayName: 'Học sinh Báo Cáo',
      preferredName: 'Châu',
      gradeLevel: 11,
    });
    userAId = regA.user.id;
    userASession = `jami_session=${regA.rawToken}`;

    // 2. Register User B (Brand new Student with 0 data)
    const regB = await authService.registerAtomic({
      email: `user.report.b.${Date.now()}@jami.edu.vn`,
      password: 'Password123!',
      displayName: 'Học sinh Mới',
      preferredName: 'Bảo',
      gradeLevel: 11,
    });
    userBId = regB.user.id;
    userBSession = `jami_session=${regB.rawToken}`;

    // Seed Real Data for User A in current week
    const now = new Date();
    // 2 Tasks: 1 completed (60 mins), 1 pending (45 mins)
    const t1 = await taskRepo.createTask(userAId, {
      title: 'Luyện đề Toán Hàm số',
      subjectId: 'subj-math',
      estimatedMinutes: 60,
      status: 'completed',
      scheduledStartAt: now.toISOString(),
      dueAt: new Date(now.getTime() + 3600000).toISOString(),
    });

    await taskRepo.createTask(userAId, {
      title: 'Đọc bài thơ Tây Tiến',
      subjectId: 'subj-lit',
      estimatedMinutes: 45,
      status: 'pending',
      scheduledStartAt: now.toISOString(),
    });

    // 1 Completed Focus Session: 50 minutes actual
    const session = await focusRepo.createSession(userAId, {
      taskId: t1.id,
      mode: '45_10',
      plannedMinutes: 50,
    });
    await focusRepo.startSession(userAId, session.id);
    await focusRepo.completeSession(userAId, session.id);

    // 1 Quiz Attempt: Score 9.0
    const quiz = await quizRepo.createQuizWithQuestions(
      userAId,
      {
        subjectId: 'subj-math',
        title: 'Trắc nghiệm Toán 11',
      },
      [
        {
          order: 1,
          prompt: 'Câu hỏi 1',
          options: ['A', 'B', 'C', 'D'],
          correctAnswer: 'A',
          explanation: 'Giải thích',
        },
      ]
    );

    const questions = await quizRepo.getQuizQuestions(userAId, quiz.id, true);
    await quizRepo.submitQuizAttempt(userAId, {
      quizId: quiz.id,
      answers: [{ questionId: questions[0]?.id || 'q_1', answer: 'A' }],
    });
  });

  it('1. GET /api/v1/reports/overview computes exact real metrics from MySQL', async () => {
    const res = await request(app)
      .get('/api/v1/reports/overview?period=week')
      .set('Cookie', [userASession]);

    expect(res.status).toBe(200);
    expect(res.body.period).toBeDefined();
    expect(res.body.period.type).toBe('week');
    expect(res.body.summary).toBeDefined();

    // Summary metrics check
    expect(res.body.summary.totalTasks).toBeGreaterThanOrEqual(2);
    expect(res.body.summary.completedTasks).toBeGreaterThanOrEqual(1);
    expect(res.body.summary.actualFocusMinutes).toBeGreaterThanOrEqual(50);
    expect(res.body.summary.totalQuizAttempts).toBeGreaterThanOrEqual(1);
    expect(res.body.summary.averageQuizScore).toBeGreaterThanOrEqual(8.0);
    expect(res.body.hasData).toBe(true);

    // Subject breakdown check
    expect(Array.isArray(res.body.subjectBreakdown)).toBe(true);
    expect(res.body.subjectBreakdown.length).toBeGreaterThan(0);

    // Daily study check
    expect(Array.isArray(res.body.dailyStudy)).toBe(true);
    expect(res.body.dailyStudy.length).toBe(7); // 7 days in a week
  });

  it('2. GET /api/v1/reports/overview returns true zero metrics for new user without mock fallback', async () => {
    const res = await request(app)
      .get('/api/v1/reports/overview?period=week')
      .set('Cookie', [userBSession]);

    expect(res.status).toBe(200);
    expect(res.body.summary.plannedMinutes).toBe(0);
    expect(res.body.summary.actualFocusMinutes).toBe(0);
    expect(res.body.summary.completedTasks).toBe(0);
    expect(res.body.summary.averageQuizScore).toBeNull();
    expect(res.body.hasData).toBe(false);
  });

  it('3. GET /api/v1/reports/export streams valid UTF-8 CSV with security headers', async () => {
    const res = await request(app)
      .get('/api/v1/reports/export?period=week')
      .set('Cookie', [userASession]);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment; filename="jami_report_');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.text).toContain('BÁO CÁO HỌC TẬP JAMI AI');
  });
});
