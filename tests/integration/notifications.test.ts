import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { authService } from '../../server/services/auth-service';
import { notificationRepo } from '../../server/repositories/notification-repository';
import { env } from '../../server/config/env';

describe('Notifications Subsystem Integration Tests', () => {
  const app = createApp();
  let testUserId: string;
  let sessionCookie: string;

  beforeAll(async () => {
    const email = `test.notifications.${Date.now()}@jami.edu.vn`;
    const reg = await authService.registerAtomic({
      email,
      password: 'Password123!',
      displayName: 'Notification Student',
      preferredName: 'Nam',
      gradeLevel: 9,
    });
    testUserId = reg.user.id;
    sessionCookie = `jami_session=${reg.rawToken}`;
  });

  it('1. GET /api/v1/notifications/preferences returns defaults and PATCH updates MySQL', async () => {
    // 1. GET preferences
    const getRes = await request(app)
      .get('/api/v1/notifications/preferences')
      .set('Cookie', [sessionCookie]);

    expect(getRes.status).toBe(200);
    expect(getRes.body.preferences).toBeDefined();
    expect(getRes.body.preferences.timezone).toBe('Asia/Ho_Chi_Minh');

    // 2. PATCH preferences with new quiet hours & lead times
    const patchRes = await request(app)
      .patch('/api/v1/notifications/preferences')
      .set('Cookie', [sessionCookie])
      .send({
        quietHoursStart: '23:00',
        quietHoursEnd: '06:00',
        classLeadMinutes: 30,
        taskLeadMinutes: 45,
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.preferences.quietHoursStart).toBe('23:00');
    expect(patchRes.body.preferences.classLeadMinutes).toBe(30);

    // Verify DB persistence
    const saved = await notificationRepo.getPreferences(testUserId);
    expect(saved.quietHoursStart).toBe('23:00');
    expect(saved.classLeadMinutes).toBe(30);
  });

  it('2. POST /api/v1/internal/notifications/run rejects unauthorized requests and accepts valid secret', async () => {
    // Without secret -> 401 Unauthorized
    const unauthRes = await request(app)
      .post('/api/v1/internal/notifications/run')
      .send({});
    expect(unauthRes.status).toBe(401);

    // With secret -> 200 OK
    const cronSecret = env.INTERNAL_CRON_SECRET || env.ADMIN_SECRET_KEY || 'jami-cron-internal-secret-key-32-chars';
    const authRes = await request(app)
      .post(`/api/v1/internal/notifications/run?userId=${testUserId}`)
      .set('x-internal-cron-secret', cronSecret)
      .send({ targetDate: new Date().toISOString() });

    expect(authRes.status).toBe(200);
    expect(authRes.body.success).toBe(true);
    expect(authRes.body.stats).toBeDefined();
  });

  it('3. GET /api/v1/notifications, POST /:id/read, POST /read-all and DELETE /:id', async () => {
    // Create 2 test notifications for user
    const n1 = await notificationRepo.create(testUserId, {
      type: 'upcoming_class',
      title: 'Tiết Hóa học',
      body: 'Phòng 102 lúc 09:00',
      actionUrl: '/timetable',
    });
    const n2 = await notificationRepo.create(testUserId, {
      type: 'upcoming_exam',
      title: 'Kiểm tra 1 tiết Toán',
      body: 'D-3 Ôn tập hình học',
      actionUrl: '/exams',
    });

    // 1. GET /notifications
    const listRes = await request(app)
      .get('/api/v1/notifications')
      .set('Cookie', [sessionCookie]);

    expect(listRes.status).toBe(200);
    expect(listRes.body.notifications.length).toBeGreaterThanOrEqual(2);
    expect(listRes.body.unreadCount).toBeGreaterThanOrEqual(2);

    // 2. POST /:id/read
    const readRes = await request(app)
      .post(`/api/v1/notifications/${n1.id}/read`)
      .set('Cookie', [sessionCookie]);

    expect(readRes.status).toBe(200);
    expect(readRes.body.success).toBe(true);

    // 3. POST /read-all
    const readAllRes = await request(app)
      .post('/api/v1/notifications/read-all')
      .set('Cookie', [sessionCookie]);

    expect(readAllRes.status).toBe(200);
    expect(readAllRes.body.unreadCount).toBe(0);

    // 4. DELETE /:id
    const delRes = await request(app)
      .delete(`/api/v1/notifications/${n2.id}`)
      .set('Cookie', [sessionCookie]);

    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);
  });
});
