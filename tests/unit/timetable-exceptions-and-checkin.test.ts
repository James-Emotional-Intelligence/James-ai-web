import { describe, it, expect, beforeEach } from 'vitest';
import { timetableRepo } from '../../server/repositories/timetable-repository';
import { sessionCheckinRepo } from '../../server/repositories/session-checkin-repository';
import { userRepo } from '../../server/repositories/user-repository';

describe('Timetable Exceptions and Offline Checkins Unit Tests', () => {
  const userId = `unit_test_user_${Date.now()}`;
  let entryId1: string;
  let entryId2: string;

  beforeEach(async () => {
    // Ensure active timetable exists
    const tt = await timetableRepo.createTimetable(userId, { name: 'Thời khóa biểu kiểm thử' });
    const entry1 = await timetableRepo.createTimetableEntry(userId, {
      timetableId: tt.id,
      dayOfWeek: 1, // Monday
      startLocalTime: '07:30',
      endLocalTime: '08:15',
      title: 'Toán học',
    });
    const entry2 = await timetableRepo.createTimetableEntry(userId, {
      timetableId: tt.id,
      dayOfWeek: 2, // Tuesday
      startLocalTime: '08:30',
      endLocalTime: '09:15',
      title: 'Vật lý',
    });
    entryId1 = entry1.id;
    entryId2 = entry2.id;
  });

  describe('Timetable Entry Exceptions (Nghỉ tuần này)', () => {
    it('creates an exception for a specific occurrence date', async () => {
      const occurrenceDate = '2026-09-07';
      const exc = await timetableRepo.createException(userId, {
        timetableEntryId: entryId1,
        occurrenceDate,
        exceptionType: 'cancelled',
        reason: 'Nghỉ ốm',
      });

      expect(exc).toBeDefined();
      expect(exc.timetableEntryId).toBe(entryId1);
      expect(exc.occurrenceDate).toBe(occurrenceDate);
      expect(exc.exceptionType).toBe('cancelled');
      expect(exc.reason).toBe('Nghỉ ốm');

      // Check isEntrySkippedOnDate
      const isSkipped = await timetableRepo.isEntrySkippedOnDate(entryId1, occurrenceDate);
      expect(isSkipped).toBe(true);

      const isSkippedOtherDate = await timetableRepo.isEntrySkippedOnDate(entryId1, '2026-09-14');
      expect(isSkippedOtherDate).toBe(false);
    });

    it('retrieves entries with isSkippedThisWeek flag when forDate matches', async () => {
      const occurrenceDate = '2026-09-07';
      await timetableRepo.createException(userId, {
        timetableEntryId: entryId1,
        occurrenceDate,
        exceptionType: 'cancelled',
      });

      const entriesWithForDate = await timetableRepo.getTimetableEntries(userId, undefined, occurrenceDate);
      const e1 = entriesWithForDate.find((e) => e.id === entryId1);
      const e2 = entriesWithForDate.find((e) => e.id === entryId2);

      expect(e1?.isSkippedThisWeek).toBe(true);
      expect(e2?.isSkippedThisWeek).toBe(false);

      // On different date
      const entriesOtherDate = await timetableRepo.getTimetableEntries(userId, undefined, '2026-09-14');
      const e1Other = entriesOtherDate.find((e) => e.id === entryId1);
      expect(e1Other?.isSkippedThisWeek).toBe(false);
    });

    it('deletes exception successfully (Hoàn tác)', async () => {
      const occurrenceDate = '2026-09-07';
      await timetableRepo.createException(userId, {
        timetableEntryId: entryId1,
        occurrenceDate,
        exceptionType: 'cancelled',
      });

      const deleted = await timetableRepo.deleteException(userId, entryId1, occurrenceDate);
      expect(deleted).toBe(true);

      const isSkipped = await timetableRepo.isEntrySkippedOnDate(entryId1, occurrenceDate);
      expect(isSkipped).toBe(false);
    });
  });

  describe('Session Check-ins & Offline Catch-up', () => {
    it('creates and retrieves class session check-in record', async () => {
      const occurrenceDate = '2026-09-07';
      const checkin = await sessionCheckinRepo.createOrUpdateCheckin(userId, {
        timetableEntryId: entryId1,
        occurrenceDate,
        learnedContent: 'Phương trình bậc 2',
        homework: 'Bài 1, 2 trang 45',
        reflection: 'Cần ôn thêm phần delta',
        understandingLevel: 'normal',
        attendanceStatus: 'attended',
      });

      expect(checkin).toBeDefined();
      expect(checkin.learnedContent).toBe('Phương trình bậc 2');
      expect(checkin.homework).toBe('Bài 1, 2 trang 45');
      expect(checkin.understandingLevel).toBe('normal');
      expect(checkin.attendanceStatus).toBe('attended');

      const checkins = await sessionCheckinRepo.getCheckins(userId, '2026-09-01', '2026-09-10');
      expect(checkins.some((c) => c.timetableEntryId === entryId1 && c.occurrenceDate === occurrenceDate)).toBe(true);
    });

    it('calculates missed sessions and excludes skipped or already checkin sessions', async () => {
      const occurrenceDate = '2026-09-07';
      // Mark entry 1 as checkin
      await sessionCheckinRepo.createOrUpdateCheckin(userId, {
        timetableEntryId: entryId1,
        occurrenceDate,
        attendanceStatus: 'attended',
      });

      // Mark entry 2 as skipped this week
      await timetableRepo.createException(userId, {
        timetableEntryId: entryId2,
        occurrenceDate: '2026-09-08',
        exceptionType: 'cancelled',
      });

      // Both should not appear as pending missed sessions
      const missed = await sessionCheckinRepo.getMissedSessions(userId, 'Asia/Ho_Chi_Minh');
      expect(missed.some((m) => m.timetableEntryId === entryId1 && m.occurrenceDate === occurrenceDate)).toBe(false);
      expect(missed.some((m) => m.timetableEntryId === entryId2 && m.occurrenceDate === '2026-09-08')).toBe(false);
    });
  });
});
