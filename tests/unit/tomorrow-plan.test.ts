import { describe, it, expect } from 'vitest';
import { tomorrowPlanRepo } from '../../server/repositories/tomorrow-plan-repository';
import { tomorrowPlanService } from '../../server/services/tomorrow-plan-service';
import { timetableRepo } from '../../server/repositories/timetable-repository';
import { taskRepo } from '../../server/repositories/task-repository';
import { examRepo } from '../../server/repositories/exam-repository';
import { sessionCheckinRepo } from '../../server/repositories/session-checkin-repository';

describe('Jami Tomorrow Preparation Planner Unit Tests', () => {
  const timezone = 'Asia/Ho_Chi_Minh';
  const fixedNow = new Date('2026-09-02T12:30:00.000Z'); // 19:30 VN (Wed Sep 2 -> targetDate: Thu Sep 3)

  describe('Date & Timezone calculations', () => {
    it('calculates planDate, targetDate and DOW correctly for Asia/Ho_Chi_Minh', () => {
      const dates = tomorrowPlanService.getPlanDates(timezone, fixedNow);

      expect(dates.planDate).toBe('2026-09-02');
      expect(dates.targetDate).toBe('2026-09-03');
      expect(dates.isEvening).toBe(true);
      expect(dates.currentHour).toBe(19);
      expect(dates.todayDOW).toBe(3); // Wednesday
      expect(dates.tomorrowDOW).toBe(4); // Thursday
    });

    it('works correctly around midnight (00:05)', () => {
      // 2026-09-02 00:05 UTC+7 -> 2026-09-01T17:05:00.000Z
      const fixedMidnight = new Date('2026-09-01T17:05:00.000Z');
      const dates = tomorrowPlanService.getPlanDates(timezone, fixedMidnight);

      expect(dates.planDate).toBe('2026-09-02');
      expect(dates.targetDate).toBe('2026-09-03');
      expect(dates.currentHour).toBe(0);
      expect(dates.isEvening).toBe(false);
    });

    it('works correctly right before midnight (23:59)', () => {
      // 2026-09-02 23:59 UTC+7 -> 2026-09-02T16:59:00.000Z
      const fixedLateNight = new Date('2026-09-02T16:59:00.000Z');
      const dates = tomorrowPlanService.getPlanDates(timezone, fixedLateNight);

      expect(dates.planDate).toBe('2026-09-02');
      expect(dates.targetDate).toBe('2026-09-03');
      expect(dates.currentHour).toBe(23);
      expect(dates.isEvening).toBe(true);
    });
  });

  describe('Evening Free Slots Calculation', () => {
    it('avoids dinner time and sleep time', async () => {
      const testUser = 'user_free_slots_' + Math.random().toString(36).substring(7);
      const dates = tomorrowPlanService.getPlanDates(timezone, new Date('2026-09-02T11:00:00.000Z')); // 18:00 VN
      const { freeSlots, availableFreeMinutes } = await tomorrowPlanService.calculateEveningFreeSlots(
        testUser,
        dates.planDate,
        timezone,
        '18:00'
      );

      expect(availableFreeMinutes).toBeGreaterThan(0);
      // Ensure no slot overlaps inside 18:45-19:30 dinner interval
      const dinnerStart = 18 * 60 + 45;
      const dinnerEnd = 19 * 60 + 30;
      for (const s of freeSlots) {
        const overlapsDinner = s.startMinutes < dinnerEnd && s.endMinutes > dinnerStart;
        expect(overlapsDinner).toBe(false);
      }
    });

    it('does not cross bedtime', async () => {
      const testUser = 'user_bedtime_' + Math.random().toString(36).substring(7);
      const dates = tomorrowPlanService.getPlanDates(timezone, new Date('2026-09-02T12:00:00.000Z')); // 19:00 VN
      const { freeSlots } = await tomorrowPlanService.calculateEveningFreeSlots(
        testUser,
        dates.planDate,
        timezone,
        '19:00'
      );

      for (const s of freeSlots) {
        expect(s.endMinutes).toBeLessThanOrEqual(22 * 60 + 30);
      }
    });
  });

  describe('Plan Generation & Prioritization', () => {
    it('prioritizes tasks due tomorrow over general review', async () => {
      const testUser = 'user_due_task_' + Math.random().toString(36).substring(7);
      const targetDate = '2026-09-03';
      // Create due task
      await taskRepo.create(testUser, {
        title: 'Bài tập Đại số trang 45',
        dueAt: `${targetDate}T23:59:59.000Z`,
        estimatedMinutes: 25,
        priority: 'high',
      });

      const plan = await tomorrowPlanService.generatePlan(testUser, {
        energyLevel: 'normal',
        timezone,
        now: fixedNow,
      });

      expect(plan).toBeDefined();
      expect(plan.items.length).toBeGreaterThan(0);
      const dueItem = plan.items.find((i) => i.sourceType === 'due_task' || i.title.includes('Đại số'));
      expect(dueItem).toBeDefined();
      expect(dueItem?.priority).toBe('high');
    });

    it('excludes cancelled / skipped timetable entries for tomorrow', async () => {
      const testUser = 'user_skipped_entry_' + Math.random().toString(36).substring(7);
      const targetDate = '2026-09-03'; // Thursday (DOW 4)
      const entry = await timetableRepo.createTimetableEntry(testUser, {
        title: 'Hóa học nâng cao',
        dayOfWeek: 4,
        startLocalTime: '08:00',
        endLocalTime: '09:30',
      });

      // Mark this session skipped for targetDate
      await timetableRepo.createException(testUser, entry.id, targetDate, 'Nghỉ tuần này');

      const plan = await tomorrowPlanService.generatePlan(testUser, {
        energyLevel: 'high',
        timezone,
        now: fixedNow,
      });

      // Skipped entry should NOT be previewed as subject
      const previewItem = plan.items.find((i) => i.subjectId === entry.id);
      expect(previewItem).toBeUndefined();
    });

    it('adjusts total minutes based on energy level', async () => {
      const testUser = 'user_energy_levels_' + Math.random().toString(36).substring(7);
      const highPlan = await tomorrowPlanService.generatePlan(testUser, { energyLevel: 'high', timezone, now: fixedNow });
      const lowPlan = await tomorrowPlanService.generatePlan(testUser, { energyLevel: 'low', timezone, now: fixedNow });

      expect(highPlan.totalMinutes).toBeGreaterThanOrEqual(lowPlan.totalMinutes);
      expect(lowPlan.totalMinutes).toBeLessThanOrEqual(35);
    });

    it('dismisses plan if energy level is skip', async () => {
      const testUser = 'user_skip_energy_' + Math.random().toString(36).substring(7);
      const plan = await tomorrowPlanService.generatePlan(testUser, { energyLevel: 'skip', timezone, now: fixedNow });
      expect(plan.status).toBe('dismissed');
      expect(plan.items.length).toBe(0);
      expect(plan.totalMinutes).toBe(0);
    });

    it('works with deterministic fallback when AI is unavailable', async () => {
      const testUser = 'user_reflection_' + Math.random().toString(36).substring(7);
      // Create a checkin with reflection
      await sessionCheckinRepo.createOrUpdateCheckin(testUser, {
        timetableEntryId: 'entry_geo_1',
        occurrenceDate: '2026-09-02',
        learnedContent: 'Khí hậu nhiệt đới gió mùa',
        reflection: 'Chưa hiểu phần hoàn lưu khí quyển',
        understandingLevel: 'not_understood',
        attendanceStatus: 'attended',
      });

      const plan = await tomorrowPlanService.generatePlan(testUser, { energyLevel: 'normal', timezone, now: fixedNow });
      const reflectionItem = plan.items.find((i) => i.sourceType === 'class_checkin_reflection');
      expect(reflectionItem).toBeDefined();
      expect(reflectionItem?.title).toContain('chưa hiểu');
    });
  });

  describe('Acceptance & Idempotency', () => {
    it('does not create duplicate plans for the same user on the same date', async () => {
      const testUser = 'user_dedup_plan_' + Math.random().toString(36).substring(7);
      const dates = tomorrowPlanService.getPlanDates(timezone, fixedNow);
      await tomorrowPlanService.generatePlan(testUser, { energyLevel: 'normal', timezone, now: fixedNow });
      const plan2 = await tomorrowPlanService.generatePlan(testUser, { energyLevel: 'high', timezone, now: fixedNow });

      const fetched = await tomorrowPlanRepo.getPlanByDate(testUser, dates.planDate);
      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(plan2.id);
    });

    it('accepts plan idempotently', async () => {
      const testUser = 'user_accept_plan_' + Math.random().toString(36).substring(7);
      const plan = await tomorrowPlanService.generatePlan(testUser, { energyLevel: 'normal', timezone, now: fixedNow });
      expect(plan.status).toBe('draft');

      const accepted = await tomorrowPlanService.acceptPlan(testUser, plan.id);
      expect(accepted.status).toBe('accepted');
      expect(accepted.acceptedAt).toBeDefined();
    });

    it('allows completing individual plan items', async () => {
      const testUser = 'user_complete_item_' + Math.random().toString(36).substring(7);
      // Add a timetable entry for tomorrow so there is at least 1 item
      await timetableRepo.createTimetableEntry(testUser, {
        title: 'Toán học',
        dayOfWeek: 4, // Thursday
        startLocalTime: '08:00',
        endLocalTime: '09:00',
      });
      const plan = await tomorrowPlanService.generatePlan(testUser, { energyLevel: 'normal', timezone, now: fixedNow });
      expect(plan.items.length).toBeGreaterThan(0);
      const firstItem = plan.items[0];

      const completed = await tomorrowPlanService.completeItem(testUser, plan.id, firstItem.id);
      expect(completed.status).toBe('completed');
    });
  });
});
