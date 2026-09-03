import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { authService } from '../../server/services/auth-service';
import { subjectRepo } from '../../server/repositories/subject-repository';
import { examRepo } from '../../server/repositories/exam-repository';

describe('Exam Study Plan & Mistake Notebook Integration Tests', () => {
  const app = createApp();
  let testUserId: string;
  let sessionCookie: string;
  let subjectId: string;
  let examId: string;
  let createdPlanId: string;
  let firstPlanItemId: string;
  let createdMistakeId: string;

  beforeAll(async () => {
    const email = `test.studyplan.${Date.now()}@jami.edu.vn`;
    const reg = await authService.registerAtomic({
      email,
      password: 'Password123!',
      displayName: 'Test Exam Planner Student',
      preferredName: 'Tuấn',
      gradeLevel: 9,
    });
    testUserId = reg.user.id;
    sessionCookie = `jami_session=${reg.rawToken}`;

    const subjects = await subjectRepo.getByUserId(testUserId);
    subjectId = subjects[0]?.id || 'subj_test';

    const examAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const exam = await examRepo.create(testUserId, {
      title: 'Kiểm tra 1 tiết Đại số chương 2',
      subjectId,
      examAt,
      importance: 'high',
      scopeText: 'Hàm số bậc nhất và đồ thị',
      topics: [{ name: 'Hàm số bậc nhất', weight: 2 }],
    });
    examId = exam.id;
  });

  describe('Mistake Notebook Endpoints (/api/v1/mistakes)', () => {
    it('1. POST /api/v1/mistakes creates a manual mistake entry', async () => {
      const res = await request(app)
        .post('/api/v1/mistakes')
        .set('Cookie', [sessionCookie])
        .send({
          subjectId,
          topic: 'Hàm số bậc nhất',
          questionText: 'Cho hàm số y = 2x - 1. Hệ số góc a bằng bao nhiêu?',
          selectedAnswer: 'A. -1',
          correctAnswer: 'B. 2',
          mistakeReason: 'misread_question',
          correctExplanation: 'Hệ số góc là a trong công thức y = ax + b, do đó a = 2.',
          difficulty: 'easy',
          sourceType: 'manual',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.mistake).toBeDefined();
      expect(res.body.mistake.topic).toBe('Hàm số bậc nhất');
      expect(res.body.mistake.status).toBe('new');

      createdMistakeId = res.body.mistake.id;
    });

    it('2. GET /api/v1/mistakes retrieves list of mistakes with filters', async () => {
      const res = await request(app)
        .get('/api/v1/mistakes')
        .set('Cookie', [sessionCookie])
        .query({ subjectId });

      expect(res.status).toBe(200);
      expect(res.body.mistakes).toBeDefined();
      expect(res.body.mistakes.length).toBeGreaterThan(0);
    });

    it('3. POST /api/v1/mistakes/:id/review evaluates user answer and updates spaced repetition', async () => {
      const res = await request(app)
        .post(`/api/v1/mistakes/${createdMistakeId}/review`)
        .set('Cookie', [sessionCookie])
        .send({ answer: 'B. 2' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isCorrect).toBe(true);
      expect(res.body.entry.correctStreak).toBe(1);
      expect(res.body.entry.status).toBe('reviewing');
    });

    it('4. POST /api/v1/mistakes/:id/similar generates a similar practice question', async () => {
      const res = await request(app)
        .post(`/api/v1/mistakes/${createdMistakeId}/similar`)
        .set('Cookie', [sessionCookie]);

      expect(res.status).toBe(200);
      expect(res.body.similarQuestion).toBeDefined();
      expect(res.body.similarQuestion.questionText).toBeDefined();
      expect(res.body.similarQuestion.correctAnswer).toBeDefined();
    });

    it('5. POST /api/v1/mistakes/:id/explain returns pedagogical explanation and tips', async () => {
      const res = await request(app)
        .post(`/api/v1/mistakes/${createdMistakeId}/explain`)
        .set('Cookie', [sessionCookie]);

      expect(res.status).toBe(200);
      expect(res.body.explanation).toBeDefined();
      expect(res.body.tips).toBeDefined();
    });
  });

  describe('Exam Study Planner Endpoints (/api/v1/exams/:id/study-plan)', () => {
    it('6. POST /api/v1/exams/:id/study-plan/generate creates an adaptive draft study plan', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/${examId}/study-plan/generate`)
        .set('Cookie', [sessionCookie])
        .send({
          dailyMinutes: 45,
        });

      expect(res.status).toBe(201);
      expect(res.body.plan).toBeDefined();
      expect(res.body.plan.examId).toBe(examId);
      expect(res.body.plan.status).toBe('draft');
      expect(res.body.plan.items.length).toBeGreaterThan(0);

      createdPlanId = res.body.plan.id;
      firstPlanItemId = res.body.plan.items[0].id;
    });

    it('7. GET /api/v1/exams/:id/study-plan retrieves the active study plan', async () => {
      const res = await request(app)
        .get(`/api/v1/exams/${examId}/study-plan`)
        .set('Cookie', [sessionCookie]);

      expect(res.status).toBe(200);
      expect(res.body.plan).toBeDefined();
      expect(res.body.plan.id).toBe(createdPlanId);
    });

    it('8. PATCH /api/v1/exams/study-plans/:planId/items/:itemId updates item details', async () => {
      const res = await request(app)
        .patch(`/api/v1/exams/study-plans/${createdPlanId}/items/${firstPlanItemId}`)
        .set('Cookie', [sessionCookie])
        .send({
          title: 'Tổng ôn trọng tâm lý thuyết & đồ thị',
          plannedMinutes: 50,
        });

      expect(res.status).toBe(200);
      expect(res.body.item.title).toBe('Tổng ôn trọng tâm lý thuyết & đồ thị');
      expect(res.body.item.plannedMinutes).toBe(50);
    });

    it('9. POST /api/v1/exams/study-plans/:planId/accept accepts the study plan', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/study-plans/${createdPlanId}/accept`)
        .set('Cookie', [sessionCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.plan.status).toBe('accepted');
      expect(res.body.plan.acceptedAt).toBeDefined();
    });

    it('10. POST /api/v1/exams/study-plans/:planId/items/:itemId/complete completes a session', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/study-plans/${createdPlanId}/items/${firstPlanItemId}/complete`)
        .set('Cookie', [sessionCookie]);

      expect(res.status).toBe(200);
      expect(res.body.item.status).toBe('completed');
    });

    it('11. POST /api/v1/exams/study-plans/:planId/replan-confirm handles replan actions and snapshots version', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/study-plans/${createdPlanId}/replan-confirm`)
        .set('Cookie', [sessionCookie])
        .send({ action: 'accept' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.plan.currentVersion).toBeGreaterThan(1);
    });

    it('12. POST /api/v1/exams/study-plans/:planId/undo restores previous plan version', async () => {
      const res = await request(app)
        .post(`/api/v1/exams/study-plans/${createdPlanId}/undo`)
        .set('Cookie', [sessionCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
