import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { authService } from '../../server/services/auth-service';
import { taskRepo } from '../../server/repositories/task-repository';
import { subjectRepo } from '../../server/repositories/subject-repository';

describe('Jami Assistant Integration Tests', () => {
  const app = createApp();
  let userAId: string;
  let userASession: string;
  let userBId: string;
  let userBSession: string;
  let conversationId: string;
  let messageWithProposalId: string;

  beforeAll(async () => {
    // 1. Register User A
    const regA = await authService.registerAtomic({
      email: `user.jami.a.${Date.now()}@jami.edu.vn`,
      password: 'Password123!',
      displayName: 'Nguyễn Thảo',
      preferredName: 'Thảo',
      gradeLevel: 10,
    });
    userAId = regA.user.id;
    userASession = `jami_session=${regA.rawToken}`;

    // 2. Register User B
    const regB = await authService.registerAtomic({
      email: `user.jami.b.${Date.now()}@jami.edu.vn`,
      password: 'Password123!',
      displayName: 'Học sinh B',
      preferredName: 'Bình',
      gradeLevel: 10,
    });
    userBId = regB.user.id;
    userBSession = `jami_session=${regB.rawToken}`;

    // 3. Create Subject and Task for User A
    const subj = await subjectRepo.create(userAId, {
      name: 'Hóa học',
      color: '#3B82F6',
    });

    await taskRepo.createTask(userAId, {
      title: 'Luyện tập Cân bằng phương trình Hóa học',
      subjectId: subj.id,
      estimatedMinutes: 40,
      priority: 'high',
    });
  });

  it('1. POST /api/v1/jami/conversations creates a new conversation', async () => {
    const res = await request(app)
      .post('/api/v1/jami/conversations')
      .set('Cookie', [userASession])
      .send({ title: 'Kế hoạch học tập tuần này' });

    expect(res.status).toBe(200);
    expect(res.body.conversation).toBeDefined();
    expect(res.body.conversation.title).toBe('Kế hoạch học tập tuần này');
    expect(res.body.conversation.userId).toBe(userAId);

    conversationId = res.body.conversation.id;
  });

  it('2. POST /api/v1/jami/chat answers using real user context (name and tasks)', async () => {
    const res = await request(app)
      .post('/api/v1/jami/chat')
      .set('Cookie', [userASession])
      .send({
        conversationId,
        message: 'Hôm nay em có những bài tập nào vậy Jami?',
      });

    expect(res.status).toBe(200);
    expect(res.body.userMessage).toBeDefined();
    expect(res.body.userMessage.text).toContain('Hôm nay em có những bài tập nào');
    expect(res.body.replyMessage).toBeDefined();
    expect(res.body.replyMessage.text).toContain('Thảo');
    expect(res.body.replyMessage.text).not.toContain('Minh');
  });

  it('3. POST /api/v1/jami/chat creates action proposal for rescheduling', async () => {
    const res = await request(app)
      .post('/api/v1/jami/chat')
      .set('Cookie', [userASession])
      .send({
        conversationId,
        message: 'Tối nay em bận đột xuất, hãy dời bài tập giúp em',
      });

    expect(res.status).toBe(200);
    expect(res.body.replyMessage).toBeDefined();

    messageWithProposalId = res.body.replyMessage.id;
  });

  it('4. POST /api/v1/jami/messages/:id/confirm confirms action and updates message state', async () => {
    const res = await request(app)
      .post(`/api/v1/jami/messages/${messageWithProposalId}/confirm`)
      .set('Cookie', [userASession])
      .send({ decision: 'confirm' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBeDefined();
    expect(res.body.message.isConfirmed).toBe(true);
  });

  it('5. User B cannot access or confirm User A messages or conversations', async () => {
    const res = await request(app)
      .get(`/api/v1/jami/conversations/${conversationId}/messages`)
      .set('Cookie', [userBSession]);

    // Should return empty list because conversation belongs to User A
    expect(res.status).toBe(200);
    expect(res.body.messages.length).toBe(0);

    const confirmRes = await request(app)
      .post(`/api/v1/jami/messages/${messageWithProposalId}/confirm`)
      .set('Cookie', [userBSession])
      .send({ decision: 'confirm' });

    expect(confirmRes.status).toBe(400);
  });

  it('6. POST /api/v1/jami/messages/:id/confirm rejects with 409 PROPOSAL_MISSING when message has no proposal', async () => {
    // Send standard conversational message that does not generate an action proposal
    const chatRes = await request(app)
      .post('/api/v1/jami/chat')
      .set('Cookie', [userASession])
      .send({
        conversationId,
        message: 'Xin chào Jami, hôm nay thời tiết thế nào?',
      });

    expect(chatRes.status).toBe(200);
    const standardMessageId = chatRes.body.replyMessage.id;
    expect(chatRes.body.replyMessage.proposalId).toBeUndefined();

    // Attempting to confirm a message without a proposal must fail closed (409)
    const confirmRes = await request(app)
      .post(`/api/v1/jami/messages/${standardMessageId}/confirm`)
      .set('Cookie', [userASession])
      .send({ decision: 'confirm' });

    expect(confirmRes.status).toBe(409);
    expect(confirmRes.body.error?.code).toBe('PROPOSAL_MISSING');
  });
});
