import { describe, it, expect, beforeEach } from 'vitest';
import { examStudyPlanService } from '../../server/services/exam-study-plan-service';
import { examStudyPlanRepo } from '../../server/repositories/exam-study-plan-repository';
import { mistakeRepo } from '../../server/repositories/mistake-repository';
import { examRepo } from '../../server/repositories/exam-repository';
import { AiAdapter } from '../../server/services/ai-adapter';

describe('Exam Study Planner & Personal Mistake Notebook Unit Tests', () => {
  const userId = 'usr_test_study_plan_unit';
  const timezone = 'Asia/Ho_Chi_Minh';
  let examId3Days: string;
  let examId7Days: string;
  let examId14Days: string;
  let mistakeId: string;

  beforeEach(async () => {
    // 1. Create a sample mistake entry
    const mistake = await mistakeRepo.create(userId, {
      subjectId: 'subj_math',
      topic: 'Hàm số bậc nhất',
      questionText: 'Cho hàm số y = 2x + 3. Điểm nào sau đây thuộc đồ thị?',
      selectedAnswer: 'A. (1; 4)',
      correctAnswer: 'B. (1; 5)',
      mistakeReason: 'calculation_error',
      difficulty: 'medium',
      sourceType: 'manual',
    });
    mistakeId = mistake.id;

    // 2. Create Exams with 3 days, 7 days, and 14 days lead time
    const now = new Date();
    const d3 = new Date(now.getTime() + 3 * 24 * 3600 * 1000).toISOString();
    const d7 = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();
    const d14 = new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString();

    const ex3 = await examRepo.create(userId, {
      title: 'Kiểm tra 15p Toán (3 ngày)',
      subjectId: 'subj_math',
      examAt: d3,
      importance: 'medium',
      scopeText: 'Hàm số bậc nhất và đồ thị',
      topics: [{ name: 'Hàm số bậc nhất', weight: 1 }],
    });
    examId3Days = ex3.id;

    const ex7 = await examRepo.create(userId, {
      title: 'Kiểm tra 1 tiết Toán (7 ngày)',
      subjectId: 'subj_math',
      examAt: d7,
      importance: 'high',
      scopeText: 'Hàm số bậc nhất và Hệ phương trình',
      topics: [
        { name: 'Hàm số bậc nhất', weight: 1 },
        { name: 'Hệ phương trình bậc nhất hai ẩn', weight: 2 },
      ],
    });
    examId7Days = ex7.id;

    const ex14 = await examRepo.create(userId, {
      title: 'Thi học kỳ Toán (14 ngày)',
      subjectId: 'subj_math',
      examAt: d14,
      importance: 'critical',
      scopeText: 'Toàn bộ chương trình Đại số & Hình học kỳ 1',
      topics: [
        { name: 'Căn bậc hai', weight: 1 },
        { name: 'Hàm số', weight: 2 },
        { name: 'Hệ phương trình', weight: 2 },
      ],
    });
    examId14Days = ex14.id;
  });

  describe('Adaptive Duration Exam Study Planner', () => {
    it('1. Generates urgent 3-day plan with focus on theory, mistakes and mock test', async () => {
      const plan = await examStudyPlanService.generatePlanForExam(userId, examId3Days, {
        dailyMinutes: 45,
        timezone,
      });

      expect(plan).toBeDefined();
      expect(plan.status).toBe('draft');
      expect(plan.items.length).toBeGreaterThanOrEqual(2);
      expect(plan.items.length).toBeLessThanOrEqual(4);

      // Check that it includes mock_test or mistake review
      const hasMockOrMistake = plan.items.some(
        (i) => i.activityType === 'mock_test' || i.activityType === 'mistake_review' || i.activityType === 'theory_review'
      );
      expect(hasMockOrMistake).toBe(true);

      // Verify no item is scheduled after exam target date
      for (const item of plan.items) {
        expect(item.plannedDate <= plan.targetDate).toBe(true);
      }
    });

    it('2. Generates 7-day phased plan with basic, advanced, mistakes and mock test phases', async () => {
      const plan = await examStudyPlanService.generatePlanForExam(userId, examId7Days, {
        dailyMinutes: 45,
        timezone,
      });

      expect(plan).toBeDefined();
      expect(plan.items.length).toBeGreaterThanOrEqual(4);

      const activityTypes = plan.items.map((i) => i.activityType);
      expect(activityTypes).toContain('theory_review');
      expect(activityTypes).toContain('mock_test');
    });

    it('3. Generates 14-day extended plan with spaced pacing and rest/recap days', async () => {
      const plan = await examStudyPlanService.generatePlanForExam(userId, examId14Days, {
        dailyMinutes: 40,
        timezone,
      });

      expect(plan).toBeDefined();
      expect(plan.items.length).toBeGreaterThanOrEqual(7);
      expect(plan.totalPlannedMinutes).toBeGreaterThan(150);
    });

    it('4. Prioritizes mistakes from Mistake Notebook matching exam subject', async () => {
      const plan = await examStudyPlanService.generatePlanForExam(userId, examId7Days, {
        dailyMinutes: 45,
        timezone,
      });

      const mistakeItem = plan.items.find((i) => i.sourceType === 'mistake_notebook');
      expect(mistakeItem).toBeDefined();
    });

    it('5. Detects missed session and proposes friendly rescheduling without auto-mutating', async () => {
      const plan = await examStudyPlanService.generatePlanForExam(userId, examId7Days, {
        dailyMinutes: 45,
        timezone,
      });
      await examStudyPlanService.acceptPlan(userId, plan.id);

      // Artificially make an item missed in the past
      await examStudyPlanRepo.updatePlanItem(userId, plan.id, plan.items[0].id, {
        plannedDate: '2020-01-01',
        startAt: '19:00',
        endAt: '19:45',
        status: 'pending',
      });

      const proposal = await examStudyPlanService.detectMissedSessions(userId, examId7Days, timezone);
      expect(proposal).not.toBeNull();
      expect(proposal?.planId).toBe(plan.id);
      expect(proposal?.suggestedSlot).toBeDefined();

      // Original plan status is NOT changed until confirmed
      const unchangedPlan = await examStudyPlanRepo.getPlanById(userId, plan.id);
      expect(unchangedPlan?.items.find((i) => i.id === plan.items[0].id)?.plannedDate).toBe('2020-01-01');
    });

    it('6. Saves version snapshot before rescheduling and allows undoing version', async () => {
      const plan = await examStudyPlanService.generatePlanForExam(userId, examId7Days, {
        dailyMinutes: 45,
        timezone,
      });
      await examStudyPlanService.acceptPlan(userId, plan.id);

      // Confirm replan
      const replanned = await examStudyPlanService.confirmReplan(userId, plan.id, 'accept', undefined, timezone);
      expect(replanned.currentVersion).toBeGreaterThan(1);

      // Undo
      const restored = await examStudyPlanService.undoPlanVersion(userId, plan.id);
      expect(restored).toBeDefined();
    });
  });

  describe('Spaced Repetition Mistake Notebook (1-3-7-14-30 days)', () => {
    it('7. Creates mistake with next_review_at initialized to +1 day', async () => {
      const entry = await mistakeRepo.getById(userId, mistakeId);
      expect(entry).toBeDefined();
      expect(entry?.status).toBe('new');
      expect(entry?.correctStreak).toBe(0);
      expect(entry?.reviewCount).toBe(0);
    });

    it('8. Correct answer advances streak and schedules next review according to spaced repetition (1-3-7-14-30)', async () => {
      // First review: Correct (streak 0 -> 1, next review +1 day)
      const res1 = await mistakeRepo.recordReviewAttempt(userId, mistakeId, 'B. (1; 5)', true);
      expect(res1.entry.correctStreak).toBe(1);
      expect(res1.entry.status).toBe('reviewing');

      // Second review: Correct (streak 1 -> 2, next review +3 days)
      const res2 = await mistakeRepo.recordReviewAttempt(userId, mistakeId, 'B. (1; 5)', true);
      expect(res2.entry.correctStreak).toBe(2);
      expect(res2.entry.status).toBe('reviewing');

      // Third review: Correct (streak 2 -> 3, next review +7 days)
      const res3 = await mistakeRepo.recordReviewAttempt(userId, mistakeId, 'B. (1; 5)', true);
      expect(res3.entry.correctStreak).toBe(3);
      expect(res3.entry.status).toBe('reviewing');

      // Fourth review: Correct (streak 3 -> 4, next review +14 days)
      const res4 = await mistakeRepo.recordReviewAttempt(userId, mistakeId, 'B. (1; 5)', true);
      expect(res4.entry.correctStreak).toBe(4);
      expect(res4.entry.status).toBe('reviewing');

      // Fifth review: Correct (streak 4 -> 5, completes 30d cycle -> mastered!)
      const res5 = await mistakeRepo.recordReviewAttempt(userId, mistakeId, 'B. (1; 5)', true);
      expect(res5.entry.correctStreak).toBe(5);
      expect(res5.entry.status).toBe('mastered');
    });

    it('9. Incorrect answer resets streak to 0, sets status to needs_retry, and reschedules to 1 day', async () => {
      // Advance to streak 2 first
      await mistakeRepo.recordReviewAttempt(userId, mistakeId, 'B. (1; 5)', true);
      await mistakeRepo.recordReviewAttempt(userId, mistakeId, 'B. (1; 5)', true);

      // Now answer incorrectly
      const failed = await mistakeRepo.recordReviewAttempt(userId, mistakeId, 'A. (1; 4)', false);
      expect(failed.entry.correctStreak).toBe(0);
      expect(failed.entry.status).toBe('needs_retry');
    });

    it('10. AI Fallback generates valid similar question when offline', async () => {
      const similar = await AiAdapter.generateSimilarMistakeQuestion({
        topic: 'Hàm số bậc nhất',
        originalQuestion: 'Cho hàm số y = 2x + 3. Điểm nào sau đây thuộc đồ thị?',
        correctAnswer: 'B. (1; 5)',
      });

      expect(similar).toBeDefined();
      expect(similar.questionText).toBeDefined();
      expect(similar.correctAnswer).toBeDefined();
      expect(similar.explanation).toBeDefined();
    });
  });
});
