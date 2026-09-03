import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { authService } from '../../server/services/auth-service';
import { timetableRepo } from '../../server/repositories/timetable-repository';
import { subjectRepo } from '../../server/repositories/subject-repository';
import { taskRepo } from '../../server/repositories/task-repository';

describe('Tomorrow Preparation Plan Integration Tests ("Jami chuẩn bị ngày mai")', () => {
  const app = createApp();
  let testUserId: string;
  let sessionCookie: string;
  let createdPlanId: string;
  let firstItemId: string;

  beforeAll(async () => {
    const email = `test.tomplan.${Date.now()}@jami.edu.vn`;
    const reg = await authService.registerAtomic({
      email,
      password: 'Password123!',
      displayName: 'Test Tom Plan Student',
      preferredName: 'Bảo',
      gradeLevel: 10,
    });
    testUserId = reg.user.id;
    sessionCookie = `jami_session=${reg.rawToken}`;

    const subjects = await subjectRepo.getByUserId(testUserId);
    const subjectId = subjects[0]?.id;

    // Create a task due tomorrow
    await taskRepo.create(testUserId, {
      title: 'Soạn văn bài Chiếc lược ngà',
      dueAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      estimatedMinutes: 20,
      priority: 'high',
      subjectId,
    });
  });

  it('1. GET /api/v1/tomorrow-plan/overview returns overview info and banner status', async () => {
    const res = await request(app)
      .get('/api/v1/tomorrow-plan/overview')
      .set('Cookie', [sessionCookie]);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('isEvening');
    expect(res.body).toHaveProperty('availableFreeMinutes');
    expect(res.body).toHaveProperty('tomorrowSubjectsCount');
  });

  it('2. POST /api/v1/tomorrow-plan/generate creates a draft tomorrow plan', async () => {
    const res = await request(app)
      .post('/api/v1/tomorrow-plan/generate')
      .set('Cookie', [sessionCookie])
      .send({
        energyLevel: 'normal',
      });

    expect(res.status).toBe(201);
    expect(res.body.plan).toBeDefined();
    expect(res.body.plan.userId).toBe(testUserId);
    expect(res.body.plan.status).toBe('draft');
    expect(res.body.plan.items.length).toBeGreaterThan(0);

    createdPlanId = res.body.plan.id;
    firstItemId = res.body.plan.items[0].id;
  });

  it('3. GET /api/v1/tomorrow-plan/current retrieves current evening plan', async () => {
    const res = await request(app)
      .get('/api/v1/tomorrow-plan/current')
      .set('Cookie', [sessionCookie]);

    expect(res.status).toBe(200);
    expect(res.body.plan).toBeDefined();
    expect(res.body.plan.id).toBe(createdPlanId);
  });

  it('4. PATCH /api/v1/tomorrow-plan/:id/energy updates energy level and recalculates items', async () => {
    const res = await request(app)
      .patch(`/api/v1/tomorrow-plan/${createdPlanId}/energy`)
      .set('Cookie', [sessionCookie])
      .send({
        energyLevel: 'low',
      });

    expect(res.status).toBe(200);
    expect(res.body.plan.energyLevel).toBe('low');
    expect(res.body.plan.totalMinutes).toBeLessThanOrEqual(35);

    createdPlanId = res.body.plan.id;
    firstItemId = res.body.plan.items[0].id;
  });

  it('5. PATCH /api/v1/tomorrow-plan/:id/items/:itemId updates item details', async () => {
    const res = await request(app)
      .patch(`/api/v1/tomorrow-plan/${createdPlanId}/items/${firstItemId}`)
      .set('Cookie', [sessionCookie])
      .send({
        title: 'Ôn tập công thức trọng tâm (Đã sửa)',
        plannedMinutes: 20,
      });

    expect(res.status).toBe(200);
    expect(res.body.item.title).toBe('Ôn tập công thức trọng tâm (Đã sửa)');
    expect(res.body.item.plannedMinutes).toBe(20);
  });

  it('6. POST /api/v1/tomorrow-plan/:id/accept accepts the plan', async () => {
    const res = await request(app)
      .post(`/api/v1/tomorrow-plan/${createdPlanId}/accept`)
      .set('Cookie', [sessionCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.plan.status).toBe('accepted');
    expect(res.body.plan.acceptedAt).toBeDefined();
  });

  it('7. POST /api/v1/tomorrow-plan/:id/items/:itemId/complete completes an item', async () => {
    const res = await request(app)
      .post(`/api/v1/tomorrow-plan/${createdPlanId}/items/${firstItemId}/complete`)
      .set('Cookie', [sessionCookie]);

    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe('completed');
  });

  it('8. POST /api/v1/tomorrow-plan/:id/dismiss dismisses tonight plan', async () => {
    const res = await request(app)
      .post(`/api/v1/tomorrow-plan/${createdPlanId}/dismiss`)
      .set('Cookie', [sessionCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const checkRes = await request(app)
      .get('/api/v1/tomorrow-plan/current')
      .set('Cookie', [sessionCookie]);

    expect(checkRes.body.plan.status).toBe('dismissed');
  });
});
