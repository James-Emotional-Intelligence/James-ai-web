import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { authService } from '../../server/services/auth-service';
import { timetableRepo } from '../../server/repositories/timetable-repository';
import { plannerRepo } from '../../server/repositories/planner-repository';
import { taskRepo } from '../../server/repositories/task-repository';
import { subjectRepo } from '../../server/repositories/subject-repository';

describe('Timetable & Replan Subsystem Integration Tests', () => {
  const app = createApp();
  let testUserId: string;
  let sessionCookie: string;
  let subjectId: string;

  beforeAll(async () => {
    // Create unique test student via registerAtomic
    const email = `test.timetable.${Date.now()}@jami.edu.vn`;
    const reg = await authService.registerAtomic({
      email,
      password: 'Password123!',
      displayName: 'Test Timetable Student',
      preferredName: 'Minh',
      gradeLevel: 9,
    });
    testUserId = reg.user.id;
    sessionCookie = `jami_session=${reg.rawToken}`;

    // Seed default subjects for user
    const subjects = await subjectRepo.getByUserId(testUserId);
    subjectId = subjects[0]?.id || 'subj_test_toan';
  });

  it('1. GET /api/v1/timetables returns user timetables, entries, and busy events', async () => {
    const res = await request(app)
      .get('/api/v1/timetables')
      .set('Cookie', [sessionCookie]);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('timetables');
    expect(res.body).toHaveProperty('entries');
    expect(res.body).toHaveProperty('busyEvents');
    expect(Array.isArray(res.body.entries)).toBe(true);
  });

  it('2. POST /api/v1/timetables/entries validates startLocalTime < endLocalTime', async () => {
    // Invalid: start time is after end time
    const invalidRes = await request(app)
      .post('/api/v1/timetables/entries')
      .set('Cookie', [sessionCookie])
      .send({
        title: 'Tiết học sai giờ',
        dayOfWeek: 1,
        startLocalTime: '10:00',
        endLocalTime: '08:00', // Invalid!
      });

    expect(invalidRes.status).toBe(400);
    expect(invalidRes.body.error.code).toBe('VALIDATION_ERROR');

    // Valid entry
    const validRes = await request(app)
      .post('/api/v1/timetables/entries')
      .set('Cookie', [sessionCookie])
      .send({
        title: 'Toán Đại số 9',
        subjectId,
        dayOfWeek: 1,
        startLocalTime: '07:30',
        endLocalTime: '09:00',
        location: 'Phòng 9A1',
        commuteBeforeMinutes: 15,
        commuteAfterMinutes: 15,
      });

    expect(validRes.status).toBe(201);
    expect(validRes.body.entry).toHaveProperty('id');
    expect(validRes.body.entry.title).toBe('Toán Đại số 9');
  });

  it('3. POST /api/v1/busy-events adds busy event with timezone support', async () => {
    const res = await request(app)
      .post('/api/v1/busy-events')
      .set('Cookie', [sessionCookie])
      .send({
        title: 'Học thêm Tiếng Anh',
        type: 'extra_class',
        startsAt: '2026-08-25T17:30:00.000Z',
        endsAt: '2026-08-25T19:00:00.000Z',
        timezone: 'Asia/Ho_Chi_Minh',
        isFixed: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.event).toHaveProperty('id');
    expect(res.body.event.title).toBe('Học thêm Tiếng Anh');
  });

  it('4. POST /api/v1/planner/replan/preview saves proposal to database and returns diff', async () => {
    // Seed a task for user
    await taskRepo.create(testUserId, {
      title: 'Làm bài tập hình học',
      subjectId,
      estimatedMinutes: 45,
      status: 'pending',
      priority: 'high',
    });

    const res = await request(app)
      .post('/api/v1/planner/replan/preview')
      .set('Cookie', [sessionCookie])
      .send({
        daysCount: 7,
      });

    expect(res.status).toBe(200);
    expect(res.body.proposal).toHaveProperty('id');
    expect(res.body.proposal.tasksToSchedule.length).toBeGreaterThan(0);

    const proposalId = res.body.proposal.id;

    // Verify proposal was persisted in DB
    const savedProposal = await plannerRepo.getProposal(testUserId, proposalId);
    expect(savedProposal).not.toBeNull();
    expect(savedProposal?.id).toBe(proposalId);
  });

  it('5. POST /api/v1/planner/proposals/:proposalId/confirm confirms proposal and updates tasks', async () => {
    // Generate preview proposal
    const previewRes = await request(app)
      .post('/api/v1/planner/replan/preview')
      .set('Cookie', [sessionCookie])
      .send({});

    const proposalId = previewRes.body.proposal.id;

    // Confirm proposal
    const confirmRes = await request(app)
      .post(`/api/v1/planner/proposals/${proposalId}/confirm`)
      .set('Cookie', [sessionCookie])
      .send({ idempotencyKey: 'key_123' });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.success).toBe(true);

    // Re-confirming should succeed idempotently or return 409
    const secondConfirm = await request(app)
      .post(`/api/v1/planner/proposals/${proposalId}/confirm`)
      .set('Cookie', [sessionCookie])
      .send({ idempotencyKey: 'key_123' });

    expect([200, 409]).toContain(secondConfirm.status);
  });

  it('6. Confirming non-existent proposal returns 404', async () => {
    const res = await request(app)
      .post('/api/v1/planner/proposals/prop_non_existent_999/confirm')
      .set('Cookie', [sessionCookie])
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROPOSAL_NOT_FOUND');
  });

  it('7. POST /api/v1/timetables/import-ocr and /confirm extracts and saves entries', async () => {
    // 1. OCR Extraction (Preview)
    const ocrRes = await request(app)
      .post('/api/v1/timetables/import-ocr')
      .set('Cookie', [sessionCookie])
      .send({
        imageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        mimeType: 'image/png',
      });

    expect(ocrRes.status).toBe(200);
    expect(ocrRes.body.success).toBe(true);
    expect(Array.isArray(ocrRes.body.entries)).toBe(true);
    expect(ocrRes.body.entries.length).toBeGreaterThan(0);

    // 2. OCR Confirmation & Save
    const confirmRes = await request(app)
      .post('/api/v1/timetables/import-ocr/confirm')
      .set('Cookie', [sessionCookie])
      .send({
        timetableName: 'Thời khóa biểu OCR Test',
        replaceExisting: true,
        entries: [
          { dayOfWeek: 1, title: 'Toán học', startLocalTime: '07:30', endLocalTime: '08:15', room: 'P.101' },
          { dayOfWeek: 1, title: 'Ngữ văn', startLocalTime: '08:20', endLocalTime: '09:05', room: 'P.101' },
        ],
      });

    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.success).toBe(true);
    expect(confirmRes.body.savedCount).toBe(2);
  });
});
