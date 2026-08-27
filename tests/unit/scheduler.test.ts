import { describe, it, expect } from 'vitest';
import {
  DeterministicScheduler,
  getLocalParts,
  createLocalDate,
  TimeInterval,
} from '../../server/services/scheduler';
import { StudyTask, BusyEvent, TimetableEntry, StudentProfile } from '../../shared/types';

describe('DeterministicScheduler Pure Engine Unit Tests', () => {
  const defaultProfile: StudentProfile = {
    userId: 'user_test_01',
    gradeLevel: 9,
    schoolName: 'THCS',
    goals: [],
    preferredSessionMinutes: 45,
    maxDailyStudyMinutes: 120,
    energyPreferences: { morning: 'high', afternoon: 'low', evening: 'high' },
    sleepSchedule: { wakeTime: '06:00', bedTime: '22:30' },
    mealTimes: { lunch: '12:00', dinner: '18:30' },
  };

  it('1. mergeIntervals merges overlapping, contiguous, and disordered intervals correctly', () => {
    const base = new Date('2026-08-25T00:00:00.000Z').getTime();

    const intervals: TimeInterval[] = [
      { start: new Date(base + 600000), end: new Date(base + 1200000) }, // 10:00 -> 20:00
      { start: new Date(base), end: new Date(base + 600000) },          // 00:00 -> 10:00 (contiguous)
      { start: new Date(base + 800000), end: new Date(base + 1500000) }, // 13:20 -> 25:00 (overlapping)
      { start: new Date(base + 2000000), end: new Date(base + 3000000) }, // separate
    ];

    const merged = DeterministicScheduler.mergeIntervals(intervals);
    expect(merged).toHaveLength(2);
    expect(merged[0].start.getTime()).toBe(base);
    expect(merged[0].end.getTime()).toBe(base + 1500000);
    expect(merged[1].start.getTime()).toBe(base + 2000000);
    expect(merged[1].end.getTime()).toBe(base + 3000000);
  });

  it('2. expandRecurrence correctly expands weekly recurrence across multiple days', () => {
    const event: BusyEvent = {
      id: 'busy_extra_01',
      userId: 'user_test_01',
      type: 'extra_class',
      title: 'Học thêm Toán',
      startsAt: '2026-08-25T17:30:00.000+07:00',
      endsAt: '2026-08-25T19:00:00.000+07:00',
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU,TH', // Tuesday (2) & Thursday (4)
      timezone: 'Asia/Ho_Chi_Minh',
      isFixed: true,
    };

    const rangeStart = new Date('2026-08-24T00:00:00.000Z'); // Monday
    const rangeEnd = new Date('2026-08-31T00:00:00.000Z');   // Next Monday

    const expanded = DeterministicScheduler.expandRecurrence(event, rangeStart, rangeEnd, 'Asia/Ho_Chi_Minh');
    expect(expanded.length).toBeGreaterThanOrEqual(2);
  });

  it('3. computeFreeSlots correctly subtracts busy intervals and ignores slots < minSlotMinutes', () => {
    const dayStart = new Date('2026-08-25T07:00:00.000Z');
    const dayEnd = new Date('2026-08-25T22:00:00.000Z');

    const busy: TimeInterval[] = [
      { start: new Date('2026-08-25T07:30:00.000Z'), end: new Date('2026-08-25T11:45:00.000Z') }, // School
      { start: new Date('2026-08-25T12:00:00.000Z'), end: new Date('2026-08-25T13:00:00.000Z') }, // Lunch
      { start: new Date('2026-08-25T18:30:00.000Z'), end: new Date('2026-08-25T19:30:00.000Z') }, // Dinner
    ];

    const free = DeterministicScheduler.computeFreeSlots({ start: dayStart, end: dayEnd }, busy, 20);

    // Free slots should exist in morning before school, afternoon (13:00-18:30), and evening (19:30-22:00)
    expect(free.length).toBeGreaterThanOrEqual(2);
    for (const slot of free) {
      expect(slot.durationMinutes).toBeGreaterThanOrEqual(20);
      // Ensure no free slot overlaps with any busy interval
      for (const b of busy) {
        const overlap = slot.start < b.end && slot.end > b.start;
        expect(overlap).toBe(false);
      }
    }
  });

  it('4. scoreSlot gives higher scores to urgent, high-priority, and energy-matched slots', () => {
    const urgentTask: StudyTask = {
      id: 't_urgent',
      userId: 'user_test_01',
      subjectId: 'subj_math',
      title: 'Ôn tập gấp',
      status: 'pending',
      priority: 'high',
      difficulty: 'hard',
      splittable: false,
      locked: false,
      completionPercent: 0,
      dueAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(), // Due in 12h
      estimatedMinutes: 45,
    };

    const regularTask: StudyTask = {
      id: 't_regular',
      userId: 'user_test_01',
      subjectId: 'subj_lit',
      title: 'Đọc bài',
      status: 'pending',
      priority: 'low',
      difficulty: 'easy',
      splittable: false,
      locked: false,
      completionPercent: 0,
      estimatedMinutes: 30,
    };

    const morningSlot = {
      start: new Date('2026-08-26T08:00:00.000+07:00'),
      end: new Date('2026-08-26T09:30:00.000+07:00'),
      durationMinutes: 90,
      dayKey: '2026-08-26',
    };

    const scoreUrgent = DeterministicScheduler.scoreSlot(urgentTask, morningSlot, defaultProfile);
    const scoreRegular = DeterministicScheduler.scoreSlot(regularTask, morningSlot, defaultProfile);

    expect(scoreUrgent.score).toBeGreaterThan(scoreRegular.score);
  });

  it('5. enforces maxDailyStudyMinutes limit and never over-allocates a day', () => {
    const tasks: StudyTask[] = [
      { id: 't1', userId: 'u1', subjectId: 's1', title: 'Bài 1', estimatedMinutes: 60, status: 'pending', priority: 'high', difficulty: 'medium', splittable: false, locked: false, completionPercent: 0 },
      { id: 't2', userId: 'u1', subjectId: 's1', title: 'Bài 2', estimatedMinutes: 60, status: 'pending', priority: 'high', difficulty: 'medium', splittable: false, locked: false, completionPercent: 0 },
      { id: 't3', userId: 'u1', subjectId: 's1', title: 'Bài 3', estimatedMinutes: 60, status: 'pending', priority: 'high', difficulty: 'medium', splittable: false, locked: false, completionPercent: 0 },
    ];

    // maxDailyStudyMinutes is 100
    const profileWithLimit: StudentProfile = {
      ...defaultProfile,
      maxDailyStudyMinutes: 100,
    };

    const proposal = DeterministicScheduler.generateScheduleProposal(
      tasks,
      [],
      [],
      [],
      profileWithLimit,
      new Date('2026-08-26T00:00:00.000Z'),
      1 // only 1 day
    );

    // Only 1 task of 60m should fit in this 1 day (because 60 + 60 = 120 > 100)
    const scheduledTotal = proposal.tasksToSchedule.reduce((acc, t) => acc + t.estimatedMinutes, 0);
    expect(scheduledTotal).toBeLessThanOrEqual(100);
    expect(proposal.unscheduledItems.length).toBeGreaterThan(0);
  });

  it('6. splits splittable tasks exceeding maxSessionMinutes into multiple valid sessions', () => {
    const splittableTask: StudyTask = {
      id: 'task_big_exam_prep',
      userId: 'user_test_01',
      subjectId: 'subj_math',
      title: 'Đại số chương 3 toàn diện',
      estimatedMinutes: 120, // 2 hours
      splittable: true,
      minSessionMinutes: 30,
      maxSessionMinutes: 60,
      status: 'pending',
      priority: 'high',
      difficulty: 'hard',
      locked: false,
      completionPercent: 0,
    };

    const proposal = DeterministicScheduler.generateScheduleProposal(
      [splittableTask],
      [],
      [],
      [],
      defaultProfile,
      new Date('2026-08-26T00:00:00.000Z'),
      3
    );

    expect(proposal.tasksToSchedule.length).toBeGreaterThanOrEqual(2);
    for (const sub of proposal.tasksToSchedule) {
      expect(sub.estimatedMinutes).toBeLessThanOrEqual(60);
      expect(sub.estimatedMinutes).toBeGreaterThanOrEqual(30);
    }
  });

  it('7. zero-conflict guarantee: scheduled tasks never overlap with school timetable or busy events', () => {
    const timetable: TimetableEntry[] = [
      {
        id: 'tt1',
        dayOfWeek: 3, // Wednesday
        title: 'Học trường',
        startLocalTime: '07:30',
        endLocalTime: '11:45',
        commuteBeforeMinutes: 15,
        commuteAfterMinutes: 15,
      },
    ];

    const busyEvents: BusyEvent[] = [
      {
        id: 'b1',
        userId: 'u1',
        type: 'extra_class',
        title: 'Học thêm Lý',
        startsAt: '2026-08-26T14:00:00.000+07:00',
        endsAt: '2026-08-26T16:00:00.000+07:00',
        timezone: 'Asia/Ho_Chi_Minh',
        isFixed: true,
      },
    ];

    const tasks: StudyTask[] = [
      { id: 'task_1', userId: 'u1', subjectId: 's1', title: 'Tự học 1', estimatedMinutes: 45, status: 'pending', priority: 'high', difficulty: 'medium', splittable: false, locked: false, completionPercent: 0 },
      { id: 'task_2', userId: 'u1', subjectId: 's1', title: 'Tự học 2', estimatedMinutes: 45, status: 'pending', priority: 'medium', difficulty: 'medium', splittable: false, locked: false, completionPercent: 0 },
    ];

    const proposal = DeterministicScheduler.generateScheduleProposal(
      tasks,
      [],
      busyEvents,
      timetable,
      defaultProfile,
      new Date('2026-08-26T00:00:00.000+07:00'),
      1
    );

    // Verify all scheduled tasks
    for (const st of proposal.tasksToSchedule) {
      const taskStart = new Date(st.proposedStart);
      const taskEnd = new Date(st.proposedEnd);

      // Verify no overlap with school timetable
      const schoolStart = new Date('2026-08-26T07:15:00.000+07:00'); // 07:30 - 15m commute
      const schoolEnd = new Date('2026-08-26T12:00:00.000+07:00');   // 11:45 + 15m commute
      const schoolOverlap = taskStart < schoolEnd && taskEnd > schoolStart;
      expect(schoolOverlap).toBe(false);

      // Verify no overlap with extra class
      const extraStart = new Date(busyEvents[0].startsAt);
      const extraEnd = new Date(busyEvents[0].endsAt);
      const extraOverlap = taskStart < extraEnd && taskEnd > extraStart;
      expect(extraOverlap).toBe(false);
    }
  });
});
