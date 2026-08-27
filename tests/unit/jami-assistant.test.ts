import { describe, it, expect } from 'vitest';
import { AiAdapter } from '../../server/services/ai-adapter';
import { JamiChatRequestSchema, JamiConversationCreateSchema } from '../../shared/schemas';

describe('Jami Assistant Unit Tests', () => {
  describe('1. Dynamic Context & Zero Hardcoding', () => {
    it('uses real student name and context in fallback without hardcoded Minh', async () => {
      const context = {
        studentName: 'Khánh Linh',
        gradeLevel: 10,
        todaySessions: [{ title: 'Học Vật Lý', time: '14:00 - 15:30' }],
        pendingTasks: [{ id: 'tsk_1', title: 'Bài tập Sóng Ánh Sáng', subject: 'Vật Lý', estimatedMinutes: 45 }],
      };

      const res = await AiAdapter.generateJamiChat('Hôm nay em học gì thế Jami?', context);

      expect(res.message).toContain('Khánh Linh');
      expect(res.message).not.toContain('Minh');
      expect(res.message).toContain('Học Vật Lý');
      expect(res.message).toContain('Bài tập Sóng Ánh Sáng');
    });

    it('flags rescheduling intent with requiresConfirmation = true', async () => {
      const context = {
        studentName: 'Hoàng Nam',
      };

      const res = await AiAdapter.generateJamiChat('Tối nay em bận rồi, dời lịch giúp em', context);

      expect(res.requiresConfirmation).toBe(true);
      expect(res.confirmationSummary).toBeDefined();
      expect(res.confirmationSummary).toContain('Hoàng Nam');
    });
  });

  describe('2. Schemas & Validation', () => {
    it('validates JamiChatRequestSchema correctly', () => {
      const valid = JamiChatRequestSchema.safeParse({
        message: 'Jami ơi, giải thích công thức lượng giác giúp em',
        conversationId: 'conv_123',
      });
      expect(valid.success).toBe(true);

      const invalid = JamiChatRequestSchema.safeParse({
        message: '',
      });
      expect(invalid.success).toBe(false);
    });

    it('validates JamiConversationCreateSchema with default title', () => {
      const parsed = JamiConversationCreateSchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.title).toBe('Hội thoại với Jami');
      }
    });
  });
});
