import { describe, it, expect, beforeEach } from 'vitest';
import { jamiActionService, ALLOWED_NAVIGATE_ROUTES } from '../../server/services/jami-action-service';
import { taskRepo } from '../../server/repositories/task-repository';
import { focusRepo } from '../../server/repositories/focus-repository';
import { timetableRepo } from '../../server/repositories/timetable-repository';

describe('Jami Action Service Unit Tests', () => {
  const userId = 'usr_student_test_action_01';

  beforeEach(() => {
    // Seed test data in repositories
    taskRepo.seedDemo(userId, [
      {
        id: 'task_unit_1',
        userId,
        subjectId: 'sub_toan',
        subjectName: 'Toán học',
        title: 'Hàm số bậc nhất',
        status: 'pending',
        priority: 'high',
        difficulty: 'medium',
        estimatedMinutes: 45,
        splittable: false,
        locked: false,
        completionPercent: 0,
      },
    ]);
  });

  it('validates allowlist routes for navigate_to tool', async () => {
    const validRes = await jamiActionService.executeTool(userId, 'navigate_to', { route: '/timetable' });
    expect(validRes.success).toBe(true);
    expect(validRes.clientAction?.route).toBe('/timetable');

    const invalidRes = await jamiActionService.executeTool(userId, 'navigate_to', { route: '/admin-secret-page' });
    expect(invalidRes.success).toBe(false);
    expect(invalidRes.message).toContain('không hợp lệ');
  });

  it('contains all 10 core application routes in allowlist', () => {
    expect(ALLOWED_NAVIGATE_ROUTES).toContain('/today');
    expect(ALLOWED_NAVIGATE_ROUTES).toContain('/timetable');
    expect(ALLOWED_NAVIGATE_ROUTES).toContain('/tasks');
    expect(ALLOWED_NAVIGATE_ROUTES).toContain('/focus');
    expect(ALLOWED_NAVIGATE_ROUTES).toContain('/exams');
    expect(ALLOWED_NAVIGATE_ROUTES).toContain('/materials');
    expect(ALLOWED_NAVIGATE_ROUTES).toContain('/reports');
    expect(ALLOWED_NAVIGATE_ROUTES).toContain('/notifications');
    expect(ALLOWED_NAVIGATE_ROUTES).toContain('/settings');
    expect(ALLOWED_NAVIGATE_ROUTES).toContain('/jami');
  });

  it('creates focus timer session and returns client route /focus', async () => {
    const res = await jamiActionService.executeTool(userId, 'start_focus_timer', { plannedMinutes: 30 });
    expect(res.success).toBe(true);
    expect(res.clientAction?.type).toBe('focus_timer');
    expect(res.clientAction?.route).toBe('/focus');

    const active = await focusRepo.getCurrentActiveSession(userId);
    expect(active).not.toBeNull();
    expect(active?.plannedMinutes).toBe(30);
  });

  it('generates preview and requires confirmation for task creation', async () => {
    const previewRes = await jamiActionService.executeTool(userId, 'preview_create_task', {
      title: 'Luyện đề hình học',
      subjectName: 'Toán học',
      estimatedMinutes: 45,
    });

    expect(previewRes.success).toBe(true);
    expect(previewRes.requiresConfirmation).toBe(true);
    expect(previewRes.proposal).toBeDefined();

    // Check that task is not yet in taskRepo before confirmation
    const tasksBefore = await taskRepo.getByUserId(userId);
    const existing = tasksBefore.find((t) => t.title === 'Luyện đề hình học');
    expect(existing).toBeUndefined();

    // Now confirm the proposal
    const confirmRes = await jamiActionService.handleProposalDecision(userId, 'confirm', previewRes.proposal?.id);
    expect(confirmRes.success).toBe(true);
    expect(confirmRes.message).toContain('Luyện đề hình học');

    // Verify task is now saved
    const tasksAfter = await taskRepo.getByUserId(userId);
    const created = tasksAfter.find((t) => t.title === 'Luyện đề hình học');
    expect(created).toBeDefined();
    expect(created?.estimatedMinutes).toBe(45);
  });

  it('rejects proposal when decision is reject', async () => {
    const previewRes = await jamiActionService.executeTool(userId, 'preview_create_task', {
      title: 'Nhiệm vụ bị từ chối',
      subjectName: 'Ngữ văn',
      estimatedMinutes: 30,
    });

    const rejectRes = await jamiActionService.handleProposalDecision(userId, 'reject', previewRes.proposal?.id);
    expect(rejectRes.success).toBe(true);
    expect(rejectRes.message).toContain('Đã hủy');

    const tasks = await taskRepo.getByUserId(userId);
    expect(tasks.find((t) => t.title === 'Nhiệm vụ bị từ chối')).toBeUndefined();
  });

  it('rejects confirmation when proposal belongs to another user', async () => {
    const otherUserId = 'usr_other_hacker_99';
    const previewRes = await jamiActionService.executeTool(userId, 'preview_create_task', {
      title: 'Bài tập riêng của User 1',
      subjectName: 'Vật lý',
    });

    const maliciousRes = await jamiActionService.handleProposalDecision(otherUserId, 'confirm', previewRes.proposal?.id);
    expect(maliciousRes.success).toBe(false);
    expect(maliciousRes.message).toContain('không thuộc quyền sở hữu');
  });

  it('fails safely when proposalId is missing or invalid', async () => {
    const emptyRes = await jamiActionService.handleProposalDecision(userId, 'confirm', undefined);
    expect(emptyRes.success).toBe(false);
    expect(emptyRes.message).toContain('Yêu cầu mã định danh đề xuất');

    const nonExistentRes = await jamiActionService.handleProposalDecision(userId, 'confirm', 'prop_fake_not_found');
    expect(nonExistentRes.success).toBe(false);
    expect(nonExistentRes.message).toContain('Không tìm thấy đề xuất');
  });

  it('handles duplicate confirmations idempotently without creating duplicate items', async () => {
    const previewRes = await jamiActionService.executeTool(userId, 'preview_create_task', {
      title: 'Bài tập duy nhất không trùng',
      subjectName: 'Toán học',
      estimatedMinutes: 30,
    });

    const firstConfirm = await jamiActionService.handleProposalDecision(userId, 'confirm', previewRes.proposal?.id);
    expect(firstConfirm.success).toBe(true);

    const secondConfirm = await jamiActionService.handleProposalDecision(userId, 'confirm', previewRes.proposal?.id);
    expect(secondConfirm.success).toBe(true);
    expect(secondConfirm.isAlreadyConfirmed).toBe(true);

    const tasks = await taskRepo.getByUserId(userId);
    const matched = tasks.filter((t) => t.title === 'Bài tập duy nhất không trùng');
    expect(matched.length).toBe(1);
  });

  it('creates real reminders via Jami action service', async () => {
    const previewRes = await jamiActionService.executeTool(userId, 'preview_create_reminder', {
      content: 'Nhớ làm bài tập Văn trước 8h tối',
      timeStr: '20:00',
    });

    expect(previewRes.success).toBe(true);
    expect(previewRes.requiresConfirmation).toBe(true);

    const confirmRes = await jamiActionService.handleProposalDecision(userId, 'confirm', previewRes.proposal?.id);
    expect(confirmRes.success).toBe(true);
    expect(confirmRes.clientAction?.route).toBe('/notifications');
  });
});
