import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { authService } from '../../server/services/auth-service';
import { timetableRepo } from '../../server/repositories/timetable-repository';
import { subjectRepo } from '../../server/repositories/subject-repository';

describe('Timetable Exceptions & Offline Check-ins Integration Tests', () => {
  const app = createApp();
  let testUserId: string;
  let sessionCookie: string;
  let subjectId: string;
  let timetableId: string;
  let entryId: string;

  beforeAll(async () => {
    const email = `test.exceptions.${Date.now()}@jami.edu.vn`;
    const reg = await authService.registerAtomic({
      email,
      password: 'Password123!',
      displayName: 'Test Exception Student',
      preferredName: 'Hoa',
      gradeLevel: 9,
    });
    testUserId = reg.user.id;
    sessionCookie = `jami_session=${reg.rawToken}`;

    const subjects = await subjectRepo.getByUserId(testUserId);
    subjectId = subjects[0]?.id || 'subj_test_toan';

    const ttRes = await timetableRepo.getOrCreateActiveTimetable(testUserId);
    timetableId = ttRes.id;

    const entry = await timetableRepo.createTimetableEntry(testUserId, {
      timetableId,
      dayOfWeek: 1, // Thứ 2
      startLocalTime: '07:30',
      endLocalTime: '08:15',
      title: 'Toán học đại số',
      subjectId,
    });
    entryId = entry.id;
  });

  it('1. POST /api/v1/timetables/entries/:id/exceptions marks entry as skipped this week', async () => {
    const occurrenceDate = '2026-09-07';
    const res = await request(app)
      .post(`/api/v1/timetables/entries/${entryId}/exceptions`)
      .set('Cookie', [sessionCookie])
      .send({
        occurrenceDate,
        exceptionType: 'cancelled',
        reason: 'Lễ khai giảng nghỉ',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.exception.timetableEntryId).toBe(entryId);
    expect(res.body.exception.occurrenceDate).toBe(occurrenceDate);
  });

  it('2. GET /api/v1/timetables with forDate returns isSkippedThisWeek = true', async () => {
    const occurrenceDate = '2026-09-07';
    const res = await request(app)
      .get(`/api/v1/timetables?forDate=${occurrenceDate}`)
      .set('Cookie', [sessionCookie]);

    expect(res.status).toBe(200);
    const targetEntry = res.body.entries.find((e: any) => e.id === entryId);
    expect(targetEntry).toBeDefined();
    expect(targetEntry.isSkippedThisWeek).toBe(true);
  });

  it('3. DELETE /api/v1/timetables/entries/:id/exceptions/:date unskips the entry (Hoàn tác)', async () => {
    const occurrenceDate = '2026-09-07';
    const res = await request(app)
      .delete(`/api/v1/timetables/entries/${entryId}/exceptions/${occurrenceDate}`)
      .set('Cookie', [sessionCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const checkRes = await request(app)
      .get(`/api/v1/timetables?forDate=${occurrenceDate}`)
      .set('Cookie', [sessionCookie]);

    const targetEntry = checkRes.body.entries.find((e: any) => e.id === entryId);
    expect(targetEntry.isSkippedThisWeek).toBe(false);
  });

  it('4. POST /api/v1/timetables/session-checkins records check-in and creates homework task if requested', async () => {
    const occurrenceDate = '2026-09-07';
    const res = await request(app)
      .post('/api/v1/timetables/session-checkins')
      .set('Cookie', [sessionCookie])
      .send({
        timetableEntryId: entryId,
        occurrenceDate,
        learnedContent: 'Phương trình bậc hai',
        homework: 'Làm bài 1, 2, 3 SGK',
        reflection: 'Hiểu bài tốt',
        understandingLevel: 'very_easy',
        attendanceStatus: 'attended',
        createTaskForHomework: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.checkin.learnedContent).toBe('Phương trình bậc hai');
    expect(res.body.createdTask).toBeDefined();
    expect(res.body.createdTask.title).toContain('Làm bài 1, 2, 3 SGK');
  });

  it('5. POST /api/v1/users/heartbeat updates user activity', async () => {
    const res = await request(app)
      .post('/api/v1/users/heartbeat')
      .set('Cookie', [sessionCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
