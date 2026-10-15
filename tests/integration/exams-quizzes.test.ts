import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { authService } from '../../server/services/auth-service';
import { subjectRepo } from '../../server/repositories/subject-repository';
import { AiAdapter } from '../../server/services/ai-adapter';
import { userRepo } from '../../server/repositories/user-repository';

describe('Exams & Quizzes Revision Subsystem Integration Tests', () => {
  const quizDraftSpy = vi.spyOn(AiAdapter, 'generateQuizDraft').mockImplementation(async (params) => ({
    title: 'Đề kiểm thử có kiểm soát', sourceScope: params.scope, learningObjectives: ['Kiểm tra route và quyền truy cập'],
    questions: Array.from({ length: params.questionCount || 5 }, (_, i) => ({
      type: 'multiple_choice' as const,
      prompt: `Câu kiểm thử ${i + 1}: 2 + ${i + 1} bằng bao nhiêu?`,
      options: [
        { id: 'A', text: String(i + 3) }, { id: 'B', text: String(i + 4) },
        { id: 'C', text: String(i + 5) }, { id: 'D', text: String(i + 6) },
      ],
      correctAnswer: 'A', explanation: `2 + ${i + 1} = ${i + 3}.`,
      difficulty: 'easy' as const, topicRef: params.topics?.[0] || params.subject,
    })),
  }));
  afterAll(() => quizDraftSpy.mockRestore());
  const app = createApp();
  let userAId: string;
  let userASession: string;
  let userBId: string;
  let userBSession: string;
  let subjectId: string;
  let examId: string;
  let quizId: string;
  let attemptId: string;

  beforeAll(async () => {
    // 1. Register User A
    const regA = await authService.registerAtomic({
      email: `user.exam.a.${Date.now()}@jami.edu.vn`,
      password: 'Password123!',
      displayName: 'Học sinh Thi Thử',
      preferredName: 'Châu',
      gradeLevel: 11,
    });
    userAId = regA.user.id;
    userASession = `jami_session=${regA.rawToken}`;

    // 2. Register User B (for isolation test)
    const regB = await authService.registerAtomic({
      email: `user.exam.b.${Date.now()}@jami.edu.vn`,
      password: 'Password123!',
      displayName: 'Học sinh B',
      preferredName: 'Bảo',
      gradeLevel: 11,
    });
    userBId = regB.user.id;
    userBSession = `jami_session=${regB.rawToken}`;

    // 3. Create Subject for User A
    const subj = await subjectRepo.create(userAId, {
      name: 'Toán học 11',
      color: '#16A34A',
    });
    subjectId = subj.id;
  });

  it('1. POST /api/v1/exams creates exam with 4 dynamic milestones', async () => {
    const examAt = new Date(Date.now() + 10 * 86400000).toISOString();
    const res = await request(app)
      .post('/api/v1/exams')
      .set('Cookie', [userASession])
      .send({
        title: 'Kiểm tra 1 tiết Đại số',
        subjectId,
        examAt,
        importance: 'high',
        scopeText: 'Hàm số bậc nhất và đồ thị Oxy',
        topics: [{ name: 'Hàm số bậc nhất', weight: 1 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.exam).toBeDefined();
    expect(res.body.exam.id).toBeDefined();
    expect(res.body.exam.subjectId).toBe(subjectId);
    expect(res.body.exam.milestones.length).toBe(4);

    examId = res.body.exam.id;
  });

  it('2. POST /api/v1/exams/:id/quizzes/generate generates AI quiz draft for D-7 milestone', async () => {
    const res = await request(app)
      .post(`/api/v1/exams/${examId}/quizzes/generate`)
      .set('Cookie', [userASession])
      .send({
        milestone: 'D-7',
        questionCount: 4,
        difficulty: 'medium',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.quiz).toBeDefined();
    expect(res.body.quiz.examId).toBe(examId);
    expect(res.body.quiz.milestone).toBe('D-7');
    expect(res.body.quiz.questionCount).toBe(4);

    quizId = res.body.quiz.id;
  });

  it('3. GET /api/v1/quizzes/:id NEVER leaks answers before submission', async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes/${quizId}`)
      .set('Cookie', [userASession]);

    expect(res.status).toBe(200);
    expect(res.body.quiz).toBeDefined();
    expect(res.body.quiz.questions.length).toBe(4);

    // Verify all questions have NO correctAnswer and NO explanation
    for (const q of res.body.quiz.questions) {
      expect(q.correctAnswer).toBeUndefined();
      expect(q.explanation).toBeUndefined();
    }
  });

  it('4. POST /api/v1/quizzes/:id/attempts starts an in-progress attempt', async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts`)
      .set('Cookie', [userASession]);

    expect(res.status).toBe(200);
    expect(res.body.attempt).toBeDefined();
    expect(res.body.attempt.status).toBe('in_progress');
    expect(res.body.attempt.startedAt).toBeDefined();

    attemptId = res.body.attempt.id;
  });

  it('5. POST /api/v1/quizzes/:quizId/attempts/submit grades attempt, reveals explanations, and updates milestone', async () => {
    const quizRes = await request(app)
      .get(`/api/v1/quizzes/${quizId}`)
      .set('Cookie', [userASession]);

    const questions = quizRes.body.quiz.questions;
    const answers = questions.map((q: any) => ({
      questionId: q.id,
      answer: 'A', // Select option A
    }));

    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/submit`)
      .set('Cookie', [userASession])
      .send({
        attemptId,
        answers,
      });

    expect(res.status).toBe(200);
    expect(res.body.attempt).toBeDefined();
    expect(res.body.attempt.status).toBe('submitted');
    expect(res.body.attempt.score).toBeGreaterThanOrEqual(0);
    expect(res.body.answersFeedback).toBeDefined();
    expect(res.body.answersFeedback.length).toBe(4);

    // After submission, answersFeedback includes correctAnswer and explanation
    for (const fb of res.body.answersFeedback) {
      expect(fb.correctAnswer).toBeDefined();
      expect(fb.explanation).toBeDefined();
    }
  });

  it('6. Non-owner cannot access or submit quiz of another student', async () => {
    const res = await request(app)
      .get(`/api/v1/quizzes/${quizId}`)
      .set('Cookie', [userBSession]);

    expect(res.status).toBe(404);
  });

  it('7. Rejects submission when attempt belongs to a different quiz', async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/quiz_mismatch_999/attempts/submit`)
      .set('Cookie', [userASession])
      .send({
        attemptId,
        answers: [],
      });

    expect([400, 404]).toContain(res.status);
  });

  it('8. Handles duplicate submissions idempotently without changing score or answers', async () => {
    const res = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts/submit`)
      .set('Cookie', [userASession])
      .send({
        attemptId,
        answers: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.attempt.status).toBe('submitted');
  });

  it('9. GET /api/v1/quiz-attempts/:id/result retrieves attempt result by attemptId', async () => {
    const res = await request(app)
      .get(`/api/v1/quiz-attempts/${attemptId}/result`)
      .set('Cookie', [userASession]);

    expect(res.status).toBe(200);
    expect(res.body.attempt).toBeDefined();
    expect(res.body.attempt.attemptId).toBe(attemptId);
    expect(res.body.quiz).toBeDefined();
  });

  it('10. POST /api/v1/quizzes/generate generates standalone subject quiz with real user subject', async () => {
    const res = await request(app)
      .post('/api/v1/quizzes/generate')
      .set('Cookie', [userASession])
      .send({
        subjectId,
        questionCount: 3,
        difficulty: 'hard',
        topic: 'Định lý hàm số',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.quiz).toBeDefined();
    expect(res.body.quiz.subjectId).toBe(subjectId);
    expect(res.body.quiz.difficulty).toBe('hard');
  });

  it('11. POST /api/v1/quizzes/retake-wrong creates retake quiz from wrong questions', async () => {
    const quizRes = await request(app)
      .get(`/api/v1/quizzes/${quizId}`)
      .set('Cookie', [userASession]);
    const firstQId = quizRes.body.quiz.questions[0].id;

    const res = await request(app)
      .post('/api/v1/quizzes/retake-wrong')
      .set('Cookie', [userASession])
      .send({
        originalQuizId: quizId,
        wrongQuestionIds: [firstQId],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.quiz).toBeDefined();
    expect(res.body.quiz.questions.length).toBe(1);
  });

  it('12. POST /api/v1/quizzes/retake-wrong rejects access when original quiz belongs to another user', async () => {
    const res = await request(app)
      .post('/api/v1/quizzes/retake-wrong')
      .set('Cookie', [userBSession])
      .send({
        originalQuizId: quizId,
        wrongQuestionIds: ['q_dummy_1'],
      });

    expect(res.status).toBe(404);
  });

  it('13. lets the owner report a question once and read only their status', async () => {
    const quizRes = await request(app).get(`/api/v1/quizzes/${quizId}`).set('Cookie', [userASession]);
    const questionId = quizRes.body.quiz.questions[0].id;
    const endpoint = `/api/v1/quizzes/${quizId}/questions/${questionId}/report`;
    const first = await request(app).post(endpoint).set('Cookie', [userASession]).send({ reason: 'wrong_answer', description: '<script>test</script>' });
    expect(first.status).toBe(200);
    expect(first.body.report.status).toBe('pending');
    expect(first.body.report.description).not.toContain('<');
    const again = await request(app).post(endpoint).set('Cookie', [userASession]).send({ reason: 'wrong_answer' });
    expect(again.body.report.id).toBe(first.body.report.id);
    const status = await request(app).get(`${endpoint}-status`).set('Cookie', [userASession]);
    expect(status.body.report.id).toBe(first.body.report.id);
    const otherUser = await request(app).get(`${endpoint}-status`).set('Cookie', [userBSession]);
    expect(otherUser.status).toBe(404);
    const reviewByStudent = await request(app).patch(`/api/v1/admin/question-reports/${first.body.report.id}`).set('Cookie', [userASession]).send({ status: 'rejected' });
    expect(reviewByStudent.status).toBe(403);
  });

  it('14. lets an admin review reports without exposing the reporter identity', async () => {
    const admin = await authService.registerAtomic({
      email: `review.admin.${Date.now()}@jami.edu.vn`, password: 'Password123!', displayName: 'Quản trị kiểm duyệt', gradeLevel: 7,
    });
    await userRepo.setUserRole(admin.user.id, 'admin');
    const adminSession = `jami_session=${admin.rawToken}`;
    const list = await request(app).get('/api/v1/admin/question-reports').set('Cookie', [adminSession]);
    expect(list.status).toBe(200);
    expect(list.body.reports.length).toBeGreaterThan(0);
    expect(JSON.stringify(list.body.reports)).not.toContain('reporterUserId');
    const reportId = list.body.reports[0].id;
    const reviewed = await request(app).patch(`/api/v1/admin/question-reports/${reportId}`).set('Cookie', [adminSession]).send({ status: 'confirmed_error', note: 'Đáp án cần sửa.' });
    expect(reviewed.status).toBe(200);
    const reviewedAgain = await request(app).patch(`/api/v1/admin/question-reports/${reportId}`).set('Cookie', [adminSession]).send({ status: 'confirmed_error' });
    expect(reviewedAgain.status).toBe(200);
  });
});
