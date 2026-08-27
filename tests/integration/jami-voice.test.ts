import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { authService } from '../../server/services/auth-service';
import { jamiRepo } from '../../server/repositories/jami-repository';
import { taskRepo } from '../../server/repositories/task-repository';

describe('JAMI Voice & Realtime Integration Tests', () => {
  const app = createApp();
  let testUserId: string;
  let sessionCookie: string;

  beforeAll(async () => {
    const email = `test.voice.${Date.now()}@jami.edu.vn`;
    const reg = await authService.registerAtomic({
      email,
      password: 'Password123!',
      displayName: 'Voice Test Student',
      preferredName: 'Minh',
      gradeLevel: 9,
    });
    testUserId = reg.user.id;
    sessionCookie = `jami_session=${reg.rawToken}`;
  });

  it('1. POST /api/v1/jami/realtime/client-secret returns real structure without hardcoded token sample', async () => {
    const res = await request(app)
      .post('/api/v1/jami/realtime/client-secret')
      .set('Cookie', [sessionCookie]);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('mode');
    expect(res.body.clientSecret).not.toBe('realtime_ephemeral_token_sample');
  });

  it('2. POST /api/v1/jami/voice/command handles navigation request without mutating DB', async () => {
    const res = await request(app)
      .post('/api/v1/jami/voice/command')
      .set('Cookie', [sessionCookie])
      .send({
        transcript: 'Jami ơi mở thời khóa biểu',
      });

    expect(res.status).toBe(200);
    expect(res.body.replyText).toBeDefined();
    expect(res.body.clientAction).toBeDefined();
    expect(res.body.clientAction.type).toBe('navigate');
    expect(res.body.clientAction.route).toBe('/timetable');

    // Check message is synced to MySQL repository
    const messages = await jamiRepo.getMessages(testUserId);
    expect(messages.some((m) => m.text.includes('mở thời khóa biểu'))).toBe(true);
  });

  it('3. POST /api/v1/jami/voice/command handles focus timer creation', async () => {
    const res = await request(app)
      .post('/api/v1/jami/voice/command')
      .set('Cookie', [sessionCookie])
      .send({
        transcript: 'Jami ơi bắt đầu hẹn giờ tập trung 25 phút',
      });

    expect(res.status).toBe(200);
    expect(res.body.clientAction).toBeDefined();
    expect(res.body.clientAction.type).toBe('focus_timer');
    expect(res.body.clientAction.route).toBe('/focus');
  });

  it('4. POST /api/v1/jami/voice/command generates proposal preview and POST /jami/voice/confirm commits it', async () => {
    const res = await request(app)
      .post('/api/v1/jami/voice/command')
      .set('Cookie', [sessionCookie])
      .send({
        transcript: 'Tối nay hãy xếp cho tôi 45 phút học Toán',
      });

    expect(res.status).toBe(200);
    expect(res.body.requiresConfirmation).toBe(true);
    expect(res.body.proposal).toBeDefined();

    const proposalId = res.body.proposal.id;

    // Confirm proposal
    const confirmRes = await request(app)
      .post('/api/v1/jami/voice/confirm')
      .set('Cookie', [sessionCookie])
      .send({
        decision: 'confirm',
        proposalId,
      });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.success).toBe(true);

    // Verify task is committed in MySQL repository
    const tasks = await taskRepo.getByUserId(testUserId);
    expect(tasks.some((t) => t.title.includes('Toán'))).toBe(true);
  });

  it('5. POST /api/v1/jami/chat handles direct user text chat and saves to repository', async () => {
    const res = await request(app)
      .post('/api/v1/jami/chat')
      .set('Cookie', [sessionCookie])
      .send({
        message: 'Chào Jami, hôm nay có bài tập gì không?',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('userMessage');
    expect(res.body).toHaveProperty('replyMessage');
    expect(res.body.userMessage.text).toBe('Chào Jami, hôm nay có bài tập gì không?');
  });
});
