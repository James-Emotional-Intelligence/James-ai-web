import { describe, it, expect, beforeEach } from 'vitest';
import { jamiActionService, ALLOWED_NAVIGATE_ROUTES, resolveVietnameseDayOfWeek } from '../../server/services/jami-action-service';
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

  it('creates scheduled task with specific start and end times and routes to /timetable', async () => {
    const startTime = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    const previewRes = await jamiActionService.executeTool(userId, 'preview_create_scheduled_task', {
      title: 'Tự học Toán - Chuyên đề Hàm số',
      subjectName: 'Toán học',
      scheduledStartAt: startTime,
      estimatedMinutes: 60,
      priority: 'high',
    });

    expect(previewRes.success).toBe(true);
    expect(previewRes.requiresConfirmation).toBe(true);
    expect(previewRes.proposal).toBeDefined();

    const confirmRes = await jamiActionService.handleProposalDecision(userId, 'confirm', previewRes.proposal?.id);
    expect(confirmRes.success).toBe(true);
    expect(confirmRes.clientAction?.route).toBe('/timetable');

    const tasks = await taskRepo.getByUserId(userId);
    const createdTask = tasks.find((t) => t.title === 'Tự học Toán - Chuyên đề Hàm số');
    expect(createdTask).toBeDefined();
    expect(createdTask?.scheduledStartAt).toBeDefined();
    expect(new Date(createdTask!.scheduledStartAt!).getTime()).toBe(new Date(startTime).getTime());
  });

  it('creates school timetable entry and routes to /timetable', async () => {
    const previewRes = await jamiActionService.executeTool(userId, 'preview_create_timetable_entry', {
      title: 'Vật lý 10',
      subjectName: 'Vật lý',
      dayOfWeek: 3,
      startLocalTime: '08:00',
      endLocalTime: '08:45',
      room: 'Phòng 204',
      teacher: 'Thầy Hưng',
    });

    expect(previewRes.success).toBe(true);
    expect(previewRes.requiresConfirmation).toBe(true);

    const confirmRes = await jamiActionService.handleProposalDecision(userId, 'confirm', previewRes.proposal?.id);
    expect(confirmRes.success).toBe(true);
    expect(confirmRes.clientAction?.route).toBe('/timetable');

    const entries = await timetableRepo.getTimetableEntries(userId);
    const createdEntry = entries.find((e) => e.title === 'Vật lý 10' && e.dayOfWeek === 3);
    expect(createdEntry).toBeDefined();
    expect(createdEntry?.startLocalTime).toBe('08:00');
    expect(createdEntry?.endLocalTime).toBe('08:45');
  });

  it('creates busy event for extra classes and routes to /timetable', async () => {
    const startsAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const endsAt = new Date(Date.now() + 26 * 3600 * 1000).toISOString();
    const previewRes = await jamiActionService.executeTool(userId, 'preview_add_busy_event', {
      title: 'Học thêm Hóa học',
      startsAt,
      endsAt,
      type: 'extra_class',
    });

    expect(previewRes.success).toBe(true);
    const confirmRes = await jamiActionService.handleProposalDecision(userId, 'confirm', previewRes.proposal?.id);
    expect(confirmRes.success).toBe(true);
    expect(confirmRes.clientAction?.route).toBe('/timetable');

    const events = await timetableRepo.getBusyEvents(userId);
    const createdEvent = events.find((e) => e.title === 'Học thêm Hóa học');
    expect(createdEvent).toBeDefined();
  });

  it('correctly maps Vietnamese weekday names to canonical 1..7 indices (Thứ 2=1 .. Thứ 7=6, CN=7)', () => {
    expect(resolveVietnameseDayOfWeek('Thứ 2')).toBe(1);
    expect(resolveVietnameseDayOfWeek('Thứ hai')).toBe(1);
    expect(resolveVietnameseDayOfWeek('t2')).toBe(1);

    expect(resolveVietnameseDayOfWeek('Thứ 3')).toBe(2);
    expect(resolveVietnameseDayOfWeek('Thứ ba')).toBe(2);
    expect(resolveVietnameseDayOfWeek('t3')).toBe(2);

    expect(resolveVietnameseDayOfWeek('Thứ 4')).toBe(3);
    expect(resolveVietnameseDayOfWeek('Thứ tư')).toBe(3);
    expect(resolveVietnameseDayOfWeek('t4')).toBe(3);

    expect(resolveVietnameseDayOfWeek('Thứ 5')).toBe(4);
    expect(resolveVietnameseDayOfWeek('Thứ năm')).toBe(4);
    expect(resolveVietnameseDayOfWeek('t5')).toBe(4);

    expect(resolveVietnameseDayOfWeek('Thứ 6')).toBe(5);
    expect(resolveVietnameseDayOfWeek('Thứ sáu')).toBe(5);
    expect(resolveVietnameseDayOfWeek('t6')).toBe(5);

    expect(resolveVietnameseDayOfWeek('Thứ 7')).toBe(6);
    expect(resolveVietnameseDayOfWeek('Thứ bảy')).toBe(6);
    expect(resolveVietnameseDayOfWeek('t7')).toBe(6);

    expect(resolveVietnameseDayOfWeek('Chủ nhật')).toBe(7);
    expect(resolveVietnameseDayOfWeek('CN')).toBe(7);
  });
});
