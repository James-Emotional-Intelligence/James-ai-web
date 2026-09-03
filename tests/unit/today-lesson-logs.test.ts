import { describe, it, expect } from 'vitest';
import { ClassSessionCheckinSubmitSchema } from '../../shared/schemas';
import { taskRepo } from '../../server/repositories/task-repository';

describe('Today Lesson Logs & Homework Deduplication Unit Tests', () => {
  describe('1. ClassSessionCheckinSubmitSchema Validation', () => {
    it('validates a complete lesson check-in with homework and task creation request', () => {
      const payload = {
        timetableEntryId: 'entry_math_1',
        timetableEntryIds: ['entry_math_1', 'entry_math_2'],
        occurrenceDate: '2026-09-02',
        learnedContent: 'Bài 12 - Phương trình bậc hai, định lý Vi-ét',
        homework: 'Làm bài 1, 2, 3 trang 45 SGK Toán',
        hasNoHomework: false,
        attendanceStatus: 'attended',
        createTaskForHomework: true,
        dueAt: '2026-09-03T08:00:00.000Z',
        estimatedMinutes: 45,
      };

      const result = ClassSessionCheckinSubmitSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timetableEntryId).toBe('entry_math_1');
        expect(result.data.timetableEntryIds).toHaveLength(2);
        expect(result.data.createTaskForHomework).toBe(true);
        expect(result.data.hasNoHomework).toBe(false);
      }
    });

    it('validates a lesson with no homework', () => {
      const payload = {
        timetableEntryId: 'entry_pe_1',
        occurrenceDate: '2026-09-02',
        learnedContent: 'Chạy cự ly ngắn 100m',
        homework: '',
        hasNoHomework: true,
        attendanceStatus: 'attended',
        createTaskForHomework: false,
      };

      const result = ClassSessionCheckinSubmitSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hasNoHomework).toBe(true);
      }
    });

    it('rejects invalid occurrence date format', () => {
      const payload = {
        timetableEntryId: 'entry_1',
        occurrenceDate: '02-09-2026',
        attendanceStatus: 'attended',
      };

      const result = ClassSessionCheckinSubmitSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('2. Idempotent Homework Task Creation & Deduplication', () => {
    const userId = 'user_test_hw_dedup_' + Date.now();

    it('creates a single homework task on initial submission and updates on subsequent submission without duplicates', async () => {
      const timetableEntryId = 'entry_phys_1';
      const occurrenceDate = '2026-09-02';
      const stableSource = `homework_${timetableEntryId}_${occurrenceDate}`;

      const task1 = await taskRepo.create(userId, {
        title: 'BTVN: Vật lý - Bài 5 định luật Ôm',
        subjectName: 'Vật lý',
        status: 'pending',
        priority: 'high',
        estimatedMinutes: 30,
        dueAt: '2026-09-03T08:00:00.000Z',
        source: stableSource,
        objective: 'Làm bài 1, 2 SBT',
      });

      expect(task1).toBeDefined();
      expect(task1.id).toBeDefined();

      const allTasksBefore = await taskRepo.getByUserId(userId);
      const matchingBefore = allTasksBefore.filter((t) => t.source === stableSource);
      expect(matchingBefore).toHaveLength(1);

      const existingTask = matchingBefore[0];
      const task2 = await taskRepo.update(userId, existingTask.id, {
        title: 'BTVN: Vật lý - Bài 5 định luật Ôm (Bổ sung bài 3)',
        estimatedMinutes: 45,
        objective: 'Làm bài 1, 2, 3 SBT',
      });

      expect(task2).toBeDefined();
      expect(task2?.id).toBe(existingTask.id);
      expect(task2?.title).toContain('Bổ sung bài 3');

      const allTasksAfter = await taskRepo.getByUserId(userId);
      const matchingAfter = allTasksAfter.filter((t) => t.source === stableSource);
      expect(matchingAfter).toHaveLength(1);
    });
  });

  describe('3. Focus Navigation URL Contract Verification', () => {
    it('constructs and parses complete Focus Timer query params without empty fields', () => {
      const params = new URLSearchParams({
        duration: '45',
        taskId: 'task_123',
        planItemId: 'plan_item_456',
        title: 'Xem trước bài ngày mai môn Toán học',
        subjectId: 'subj_math',
        subject: 'Toán học',
        returnTo: '/today',
      });

      const queryString = params.toString();
      const parsed = new URLSearchParams(queryString);

      expect(parsed.get('duration')).toBe('45');
      expect(parsed.get('taskId')).toBe('task_123');
      expect(parsed.get('planItemId')).toBe('plan_item_456');
      expect(parsed.get('title')).toBe('Xem trước bài ngày mai môn Toán học');
      expect(parsed.get('subject')).toBe('Toán học');
      expect(parsed.get('returnTo')).toBe('/today');
    });
  });
});
