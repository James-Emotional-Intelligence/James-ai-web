import { describe, it, expect } from 'vitest';
import { examRepo } from '../../server/repositories/exam-repository';
import { quizRepo } from '../../server/repositories/quiz-repository';
import { AiAdapter } from '../../server/services/ai-adapter';

describe('Exam Milestones & Quiz Revision Unit Tests', () => {
  describe('1. Exam Milestone Date and Status Computation', () => {
    it('computes 4 milestone target dates (D-14, D-7, D-3, D-1) accurately', () => {
      const examDate = new Date(Date.now() + 10 * 86400000).toISOString(); // 10 days from now
      const milestones = examRepo.computeMilestones('exam_test_1', examDate);

      expect(milestones.length).toBe(4);
      expect(milestones[0].milestoneType).toBe('D-14');
      expect(milestones[1].milestoneType).toBe('D-7');
      expect(milestones[2].milestoneType).toBe('D-3');
      expect(milestones[3].milestoneType).toBe('D-1');

      // Milestone D-14 date should be examDate - 14 days
      const d14Date = new Date(milestones[0].date).getTime();
      const examTime = new Date(examDate).getTime();
      expect(Math.round((examTime - d14Date) / 86400000)).toBe(14);
    });

    it('marks milestone completed when submitted quiz milestone is present', () => {
      const examDate = new Date(Date.now() + 10 * 86400000).toISOString();
      const completedSet = new Set(['D-7']);
      const milestones = examRepo.computeMilestones('exam_test_2', examDate, completedSet);

      const d7 = milestones.find((m) => m.milestoneType === 'D-7');
      expect(d7?.status).toBe('completed');
    });
  });

  describe('2. Security: Anti-Cheat Question Sanitization', () => {
    it('never leaks correctAnswer or explanation when includeAnswers is false', async () => {
      const userId = 'usr_sec_test';
      const quizId = 'quiz_sec_test';

      const questions = await quizRepo.getQuizQuestions(userId, quizId, false);
      for (const q of questions) {
        expect(q.correctAnswer).toBeUndefined();
        expect(q.explanation).toBeUndefined();
      }
    });
  });

  describe('3. Short Answer Evaluation Rubric', () => {
    it('accurately scores exact match short answer', async () => {
      const result = await AiAdapter.gradeShortAnswer({
        questionPrompt: 'Nêu công thức phương trình đường thẳng bậc nhất',
        userAnswer: 'y = ax + b',
        correctAnswer: 'y = ax + b',
      });

      expect(result.isCorrect).toBe(true);
      expect(result.scorePercent).toBe(100);
    });
  });
});
