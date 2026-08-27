import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { authService } from '../../server/services/auth-service';
import { taskRepo } from '../../server/repositories/task-repository';

describe('Task Execution, Checklist & Evidence Integration Tests', () => {
  const app = createApp();

  let user1Id: string;
  let user1Cookie: string;
  let user2Id: string;
  let user2Cookie: string;

  beforeAll(async () => {
    const reg1 = await authService.registerAtomic({
      email: `task.test1.${Date.now()}@jami.edu.vn`,
      password: 'Password123!',
      displayName: 'Nguyễn Văn Nam',
      preferredName: 'Nam',
      gradeLevel: 11,
    });
    user1Id = reg1.user.id;
    user1Cookie = `jami_session=${reg1.rawToken}`;

    const reg2 = await authService.registerAtomic({
      email: `task.test2.${Date.now()}@jami.edu.vn`,
      password: 'Password123!',
      displayName: 'Trần Thị Mai',
      preferredName: 'Mai',
      gradeLevel: 10,
    });
    user2Id = reg2.user.id;
    user2Cookie = `jami_session=${reg2.rawToken}`;
  });

  beforeEach(async () => {
    taskRepo.seedDemo(user1Id, []);
    taskRepo.seedDemo(user2Id, []);
  });

  describe('1. Task CRUD & Ownership Isolation', () => {
    it('creates, reads, updates, and deletes a task', async () => {
      // 1. Create
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Cookie', [user1Cookie])
        .send({
          title: 'Bài tập Sóng ánh sáng',
          subjectId: 'subj-phys',
          estimatedMinutes: 45,
          priority: 'high',
          difficulty: 'hard',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.task).toBeDefined();
      const taskId = createRes.body.task.id;

      // 2. Read single
      const getRes = await request(app)
        .get(`/api/v1/tasks/${taskId}`)
        .set('Cookie', [user1Cookie]);

      expect(getRes.status).toBe(200);
      expect(getRes.body.task.title).toBe('Bài tập Sóng ánh sáng');

      // 3. User 2 cannot access User 1 task (returns 404)
      const user2Access = await request(app)
        .get(`/api/v1/tasks/${taskId}`)
        .set('Cookie', [user2Cookie]);

      expect(user2Access.status).toBe(404);

      // 4. Update
      const patchRes = await request(app)
        .patch(`/api/v1/tasks/${taskId}`)
        .set('Cookie', [user1Cookie])
        .send({ priority: 'medium' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.task.priority).toBe('medium');

      // 5. Delete
      const delRes = await request(app)
        .delete(`/api/v1/tasks/${taskId}`)
        .set('Cookie', [user1Cookie]);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);
    });
  });

  describe('2. Execution Guide, Checklist & Step Progression', () => {
    it('generates execution guide, updates checklist items, and completes steps', async () => {
      // Create task
      const createRes = await request(app)
        .post('/api/v1/tasks')
        .set('Cookie', [user1Cookie])
        .send({
          title: 'Giải đề thi thử Toán học THPT',
          subjectId: 'subj-math',
          estimatedMinutes: 60,
          priority: 'high',
        });

      const taskId = createRes.body.task.id;

      // Generate guide
      const guideRes = await request(app)
        .post(`/api/v1/tasks/${taskId}/execution-guide/generate`)
        .set('Cookie', [user1Cookie]);

      expect(guideRes.status).toBe(200);
      expect(guideRes.body.guide).toBeDefined();
      expect(guideRes.body.guide.steps.length).toBeGreaterThanOrEqual(3);

      const guide = guideRes.body.guide;
      const firstChecklistItem = guide.preparationChecklist[0];
      const firstStep = guide.steps[0];

      // Update checklist item
      if (firstChecklistItem) {
        const chkRes = await request(app)
          .patch(`/api/v1/tasks/${taskId}/checklist/${firstChecklistItem.id}`)
          .set('Cookie', [user1Cookie])
          .send({ checked: true });

        expect(chkRes.status).toBe(200);
        expect(chkRes.body.checked).toBe(true);
      }

      // Start first step
      const startStepRes = await request(app)
        .post(`/api/v1/tasks/${taskId}/steps/${firstStep.id}/start`)
        .set('Cookie', [user1Cookie]);

      expect(startStepRes.status).toBe(200);
      expect(startStepRes.body.task.status).toBe('in_progress');

      // Complete first step
      const completeStepRes = await request(app)
        .post(`/api/v1/tasks/${taskId}/steps/${firstStep.id}/complete`)
        .set('Cookie', [user1Cookie])
        .send({ actualMinutes: 20 });

      expect(completeStepRes.status).toBe(200);
      expect(completeStepRes.body.task.completionPercent).toBeGreaterThan(0);

      // Submit evidence & reflection
      const evidenceRes = await request(app)
        .post(`/api/v1/tasks/${taskId}/evidence`)
        .set('Cookie', [user1Cookie])
        .send({
          rating: 5,
          evidenceNote: 'Đã giải đề thi đạt 9.2 điểm, hiểu rõ các câu phân loại.',
          type: 'text',
        });

      expect(evidenceRes.status).toBe(201);
      expect(evidenceRes.body.evidence.scoreValue).toBe(5);
      expect(evidenceRes.body.evidence.textValue).toContain('9.2 điểm');
    });
  });
});
