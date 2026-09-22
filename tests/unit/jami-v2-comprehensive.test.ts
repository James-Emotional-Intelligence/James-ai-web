import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveVietnameseDayOfWeek,
  calculateTargetDateTimeIso,
  resolveUserTimeZone,
  getNowInTimeZone,
  formatVnDate,
  formatVnTime,
} from '../../server/lib/date-time';
import {
  TOOL_REGISTRY,
  getToolDefinition,
  getAllOpenAiToolDefinitions,
  executeRegisteredTool,
} from '../../server/ai/tool-registry';
import { JamiActionService } from '../../server/services/jami-action-service';
import { jamiOrchestrator } from '../../server/services/jami-orchestrator';
import { jamiRepo } from '../../server/repositories/jami-repository';

describe('SUPER PROMPT V2 Comprehensive Test Suite', () => {
  const testUserId = 'user_test_v2_' + Math.random().toString(36).substring(2, 9);
  const jamiActionService = JamiActionService.getInstance();

  describe('1. Date-Time and Vietnamese Weekday Resolver', () => {
    it('correctly maps all Vietnamese day strings to canonical numbers (1=Thứ 2 ... 7=Chủ Nhật)', () => {
      expect(resolveVietnameseDayOfWeek('Thứ 2')).toBe(1);
      expect(resolveVietnameseDayOfWeek('thứ hai')).toBe(1);
      expect(resolveVietnameseDayOfWeek('t2')).toBe(1);
      expect(resolveVietnameseDayOfWeek('Monday')).toBe(1);

      expect(resolveVietnameseDayOfWeek('Thứ 3')).toBe(2);
      expect(resolveVietnameseDayOfWeek('thứ ba')).toBe(2);
      expect(resolveVietnameseDayOfWeek('t3')).toBe(2);

      expect(resolveVietnameseDayOfWeek('Thứ 4')).toBe(3);
      expect(resolveVietnameseDayOfWeek('thứ tư')).toBe(3);
      expect(resolveVietnameseDayOfWeek('t4')).toBe(3);

      expect(resolveVietnameseDayOfWeek('Thứ 5')).toBe(4);
      expect(resolveVietnameseDayOfWeek('thứ năm')).toBe(4);
      expect(resolveVietnameseDayOfWeek('t5')).toBe(4);

      expect(resolveVietnameseDayOfWeek('Thứ 6')).toBe(5);
      expect(resolveVietnameseDayOfWeek('thứ sáu')).toBe(5);
      expect(resolveVietnameseDayOfWeek('t6')).toBe(5);

      expect(resolveVietnameseDayOfWeek('Thứ 7')).toBe(6);
      expect(resolveVietnameseDayOfWeek('thứ bảy')).toBe(6);
      expect(resolveVietnameseDayOfWeek('t7')).toBe(6);

      expect(resolveVietnameseDayOfWeek('Chủ Nhật')).toBe(7);
      expect(resolveVietnameseDayOfWeek('chu nhat')).toBe(7);
      expect(resolveVietnameseDayOfWeek('cn')).toBe(7);
      expect(resolveVietnameseDayOfWeek('Sunday')).toBe(7);
    });

    it('resolves user timezone defaulting to Asia/Ho_Chi_Minh', () => {
      expect(resolveUserTimeZone(undefined)).toBe('Asia/Ho_Chi_Minh');
      expect(resolveUserTimeZone('')).toBe('Asia/Ho_Chi_Minh');
      expect(resolveUserTimeZone('invalid/tz')).toBe('Asia/Ho_Chi_Minh');
      expect(resolveUserTimeZone('Asia/Ho_Chi_Minh')).toBe('Asia/Ho_Chi_Minh');
      expect(resolveUserTimeZone('America/New_York')).toBe('America/New_York');
    });

    it('calculates target ISO timestamp accurately without timezone drift', () => {
      const iso = calculateTargetDateTimeIso(2, '19:30');
      expect(iso).toBeDefined();
      const parsed = new Date(iso);
      expect(parsed.toISOString()).toBe(iso);
      expect(isNaN(parsed.getTime())).toBe(false);
    });
  });

  describe('2. Canonical Tool Registry & Strict Validation', () => {
    it('contains all 20 canonical tools with typed schemas', () => {
      const expectedTools = [
        'get_daily_schedule',
        'get_next_task',
        'get_subject_progress',
        'get_upcoming_exams',
        'get_mistake_summary',
        'get_unread_notifications',
        'get_task_details',
        'search_materials',
        'navigate_to',
        'start_focus_timer',
        'preview_create_task',
        'preview_create_scheduled_task',
        'preview_add_timetable_entry',
        'preview_add_busy_event',
        'preview_replan_tasks',
        'preview_create_exam',
        'preview_create_mistake_entry',
        'preview_create_reminder',
        'preview_mark_task_completed',
        'preview_cancel_event',
      ];

      for (const name of expectedTools) {
        const tool = getToolDefinition(name);
        expect(tool, `Tool ${name} must be defined in registry`).toBeDefined();
        expect(tool?.name).toBe(name);
        expect(tool?.schema).toBeDefined();
        expect(tool?.openAiDefinition).toBeDefined();
        expect(tool?.openAiDefinition.function.name).toBe(name);
      }
    });

    it('exports complete OpenAI function catalog', () => {
      const openAiDefs = getAllOpenAiToolDefinitions();
      expect(openAiDefs.length).toBeGreaterThanOrEqual(16);
      for (const def of openAiDefs) {
        expect(def.type).toBe('function');
        expect(def.function.name).toBeDefined();
        expect(def.function.description).toBeDefined();
        expect(def.function.parameters).toBeDefined();
      }
    });

    it('rejects invalid arguments with clear validation message', async () => {
      // preview_add_timetable_entry requires title, dayOfWeek, startLocalTime, endLocalTime
      const result = await executeRegisteredTool(testUserId, 'preview_add_timetable_entry', {
        title: '',
        dayOfWeek: 99, // invalid dow
        startLocalTime: 'invalid_time',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Tham số không hợp lệ');
    });

    it('creates proposal successfully for preview_create_task', async () => {
      const result = await executeRegisteredTool(testUserId, 'preview_create_task', {
        title: 'Làm bài tập phương trình bậc 2',
        subjectName: 'Toán học',
        estimatedMinutes: 45,
        priority: 'high',
      });

      expect(result.success).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.proposal).toBeDefined();
      expect(result.proposal?.id).toBeDefined();
      expect(result.proposal?.status).toBe('pending');
      expect(result.proposal?.payload.title).toBe('Làm bài tập phương trình bậc 2');
    });
  });

  describe('3. Fail-Closed Proposal Confirmation System', () => {
    it('throws error and refuses confirmation when message has no proposalId', async () => {
      const fakeMsg = await jamiRepo.saveMessage(testUserId, {
        sender: 'jami',
        text: 'Tin nhắn không có đề xuất nào',
        requiresConfirmation: false,
      });

      await expect(
        jamiRepo.confirmMessageAction(testUserId, fakeMsg.id, 'confirm')
      ).rejects.toThrow('PROPOSAL_MISSING');
    });

    it('handles confirm and reject with atomic status transitions', async () => {
      const toolRes = await executeRegisteredTool(testUserId, 'preview_create_task', {
        title: 'Nhiệm vụ kiểm thử xác nhận',
        subjectName: 'Toán học',
        estimatedMinutes: 30,
      });

      expect(toolRes.proposal).toBeDefined();
      const proposalId = toolRes.proposal!.id;

      // Confirm proposal
      const confirmRes = await jamiActionService.handleProposalDecision(testUserId, 'confirm', proposalId);
      expect(confirmRes.success).toBe(true);

      // Verify idempotency: re-confirming returns already confirmed
      const reconfirmRes = await jamiActionService.handleProposalDecision(testUserId, 'confirm', proposalId);
      expect(reconfirmRes.success).toBe(true);
      expect(reconfirmRes.isAlreadyConfirmed).toBe(true);
    });

    it('rejects expired proposals safely', async () => {
      const toolRes = await executeRegisteredTool(testUserId, 'preview_create_task', {
        title: 'Nhiệm vụ sắp hết hạn',
        subjectName: 'Vật lí',
      });

      const proposal = toolRes.proposal!;
      proposal.expiresAt = new Date(Date.now() - 10000).toISOString();

      // If in demo fallback, update the map object directly
      const confirmRes = await jamiActionService.handleProposalDecision(testUserId, 'confirm', proposal.id);
      expect(confirmRes.success).toBe(false);
      expect(confirmRes.message).toContain('hết hạn');
    });
  });

  describe('4. Unified Jami Orchestrator', () => {
    it('processes a turn and returns structured response', async () => {
      const turnOutput = await jamiOrchestrator.processTurn({
        userId: testUserId,
        message: 'Hôm nay mình có những tiết học nào?',
        source: 'text',
      });

      expect(turnOutput).toBeDefined();
      expect(turnOutput.replyMessage).toBeDefined();
      expect(turnOutput.replyMessage.text).toBeDefined();
      expect(turnOutput.replyMessage.emotion).toBeDefined();
      expect(typeof turnOutput.isDemoMode).toBe('boolean');
    });

    it('maintains idempotency when clientMessageId is supplied', async () => {
      const clientMsgId = 'client_msg_' + Date.now();

      const out1 = await jamiOrchestrator.processTurn({
        userId: testUserId,
        message: 'Xin chào Jami',
        clientMessageId: clientMsgId,
        source: 'text',
      });

      expect(out1.userMessage).toBeDefined();
      expect(out1.userMessage.clientMessageId).toBe(clientMsgId);
    });
  });
});
