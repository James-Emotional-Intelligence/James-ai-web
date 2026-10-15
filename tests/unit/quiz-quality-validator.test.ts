import { describe, expect, it } from 'vitest';
import { validateQuizDraft } from '../../server/services/quiz-quality-validator';
import { AiAdapter } from '../../server/services/ai-adapter';
import { equivalentObjectiveAnswer } from '../../server/services/short-answer-normalizer';

const validDraft = {
  title: 'Đề Toán 7', sourceScope: 'Phân số', learningObjectives: ['Cộng phân số'],
  questions: [{ type: 'multiple_choice' as const, prompt: 'Tính tổng của 1/2 và 1/4 bằng bao nhiêu?',
    options: [{ id: 'A', text: '3/4' }, { id: 'B', text: '2/6' }, { id: 'C', text: '1/8' }, { id: 'D', text: '1/6' }],
    correctAnswer: 'A', explanation: 'Quy đồng thành 2/4 + 1/4 = 3/4.', difficulty: 'easy' as const, topicRef: 'Phân số' }],
};

describe('quiz quality gate', () => {
  it('accepts a structurally complete draft', () => {
    expect(validateQuizDraft(validDraft, { count: 1, topics: ['Phân số'] })).toEqual([]);
  });

  it('rejects placeholders, wrong count and invalid answer references', () => {
    const draft = { ...validDraft, questions: [{ ...validDraft.questions[0], prompt: 'Vận dụng kiến thức chủ đề Phân số', correctAnswer: 'Z' }] };
    expect(validateQuizDraft(draft, { count: 20, topics: ['Hình học'] }).length).toBeGreaterThanOrEqual(3);
  });

  it('does not award a substring answer when AI is unavailable', async () => {
    const graded = await AiAdapter.gradeShortAnswer({ questionPrompt: 'Tên đầy đủ?', userAnswer: 'Hà', correctAnswer: 'Hà Nội' });
    expect(graded.isCorrect).toBe(false);
    expect(graded.scorePercent).toBe(0);
    expect(graded.needsReview).toBe(true);
  });

  it('normalizes objective fractions, decimal commas and angle units', () => {
    expect(equivalentObjectiveAnswer('\\frac{5}{6}', '5/6')).toBe(true);
    expect(equivalentObjectiveAnswer('0,75', '3/4')).toBe(true);
    expect(equivalentObjectiveAnswer('70 độ', '70°')).toBe(true);
    expect(equivalentObjectiveAnswer('24', '24 cm')).toBe(false);
  });
});
