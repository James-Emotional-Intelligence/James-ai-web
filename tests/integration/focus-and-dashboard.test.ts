import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { authService } from '../../server/services/auth-service';
import { focusRepo } from '../../server/repositories/focus-repository';
import { taskRepo } from '../../server/repositories/task-repository';

describe('Focus Sessions & Today Dashboard Integration Tests', () => {
  const app = createApp();

  let user1Id: string;
  let user1Cookie: string;
  let user2Id: string;
  let user2Cookie: string;

  beforeAll(async () => {
    const reg1 = await authService.registerAtomic({
      email: `focus.test1.${Date.now()}@jami.edu.vn`,
      password: 'Password123!',
      displayName: 'Nguyễn Khánh An',
      preferredName: 'Khánh An',
      gradeLevel: 9,
    });
    user1Id = reg1.user.id;
    user1Cookie = `jami_session=${reg1.rawToken}`;

    const reg2 = await authService.registerAtomic({
      email: `focus.test2.${Date.now()}@jami.edu.vn`,
      password: 'Password123!',
      displayName: 'Lê Gia Bảo',
      preferredName: 'Gia Bảo',
      gradeLevel: 10,
    });
    user2Id = reg2.user.id;
    user2Cookie = `jami_session=${reg2.rawToken}`;
  });

  beforeEach(async () => {
    focusRepo.seedDemo(user1Id, []);
    focusRepo.seedDemo(user2Id, []);
    taskRepo.seedDemo(user1Id, []);
  });

  describe('1. Today Dashboard Aggregation API (/api/v1/dashboard/overview)', () => {
    it('returns honest empty state and zero-division safe percentage when no tasks exist', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/overview')
        .set('Cookie', [user1Cookie]);

      expect(res.status).toBe(200);
      expect(res.body.studentName).toBe('Khánh An');
      expect(res.body.todayStudy.completedPercent).toBe(0);
      expect(res.body.todayStudy.plannedMinutes).toBe(0);
      expect(res.body.todayStudy.actualFocusMinutes).toBe(0);
      expect(res.body.tasks.pendingCount).toBe(0);
    });

    it('accurately computes task count and planned minutes for today', async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      await taskRepo.createTask(user1Id, {
        title: 'Bài tập Đại số lớp 9',
        subjectName: 'Toán học',
        estimatedMinutes: 45,
        priority: 'high',
        status: 'pending',
        scheduledStartAt: `${todayStr}T08:00:00.000Z`,
      });

      const res = await request(app)
        .get('/api/v1/dashboard/overview')
        .set('Cookie', [user1Cookie]);

      expect(res.status).toBe(200);
      expect(res.body.tasks.pendingCount).toBe(1);
      expect(res.body.tasks.priorityTaskTitle).toBe('Bài tập Đại số lớp 9');
      expect(res.body.todayStudy.plannedMinutes).toBe(45);
      expect(res.body.todayStudy.completedMinutes).toBe(0);
      expect(res.body.todayStudy.completedPercent).toBe(0);
    });
  });

  describe('2. Focus Sessions Lifecycle & Multi-Tab Synchronization', () => {
    it('creates and retrieves active focus session', async () => {
      const res = await request(app)
        .post('/api/v1/focus-sessions')
        .set('Cookie', [user1Cookie])
        .send({
          mode: '25_5',
          minutes: 25,
        });

      expect(res.status).toBe(200);
      expect(res.body.session).toBeDefined();
      expect(res.body.session.state).toBe('running');
      expect(res.body.session.plannedMinutes).toBe(25);
      expect(res.body.session.targetEndAt).toBeDefined();

      const currentRes = await request(app)
        .get('/api/v1/focus-sessions/current')
        .set('Cookie', [user1Cookie]);

      expect(currentRes.status).toBe(200);
      expect(currentRes.body.session?.id).toBe(res.body.session.id);
    });

    it('enforces single active session rule when a second session is started', async () => {
      const res1 = await request(app)
        .post('/api/v1/focus-sessions')
        .set('Cookie', [user1Cookie])
        .send({ mode: '25_5', minutes: 25 });

      const res2 = await request(app)
        .post('/api/v1/focus-sessions')
        .set('Cookie', [user1Cookie])
        .send({ mode: '45_10', minutes: 45 });

      expect(res2.status).toBe(200);
      expect(res2.body.session.id).not.toBe(res1.body.session.id);

      const currentRes = await request(app)
        .get('/api/v1/focus-sessions/current')
        .set('Cookie', [user1Cookie]);

      expect(currentRes.body.session?.id).toBe(res2.body.session.id);
    });

    it('handles pause, resume, and complete transitions', async () => {
      const startRes = await request(app)
        .post('/api/v1/focus-sessions')
        .set('Cookie', [user1Cookie])
        .send({ mode: '25_5', minutes: 25 });

      const sessionId = startRes.body.session.id;

      // Pause
      const pauseRes = await request(app)
        .post(`/api/v1/focus-sessions/${sessionId}/pause`)
        .set('Cookie', [user1Cookie]);

      expect(pauseRes.status).toBe(200);
      expect(pauseRes.body.session.state).toBe('paused');
      expect(pauseRes.body.session.pauseCount).toBe(1);

      // Resume
      const resumeRes = await request(app)
        .post(`/api/v1/focus-sessions/${sessionId}/resume`)
        .set('Cookie', [user1Cookie]);

      expect(resumeRes.status).toBe(200);
      expect(resumeRes.body.session.state).toBe('running');

      // Complete
      const completeRes = await request(app)
        .post(`/api/v1/focus-sessions/${sessionId}/complete`)
        .set('Cookie', [user1Cookie])
        .send({ notes: 'Đã hoàn thành bài học' });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.session.state).toBe('completed');
      expect(completeRes.body.session.outcome).toBe('completed_full');
    });

    it('enforces user isolation (User 2 cannot pause or complete User 1 session)', async () => {
      const startRes = await request(app)
        .post('/api/v1/focus-sessions')
        .set('Cookie', [user1Cookie])
        .send({ mode: '25_5', minutes: 25 });

      const sessionId = startRes.body.session.id;

      const pauseAttempt = await request(app)
        .post(`/api/v1/focus-sessions/${sessionId}/pause`)
        .set('Cookie', [user2Cookie]);

      expect(pauseAttempt.status).toBe(400);

      const completeAttempt = await request(app)
        .post(`/api/v1/focus-sessions/${sessionId}/complete`)
        .set('Cookie', [user2Cookie]);

      expect(completeAttempt.status).toBe(400);
    });
  });
});
