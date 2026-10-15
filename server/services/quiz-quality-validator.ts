import { z } from 'zod';
import { QuizDraftSchema } from '../../shared/schemas';

export type QuizDraft = z.infer<typeof QuizDraftSchema>;

/** Structural gate only. Factual accuracy still requires subject review. */
export function validateQuizDraft(draft: QuizDraft, expected: { count: number; topics?: string[] }): string[] {
  const issues: string[] = [];
  if (draft.questions.length !== expected.count) issues.push('Sai số lượng câu hỏi');
  const seen = new Set<string>();
  for (const [index, question] of draft.questions.entries()) {
    const label = `Câu ${index + 1}`;
    const prompt = question.prompt.trim();
    if (prompt.length < 12 || /phương án [a-d] cho câu hỏi|vận dụng kiến thức chủ đề/i.test(prompt)) issues.push(`${label}: nội dung chung chung`);
    const normalized = prompt.toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ');
    if (seen.has(normalized)) issues.push(`${label}: trùng câu hỏi`);
    seen.add(normalized);
    if (!question.explanation.trim() || !question.correctAnswer.trim()) issues.push(`${label}: thiếu đáp án hoặc lời giải`);
    if (expected.topics?.length && !expected.topics.some((topic) => topic.toLocaleLowerCase('vi-VN') === question.topicRef.trim().toLocaleLowerCase('vi-VN'))) issues.push(`${label}: sai chủ đề`);
    if (question.type === 'multiple_choice') {
      const options = question.options || [];
      const ids = options.map((option) => option.id.trim().toUpperCase());
      if (options.length !== 4 || new Set(ids).size !== 4 || ids.some((id) => !['A', 'B', 'C', 'D'].includes(id))) issues.push(`${label}: lựa chọn không hợp lệ`);
      if (!ids.includes(question.correctAnswer.trim().toUpperCase())) issues.push(`${label}: đáp án không khớp lựa chọn`);
      if (options.some((option) => !option.text.trim()) || new Set(options.map((option) => option.text.trim().toLocaleLowerCase('vi-VN'))).size !== options.length) issues.push(`${label}: lựa chọn rỗng hoặc trùng`);
    }
  }
  return issues;
}
