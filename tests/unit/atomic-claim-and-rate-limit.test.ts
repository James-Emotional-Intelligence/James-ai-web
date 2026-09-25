import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jamiActionService } from '../../server/services/jami-action-service';
import { db } from '../../server/db/mysql';
import { notificationRepo } from '../../server/repositories/notification-repository';
import { createAuthRateLimiter, aiRateLimiter } from '../../server/middleware/rate-limit';

describe('Atomic Proposal Claiming Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prevents double-confirmation race conditions via atomic status check', async () => {
    // Save a proposal in memory demo list
    vi.spyOn(db, 'isHealthy').mockReturnValue(false);
    vi.spyOn(notificationRepo, 'savePushSubscription').mockResolvedValue({} as any);

    const proposal = await jamiActionService.saveProposal('user_race_1', {
      actionType: 'create_reminder',
      previewText: 'Create Reminder Test',
      payload: { title: 'Ôn tập toán', scheduledFor: '2030-01-01T20:00:00+07:00', priority: 'medium' },
    });

    expect(proposal.status).toBe('pending');

    // First confirm call
    const firstResult = await jamiActionService.handleProposalDecision('user_race_1', 'confirm', proposal.id);
    expect(firstResult.success).toBe(true);

    // Second confirm call should detect proposal is already confirmed / not pending
    const secondResult = await jamiActionService.handleProposalDecision('user_race_1', 'confirm', proposal.id);
    expect(secondResult.isAlreadyConfirmed).toBe(true);
  });
});

describe('Dual-Bucket Auth Rate Limiter & AI Concurrency Tests', () => {
  it('creates auth rate limiter with IP and Email dual buckets', () => {
    const limiter = createAuthRateLimiter({
      ipWindowMs: 60 * 1000,
      ipMaxRequests: 20,
      emailWindowMs: 60 * 1000,
      emailMaxRequests: 5,
    });

    expect(typeof limiter).toBe('function');
  });

  it('aiRateLimiter middleware exists and handles express middleware signature', () => {
    expect(typeof aiRateLimiter).toBe('function');
    const req: any = {
      ip: '127.0.0.1',
      headers: {},
      session: { userId: 'u1' },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      setHeader: vi.fn(),
    };
    const next = vi.fn();

    aiRateLimiter(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
