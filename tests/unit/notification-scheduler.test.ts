import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  sanitizeActionUrl,
  isWithinQuietHours,
  getDeferredDeliveryTime,
  notificationScheduler,
} from '../../server/services/notification-scheduler-service';
import { notificationRepo } from '../../server/repositories/notification-repository';
import { timetableRepo } from '../../server/repositories/timetable-repository';
import { taskRepo } from '../../server/repositories/task-repository';
import { examRepo } from '../../server/repositories/exam-repository';

describe('Notification Scheduler & Sanitization Unit Tests', () => {
  const userId = 'usr_student_test_notif_01';

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('1. Action URL Sanitizer', () => {
    it('allows valid internal routes', () => {
      expect(sanitizeActionUrl('/today')).toBe('/today');
      expect(sanitizeActionUrl('/timetable')).toBe('/timetable');
      expect(sanitizeActionUrl('/tasks/task_12345')).toBe('/tasks/task_12345');
      expect(sanitizeActionUrl('/exams')).toBe('/exams');
      expect(sanitizeActionUrl('/focus')).toBe('/focus');
      expect(sanitizeActionUrl('/settings')).toBe('/settings');
    });

    it('rejects external URLs, protocol-relative URLs, and javascript schemes', () => {
      expect(sanitizeActionUrl('https://evil.com/phish')).toBeUndefined();
      expect(sanitizeActionUrl('http://attacker.com')).toBeUndefined();
      expect(sanitizeActionUrl('//evil.com')).toBeUndefined();
      expect(sanitizeActionUrl('javascript:alert(1)')).toBeUndefined();
      expect(sanitizeActionUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBeUndefined();
      expect(sanitizeActionUrl('/unregistered-private-admin-route')).toBeUndefined();
      expect(sanitizeActionUrl(undefined)).toBeUndefined();
      expect(sanitizeActionUrl('')).toBeUndefined();
    });
  });

  describe('2. Quiet Hours Calculation', () => {
    it('detects overnight quiet hours spanning midnight (22:30 to 06:30)', () => {
      // 23:15 -> within quiet hours
      const lateNight = new Date('2026-08-25T23:15:00+07:00');
      expect(isWithinQuietHours(lateNight, '22:30', '06:30', 'Asia/Ho_Chi_Minh')).toBe(true);

      // 03:00 -> within quiet hours
      const earlyMorning = new Date('2026-08-26T03:00:00+07:00');
      expect(isWithinQuietHours(earlyMorning, '22:30', '06:30', 'Asia/Ho_Chi_Minh')).toBe(true);

      // 09:00 -> outside quiet hours
      const dayTime = new Date('2026-08-25T09:00:00+07:00');
      expect(isWithinQuietHours(dayTime, '22:30', '06:30', 'Asia/Ho_Chi_Minh')).toBe(false);

      // 22:00 -> outside quiet hours
      const beforeQuiet = new Date('2026-08-25T22:00:00+07:00');
      expect(isWithinQuietHours(beforeQuiet, '22:30', '06:30', 'Asia/Ho_Chi_Minh')).toBe(false);
    });

    it('calculates deferred delivery timestamp to next morning quiet hours end', () => {
      const lateNight = new Date('2026-08-25T23:15:00+07:00');
      const deferred = getDeferredDeliveryTime(lateNight, '06:30', 'Asia/Ho_Chi_Minh');

      expect(deferred.getTime()).toBeGreaterThan(lateNight.getTime());
    });
  });

  describe('3. Automated Scan, Lead Window & Deduplication', () => {
    it('generates upcoming_class notification when class starts in 15 minutes and deduplicates on repeat scan', async () => {
      // Set fake clock to Tuesday 07:45 AM
      const mockNow = new Date('2026-08-25T07:45:00+07:00');
      vi.setSystemTime(mockNow);

      // Seed active timetable with Tuesday (dayOfWeek = 2) at 08:00 AM
      timetableRepo.seedDemo(
        userId,
        [
          {
            id: 'entry_toan_tue',
            timetableId: 'tt_active_01',
            subjectId: 'subj_toan',
            subjectName: 'Toán học',
            title: 'Hình học không gian',
            dayOfWeek: 2,
            startLocalTime: '08:00',
            endLocalTime: '08:45',
            location: 'Phòng 204',
            commuteBeforeMinutes: 0,
            commuteAfterMinutes: 0,
          },
        ],
        []
      );

      // Initial scan
      const firstScan = await notificationScheduler.scanAndGenerateForUser(userId, mockNow);
      expect(firstScan.created).toBeGreaterThanOrEqual(1);

      const notifsAfterFirst = await notificationRepo.getByUserId(userId);
      const classNotif = notifsAfterFirst.find((n) => n.type === 'upcoming_class');
      expect(classNotif).toBeDefined();
      expect(classNotif?.title).toContain('Hình học không gian');
      expect(classNotif?.actionUrl).toBe('/timetable');

      // Second immediate scan with same timestamp -> deduplication (0 new created)
      const secondScan = await notificationScheduler.scanAndGenerateForUser(userId, mockNow);
      expect(secondScan.created).toBe(0);
      expect(secondScan.deduped).toBeGreaterThanOrEqual(1);
    });

    it('generates exam milestone notification for D-7 and D-1', async () => {
      const mockNow = new Date('2026-08-25T08:00:00+07:00');
      vi.setSystemTime(mockNow);

      // Exam exactly 7 days from now (2026-09-01)
      const examDate = new Date('2026-09-01T08:00:00+07:00');
      examRepo.seedDemo(userId, [
        {
          id: 'exam_d7_test',
          userId,
          subjectId: 'subj_toan',
          subjectName: 'Toán học',
          title: 'Khảo sát chất lượng Giữa kỳ I',
          scopeText: '',
          examAt: examDate.toISOString(),
          importance: 'high',
          topics: [],
          milestones: [],
        },
      ]);

      const res = await notificationScheduler.scanAndGenerateForUser(userId, mockNow);
      expect(res.created).toBeGreaterThanOrEqual(1);

      const notifs = await notificationRepo.getByUserId(userId);
      const examNotif = notifs.find((n) => n.dedupeKey?.includes('D-7'));
      expect(examNotif).toBeDefined();
      expect(examNotif?.type).toBe('upcoming_exam');
      expect(examNotif?.title).toContain('còn 7 ngày');
      expect(examNotif?.actionUrl).toBe('/exams');
    });

    it('respects user opt-out preferences and does not create disabled notification types', async () => {
      const mockNow = new Date('2026-08-25T08:00:00+07:00');
      vi.setSystemTime(mockNow);

      // Disable upcomingClass in preferences
      await notificationRepo.updatePreferences(userId, {
        upcomingClass: false,
        upcomingExam: false,
        incompleteTask: false,
      });

      const scanResult = await notificationScheduler.scanAndGenerateForUser(userId, mockNow);
      expect(scanResult.created).toBe(0);
    });
  });
});
