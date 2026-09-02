import { describe, it, expect } from 'vitest';
import {
  TaskCreateSchema,
  TaskUpdateSchema,
  ExecutionGuideOutputSchema,
  ChecklistItemUpdateSchema,
  StepActionSchema,
  TaskEvidenceSubmitSchema,
} from '../../shared/schemas';
import { AiAdapter } from '../../server/services/ai-adapter';

describe('Task Execution Unit Tests', () => {
  describe('1. Schema Validations', () => {
    it('validates task creation with required fields and defaults', () => {
      const valid = TaskCreateSchema.safeParse({
        title: 'Ôn tập Hóa học Hữu cơ lớp 11',
        subjectId: 'subj-chem',
        estimatedMinutes: 50,
        priority: 'high',
      });
      expect(valid.success).toBe(true);

      const invalidTitle = TaskCreateSchema.safeParse({
        title: '',
        subjectId: 'subj-chem',
      });
      expect(invalidTitle.success).toBe(false);

      const invalidMinTime = TaskCreateSchema.safeParse({
        title: 'Bài tập',
        subjectId: 'subj-chem',
        estimatedMinutes: 2, // below min 5
      });
      expect(invalidMinTime.success).toBe(false);
    });

    it('validates step action and checklist item schemas', () => {
      const stepValid = StepActionSchema.safeParse({
        status: 'completed',
        actualMinutes: 15,
      });
      expect(stepValid.success).toBe(true);

      const chkValid = ChecklistItemUpdateSchema.safeParse({
        checked: true,
      });
      expect(chkValid.success).toBe(true);
    });

    it('validates evidence and reflection submission schema with link and file types', () => {
      const validText = TaskEvidenceSubmitSchema.safeParse({
        rating: 5,
        evidenceNote: 'Đã giải xong toàn bộ 10 bài tập trong sách giáo khoa.',
        type: 'text',
      });
      expect(validText.success).toBe(true);

      const validLink = TaskEvidenceSubmitSchema.safeParse({
        rating: 4,
        evidenceNote: 'Xem bài làm trực tuyến qua link Google Docs đính kèm.',
        type: 'link',
        fileUrl: 'https://docs.google.com/document/d/12345/edit',
      });
      expect(validLink.success).toBe(true);

      const validFile = TaskEvidenceSubmitSchema.safeParse({
        rating: 5,
        evidenceNote: 'Đã đính kèm tệp PDF bài tập.',
        type: 'file',
        fileUrl: '/api/v1/materials/mat_123/content',
      });
      expect(validFile.success).toBe(true);

      const invalidRating = TaskEvidenceSubmitSchema.safeParse({
        rating: 6, // above max 5
        evidenceNote: 'Note',
      });
      expect(invalidRating.success).toBe(false);
    });
  });

  describe('2. AI Execution Guide Generation (Dynamic & Tailored)', () => {
    it('generates execution guide with accurate step planned minutes summing to task estimatedMinutes', async () => {
      const task = {
        id: 'task_physics_test',
        title: 'Thực hành thí nghiệm Dao động cơ',
        subjectName: 'Vật lý',
        estimatedMinutes: 60,
      };

      const guide = await AiAdapter.generateExecutionGuide(task, 11, 'Vật lý');

      expect(guide.taskId).toBe(task.id);
      expect(guide.steps).toBeDefined();
      expect(guide.steps.length).toBeGreaterThanOrEqual(3);
      expect(guide.preparationChecklist.length).toBeGreaterThanOrEqual(3);

      const totalPlanned = guide.steps.reduce((acc: number, s: any) => acc + s.plannedMinutes, 0);
      expect(totalPlanned).toBe(60);

      // Verify no hardcoded "Toán 9" in physics task
      expect(guide.whyItMatters).not.toContain('Toán học 9');
    });
  });
});
