import { describe, it, expect, beforeEach } from 'vitest';
import { focusRepo } from '../../server/repositories/focus-repository';
import { FocusSessionStartSchema, FocusSessionActionSchema } from '../../shared/schemas';

describe('Focus Session & State Machine Unit Tests', () => {
  const userId = 'usr_unit_focus_test';

  beforeEach(() => {
    focusRepo.seedDemo(userId, []);
  });

  describe('1. State Machine Transitions & Single Active Session', () => {
    it('starts a new focus session in running state with target_end_at', async () => {
      const session = await focusRepo.startSession(userId, undefined, '25_5', 25);

      expect(session.id).toBeDefined();
      expect(session.state).toBe('running');
      expect(session.plannedMinutes).toBe(25);
      expect(session.targetEndAt).toBeDefined();
      expect(session.actualFocusSeconds).toBe(0);

      const active = await focusRepo.getCurrentSession(userId);
      expect(active?.id).toBe(session.id);
      expect(active?.state).toBe('running');
    });

    it('auto-abandons prior active session when starting a new one (single active session constraint)', async () => {
      const session1 = await focusRepo.startSession(userId, undefined, '25_5', 25);
      expect(session1.state).toBe('running');

      const session2 = await focusRepo.startSession(userId, undefined, '45_10', 45);
      expect(session2.state).toBe('running');

      const oldSession = await focusRepo.getSessionById(userId, session1.id);
      expect(oldSession?.state).toBe('abandoned');

      const current = await focusRepo.getCurrentSession(userId);
      expect(current?.id).toBe(session2.id);
    });

    it('pauses and resumes a running session with accurate remaining seconds', async () => {
      const session = await focusRepo.startSession(userId, undefined, '25_5', 25);

      const paused = await focusRepo.pauseSession(userId, session.id);
      expect(paused.state).toBe('paused');
      expect(paused.pauseCount).toBe(1);
      expect(paused.remainingSecondsAtPause).toBeDefined();

      const resumed = await focusRepo.resumeSession(userId, session.id);
      expect(resumed.state).toBe('running');
      expect(resumed.targetEndAt).toBeDefined();
    });

    it('rejects invalid state transitions (e.g. pausing an already paused session or resuming running session)', async () => {
      const session = await focusRepo.startSession(userId, undefined, '25_5', 25);
      await focusRepo.pauseSession(userId, session.id);

      await expect(focusRepo.pauseSession(userId, session.id)).rejects.toThrow();
      await focusRepo.resumeSession(userId, session.id);
      await expect(focusRepo.resumeSession(userId, session.id)).rejects.toThrow();
    });

    it('completes session idempotently with calculated actual minutes', async () => {
      const session = await focusRepo.startSession(userId, undefined, '25_5', 25);

      const completed = await focusRepo.completeSession(userId, session.id, 'Hoàn thành tốt');
      expect(completed.state).toBe('completed');
      expect(completed.notes).toBe('Hoàn thành tốt');
      expect(completed.outcome).toBe('completed_full');

      // Second complete call should return same completed session without error
      const completedAgain = await focusRepo.completeSession(userId, session.id);
      expect(completedAgain.state).toBe('completed');
    });

    it('abandons a session cleanly', async () => {
      const session = await focusRepo.startSession(userId, undefined, '25_5', 25);
      const abandoned = await focusRepo.abandonSession(userId, session.id, 'Hủy do có việc đột xuất');

      expect(abandoned.state).toBe('abandoned');
      expect(abandoned.outcome).toBe('early_exit');

      const current = await focusRepo.getCurrentSession(userId);
      expect(current).toBeNull();
    });
  });

  describe('2. Validation Schemas', () => {
    it('validates start session schema with custom boundaries', () => {
      const valid = FocusSessionStartSchema.safeParse({
        mode: 'custom',
        minutes: 40,
        breakMinutes: 8,
      });
      expect(valid.success).toBe(true);

      const invalidMin = FocusSessionStartSchema.safeParse({
        mode: 'custom',
        minutes: 2, // below min 5
      });
      expect(invalidMin.success).toBe(false);

      const invalidMax = FocusSessionStartSchema.safeParse({
        mode: 'custom',
        minutes: 240, // above max 180
      });
      expect(invalidMax.success).toBe(false);
    });

    it('validates action notes schema', () => {
      const valid = FocusSessionActionSchema.safeParse({
        notes: 'Ghi chú bài học hôm nay',
      });
      expect(valid.success).toBe(true);

      const tooLong = FocusSessionActionSchema.safeParse({
        notes: 'a'.repeat(1500),
      });
      expect(tooLong.success).toBe(false);
    });
  });
});
