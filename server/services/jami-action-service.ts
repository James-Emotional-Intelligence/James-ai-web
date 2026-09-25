import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/mysql';
import type { DbExecutor } from '../db/mysql';
import { isProduction } from '../config/env';
import { taskRepo } from '../repositories/task-repository';
import { timetableRepo } from '../repositories/timetable-repository';
import { focusRepo } from '../repositories/focus-repository';
import { examRepo } from '../repositories/exam-repository';
import { reportRepo } from '../repositories/report-repository';
import { subjectRepo } from '../repositories/subject-repository';
import { plannerRepo } from '../repositories/planner-repository';
import { notificationRepo } from '../repositories/notification-repository';
import { mistakeRepo } from '../repositories/mistake-repository';
import { UserRepository } from '../repositories/user-repository';
import { findMutateToolByActionType } from '../ai/tool-registry';
import { DeterministicScheduler } from './scheduler';
import {
  calculateTargetDateTimeIso as calculateCanonicalTargetDateTimeIso,
  resolveVietnameseDayOfWeek as resolveCanonicalVietnameseDayOfWeek,
} from '../lib/date-time';

const userRepo = UserRepository.getInstance();

export interface ActionProposalRecord {
  id: string;
  userId: string;
  conversationId?: string;
  actionType: string;
  payload: any;
  previewText: string;
  status: 'pending' | 'processing' | 'confirmed' | 'rejected' | 'expired' | 'failed';
  expiresAt: string;
  confirmedAt?: string;
  idempotencyKey?: string;
  executionKey?: string;
  resultJson?: unknown;
  createdAt: string;
}

export interface ActionResult {
  success: boolean;
  message: string;
  requiresConfirmation?: boolean;
  isAlreadyConfirmed?: boolean;
  proposal?: ActionProposalRecord;
  clientAction?: {
    type: 'navigate' | 'focus_timer' | 'refresh';
    route?: string;
    sessionId?: string;
    params?: any;
  };
  data?: any;
}

export const ALLOWED_NAVIGATE_ROUTES = [
  '/today',
  '/timetable',
  '/tasks',
  '/focus',
  '/exams',
  '/materials',
  '/reports',
  '/notifications',
  '/settings',
  '/jami',
] as const;

export type AllowedNavigateRoute = (typeof ALLOWED_NAVIGATE_ROUTES)[number];

/**
 * Maps Vietnamese weekday text or raw inputs to canonical dayOfWeek (1=Thứ 2, 2=Thứ 3, ..., 6=Thứ 7, 7=Chủ Nhật)
 */
export function resolveVietnameseDayOfWeek(input: any, defaultJsDay?: number): number {
  return resolveCanonicalVietnameseDayOfWeek(input, defaultJsDay);
}

/**
 * Calculates concrete ISO timestamp for a target day of week in current week
 */
export function calculateTargetDateTimeIso(
  targetDow?: number,
  timeStr?: string,
  explicitIso?: string
): string {
  return calculateCanonicalTargetDateTimeIso(targetDow, timeStr, explicitIso);
}

export class JamiActionService {
  private static instance: JamiActionService;
  private demoProposals: Map<string, ActionProposalRecord[]> = new Map();

  private constructor() {}

  public static getInstance(): JamiActionService {
    if (!JamiActionService.instance) {
      JamiActionService.instance = new JamiActionService();
    }
    return JamiActionService.instance;
  }

  /**
   * Deprecated: use server/ai/tool-registry.ts as the only canonical tool catalog.
   */
  public static getToolDefinitions() {
    return [];
  }

  /**
   * Safe execution dispatcher with strict validation and user ownership checks
   */
  public async executeTool(
    userId: string,
    toolName: string,
    args: any,
    conversationId?: string
  ): Promise<ActionResult> {
    // Compatibility adapter only: all behavior remains in the canonical registry.
    const legacyToolMap: Record<string, string> = {
      get_today_schedule: 'get_daily_schedule',
      create_task: 'preview_create_task',
      preview_create_task: 'preview_create_task',
      create_scheduled_task: 'preview_create_scheduled_task',
      preview_create_scheduled_task: 'preview_create_scheduled_task',
      create_schedule: 'preview_create_scheduled_task',
      add_schedule: 'preview_create_scheduled_task',
      schedule_study_session: 'preview_create_scheduled_task',
      create_study_session: 'preview_create_scheduled_task',
      create_timetable_entry: 'preview_add_timetable_entry',
      preview_create_timetable_entry: 'preview_add_timetable_entry',
      preview_add_timetable_entry: 'preview_add_timetable_entry',
      add_timetable_entry: 'preview_add_timetable_entry',
      add_busy_event: 'preview_add_busy_event',
      preview_add_busy_event: 'preview_add_busy_event',
      preview_replan: 'preview_replan_tasks',
      create_exam: 'preview_create_exam',
      create_exam_plan: 'preview_create_exam',
      create_mistake_entry: 'preview_create_mistake_entry',
      create_reminder: 'preview_create_reminder',
      preview_create_reminder: 'preview_create_reminder',
      mark_task_completed: 'preview_mark_task_completed',
      cancel_event: 'preview_cancel_event',
      navigate_to: 'navigate_to',
      start_focus_timer: 'start_focus_timer',
    };
    const canonicalName = legacyToolMap[toolName];
    if (!canonicalName) return { success: false, message: 'TOOL_NOT_ALLOWED' };
    const normalizedArgs = { ...(args || {}) };
    if (canonicalName === 'preview_create_reminder') {
      normalizedArgs.title = normalizedArgs.title || normalizedArgs.content;
      normalizedArgs.scheduledFor = normalizedArgs.scheduledFor || calculateCanonicalTargetDateTimeIso(undefined, normalizedArgs.timeStr, undefined, 'Asia/Ho_Chi_Minh');
    }
    const { executeRegisteredTool } = await import('../ai/tool-registry');
    return executeRegisteredTool(userId, canonicalName, normalizedArgs, { conversationId });

    /* istanbul ignore next -- retained only as a compatibility tombstone during migration. */
    try {
      switch (toolName) {
        case 'get_today_schedule': {
          const timetables = await timetableRepo.getTimetables(userId);
          const activeTimetable = timetables.find((t) => t.isActive) || timetables[0];
          const busyEvents = await timetableRepo.getBusyEvents(userId);
          const tasks = await taskRepo.getByUserId(userId);

          const now = new Date();
          const todayDOW = now.getDay() === 0 ? 7 : now.getDay(); // 1=Mon .. 7=Sun
          const todayEntries = activeTimetable?.entries?.filter((e) => e.dayOfWeek === todayDOW) || [];

          const todayTasks = tasks.filter((t) => {
            if (!t.scheduledStartAt) return false;
            const taskDate = new Date(t.scheduledStartAt);
            return taskDate.toDateString() === now.toDateString();
          });

          return {
            success: true,
            message: `Hôm nay bạn có ${todayEntries.length} tiết học trên lớp và ${todayTasks.length} nhiệm vụ học tập theo kế hoạch.`,
            data: {
              schoolEntries: todayEntries,
              busyEvents: busyEvents.slice(0, 5),
              scheduledTasks: todayTasks,
            },
          };
        }

        case 'get_next_task': {
          const tasks = await taskRepo.getByUserId(userId);
          const pending = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
          if (pending.length === 0) {
            return {
              success: true,
              message: 'Bạn đã hoàn thành tất cả nhiệm vụ học tập hiện tại! Hãy nghỉ ngơi hoặc tạo mục tiêu mới nhé.',
            };
          }
          const next = pending[0];
          return {
            success: true,
            message: `Nhiệm vụ tiếp theo: ${next.title} (${next.subjectName || 'Môn học'}), dự kiến ${next.estimatedMinutes} phút.`,
            data: { nextTask: next },
            clientAction: {
              type: 'navigate',
              route: `/tasks/${next.id}`,
            },
          };
        }

        case 'navigate_to': {
          const route = String(args?.route || '').trim();
          if (!ALLOWED_NAVIGATE_ROUTES.includes(route as AllowedNavigateRoute)) {
            return {
              success: false,
              message: `Đường dẫn không hợp lệ. Chỉ được phép chuyển đến các trang chính của ứng dụng.`, 
            };
          }

          const routeLabels: Record<string, string> = {
            '/today': 'Tổng quan hôm nay',
            '/timetable': 'Thời khóa biểu',
            '/tasks': 'Danh sách nhiệm vụ',
            '/focus': 'Hẹn giờ tập trung',
            '/exams': 'Quản lý thi & ôn tập',
            '/materials': 'Tài liệu học tập',
            '/reports': 'Báo cáo học tập',
            '/notifications': 'Thông báo',
            '/settings': 'Cài đặt',
            '/jami': 'Trợ lý Jami',
          };

          return {
            success: true,
            message: `Đang mở ${routeLabels[route] || route}...`,
            clientAction: {
              type: 'navigate',
              route,
            },
          };
        }

        case 'start_focus_timer': {
          const plannedMinutes = Number(args?.plannedMinutes) || 25;
          const taskId = args?.taskId ? String(args.taskId) : undefined;

          const session = await focusRepo.createSession(userId, {
            plannedMinutes,
            taskId,
            mode: plannedMinutes === 25 ? '25_5' : plannedMinutes === 45 ? '45_10' : 'custom',
          });

          return {
            success: true,
            message: `Đã bắt đầu phiên tập trung ${plannedMinutes} phút. Hãy giữ tinh thần thoải mái và tập trung nhé!`,
            clientAction: {
              type: 'focus_timer',
              route: '/focus',
              sessionId: session.id,
              params: { plannedMinutes },
            },
            data: { session },
          };
        }

        case 'create_task':
        case 'preview_create_task': {
          const title = String(args?.title || '').trim();
          if (!title) {
            return { success: false, message: 'Vui lòng cung cấp tiêu đề cho nhiệm vụ học tập.' };
          }
          const estimatedMinutes = Math.min(480, Math.max(5, Number(args?.estimatedMinutes) || 45));
          const priority = (args?.priority === 'high' || args?.priority === 'low') ? args.priority : 'medium';
          const subjectName = args?.subjectName || '';

          // Look up subject ID
          const subjects = await subjectRepo.getByUserId(userId);
          const subject = subjects.find((s) => s.name.toLowerCase().includes(subjectName.toLowerCase())) || subjects[0];

          const payload = {
            title,
            subjectId: subject?.id,
            subjectName: subject?.name || subjectName,
            estimatedMinutes,
            priority,
            difficulty: args?.difficulty || 'medium',
            dueAt: args?.dueAt ? new Date(args.dueAt).toISOString() : undefined,
            notes: args?.notes,
          };

          const previewText = `Tạo nhiệm vụ "${title}"${payload.subjectName ? ` môn ${payload.subjectName}` : ''} (${estimatedMinutes} phút, mức ưu tiên ${priority}). Bạn có đồng ý lưu không?`;

          const proposal = await this.saveProposal(userId, {
            actionType: 'create_task',
            conversationId,
            payload,
            previewText,
          });

          return {
            success: true,
            requiresConfirmation: true,
            message: previewText,
            proposal,
          };
        }

        case 'create_scheduled_task':
        case 'preview_create_scheduled_task':
        case 'create_schedule':
        case 'add_schedule':
        case 'schedule_study_session':
        case 'create_study_session': {
          const title = String(args?.title || args?.topic || 'Tự học bài').trim();
          const subjectName = args?.subjectName || 'Toán học';
          const estimatedMinutes = Math.min(480, Math.max(5, Number(args?.estimatedMinutes) || 45));
          const priority = (args?.priority === 'high' || args?.priority === 'low') ? args.priority : 'medium';

          const targetDow = (args?.dayOfWeek !== undefined || args?.day !== undefined || args?.dayName !== undefined)
            ? resolveCanonicalVietnameseDayOfWeek(args?.dayOfWeek ?? args?.day ?? args?.dayName)
            : undefined;
          const startsAt = calculateCanonicalTargetDateTimeIso(targetDow, args?.timeStr || args?.startLocalTime, args?.scheduledStartAt || args?.startsAt);
          const endsAt = args?.scheduledEndAt || args?.endsAt || new Date(new Date(startsAt).getTime() + estimatedMinutes * 60 * 1000).toISOString();

          const subjects = await subjectRepo.getByUserId(userId);
          const subject = subjects.find((s) => s.name.toLowerCase().includes(subjectName.toLowerCase())) || subjects[0];

          const payload = {
            title,
            subjectId: subject?.id,
            subjectName: subject?.name || subjectName,
            estimatedMinutes,
            priority,
            difficulty: args?.difficulty || 'medium',
            dueAt: endsAt,
            scheduledStartAt: new Date(startsAt).toISOString(),
            scheduledEndAt: new Date(endsAt).toISOString(),
          };

          const startTimeStr = new Date(startsAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
          const dateStr = new Date(startsAt).toLocaleDateString('vi-VN');
          const previewText = `Thêm ca tự học "${title}" (${payload.subjectName}) lúc ${startTimeStr} ngày ${dateStr} (${estimatedMinutes} phút). Bạn có xác nhận xếp vào thời khóa biểu không?`;

          const proposal = await this.saveProposal(userId, {
            actionType: 'create_scheduled_task',
            conversationId,
            payload,
            previewText,
          });

          return {
            success: true,
            requiresConfirmation: true,
            message: previewText,
            proposal,
          };
        }

        case 'create_timetable_entry':
        case 'preview_create_timetable_entry':
        case 'preview_add_timetable_entry':
        case 'add_timetable_entry': {
          const title = String(args?.title || args?.subjectName || 'Tiết học').trim();
          const subjectName = args?.subjectName || title;
          const rawDow = args?.dayOfWeek ?? args?.day ?? args?.dayName ?? args?.title;
          const dayOfWeek = resolveCanonicalVietnameseDayOfWeek(rawDow);
          const startLocalTime = String(args?.startLocalTime || args?.startTime || '07:30').trim();
          const endLocalTime = String(args?.endLocalTime || args?.endTime || '08:15').trim();
          const room = args?.room || args?.location || '';
          const teacher = args?.teacher || '';

          const subjects = await subjectRepo.getByUserId(userId);
          const subject = subjects.find((s) => s.name.toLowerCase().includes(subjectName.toLowerCase())) || subjects[0];

          const payload = {
            title,
            subjectId: subject?.id,
            subjectName: subject?.name || subjectName,
            dayOfWeek,
            startLocalTime,
            endLocalTime,
            room,
            location: args?.location || room,
            teacher,
            commuteBeforeMinutes: args?.commuteBeforeMinutes ?? 0,
            commuteAfterMinutes: args?.commuteAfterMinutes ?? 0,
          };

          const dayNames = ['', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
          const dayLabel = dayNames[dayOfWeek] || `Thứ ${dayOfWeek}`;
          const previewText = `Thêm tiết học "${payload.title}" (${payload.subjectName}) vào ${dayLabel} (${startLocalTime} - ${endLocalTime}). Bạn có đồng ý lưu vào thời khóa biểu chính khóa không?`;

          const proposal = await this.saveProposal(userId, {
            actionType: 'create_timetable_entry',
            conversationId,
            payload,
            previewText,
          });

          return {
            success: true,
            requiresConfirmation: true,
            message: previewText,
            proposal,
          };
        }

        case 'add_busy_event':
        case 'preview_add_busy_event': {
          const title = String(args?.title || '').trim();
          const targetDow = (args?.dayOfWeek !== undefined || args?.day !== undefined || args?.dayName !== undefined)
            ? resolveCanonicalVietnameseDayOfWeek(args?.dayOfWeek ?? args?.day ?? args?.dayName)
            : undefined;
          const startsAt = calculateCanonicalTargetDateTimeIso(targetDow, args?.timeStr || args?.startLocalTime, args?.startsAt);
          const endsAt = args?.endsAt
            ? new Date(args.endsAt).toISOString()
            : new Date(new Date(startsAt).getTime() + 90 * 60 * 1000).toISOString();

          const payload = {
            title,
            startsAt,
            endsAt,
            type: args?.type || 'personal',
            timezone: 'Asia/Ho_Chi_Minh',
            isFixed: true,
            isAllDay: Boolean(args?.isAllDay),
            notes: args?.notes,
            commuteBeforeMinutes: args?.commuteBeforeMinutes ?? 0,
            commuteAfterMinutes: args?.commuteAfterMinutes ?? 0,
          };

          const startTimeStr = new Date(startsAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
          const endTimeStr = new Date(endsAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
          const previewText = `Thêm lịch bận "${title}" từ ${startTimeStr} đến ${endTimeStr}. Bạn có xác nhận không?`;

          const proposal = await this.saveProposal(userId, {
            actionType: 'add_busy_event',
            conversationId,
            payload,
            previewText,
          });

          return {
            success: true,
            requiresConfirmation: true,
            message: previewText,
            proposal,
          };
        }

        case 'preview_replan':
        case 'preview_replan_tasks': {
          const reason = args?.reason || 'Yêu cầu sắp xếp lại lịch học';
          const currentTasks = await taskRepo.getByUserId(userId);
          const busyEvents = await timetableRepo.getBusyEvents(userId);
          const timetableEntries = await timetableRepo.getTimetableEntries(userId);
          const availabilityRules = await timetableRepo.getAvailabilityRules(userId);
          const profile = await userRepo.getProfile(userId);

          const defaultProfile = profile || {
            userId,
            gradeLevel: 9,
            schoolName: 'THCS',
            goals: [],
            preferredSessionMinutes: 45,
            maxDailyStudyMinutes: 180,
            energyPreferences: { morning: 'high', afternoon: 'medium', evening: 'high' } as const,
            sleepSchedule: { wakeTime: '06:00', bedTime: '22:30' },
            mealTimes: { lunch: '12:00', dinner: '18:30' },
          };

          const preview = DeterministicScheduler.generateScheduleProposal(
            currentTasks,
            currentTasks,
            busyEvents,
            timetableEntries,
            defaultProfile,
            new Date(),
            Number(args?.daysCount) || 7,
            reason,
            availabilityRules,
            'Asia/Ho_Chi_Minh'
          );

          await plannerRepo.saveProposal(preview);

          const previewText = `Đã tạo đề xuất xếp lịch cho ${preview.tasksToSchedule.length} phiên học theo khung thời gian tối ưu. Bạn có xác nhận áp dụng không?`;

          const proposal = await this.saveProposal(userId, {
            actionType: 'replan_tasks',
            conversationId,
            payload: preview,
            previewText,
          });

          return {
            success: true,
            requiresConfirmation: true,
            message: previewText,
            proposal,
          };
        }

        case 'create_exam':
        case 'create_exam_plan':
        case 'preview_create_exam': {
          const title = String(args?.title || '').trim();
          const examAtInput = args?.examAt || args?.examDate;
          const examAt = examAtInput ? new Date(examAtInput).toISOString() : new Date(Date.now() + 7 * 86400000).toISOString();
          const subjectName = args?.subjectName || args?.subject || '';

          const subjects = await subjectRepo.getByUserId(userId);
          const subject = subjects.find((s) => s.name.toLowerCase().includes(subjectName.toLowerCase())) || subjects[0];
          const topicPayload = Array.isArray(args?.topics)
            ? args.topics.map((topic: any, index: number) => ({
                id: topic?.id,
                name: typeof topic === 'string' ? topic : String(topic?.name || `Chủ đề ${index + 1}`),
                weight: typeof topic === 'object' && topic?.weight !== undefined ? Number(topic.weight) : 1,
              })).filter((topic: any) => topic.name.trim().length > 0)
            : [];

          const payload = {
            title: title || `Kiểm tra ${subject?.name || subjectName || 'môn học'}`,
            subjectId: subject?.id,
            subjectName: subject?.name || subjectName,
            examAt,
            importance: args?.importance || 'high',
            targetScore: args?.targetScore,
            scopeText: args?.scopeText || args?.notes || '',
            topics: topicPayload,
          };

          const examDateStr = new Date(examAt).toLocaleDateString('vi-VN');
          const previewText = `Tạo kỳ thi/bài kiểm tra "${title}" môn ${payload.subjectName} vào ngày ${examDateStr}. Bạn có muốn lưu không?`;

          const proposal = await this.saveProposal(userId, {
            actionType: 'create_exam',
            conversationId,
            payload,
            previewText,
          });

          return {
            success: true,
            requiresConfirmation: true,
            message: previewText,
            proposal,
          };
        }

        case 'mark_task_completed':
        case 'preview_mark_task_completed': {
          const tasks = await taskRepo.getByUserId(userId);
          const pending = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
          let taskToComplete = args?.taskId ? tasks.find((t) => t.id === args.taskId) : undefined;
          if (!taskToComplete && args?.taskTitle) {
            const matches = pending.filter((t) => t.title.toLowerCase().includes(String(args.taskTitle).toLowerCase()));
            if (matches.length > 1) {
              return {
                success: false,
                message: 'Có nhiều nhiệm vụ khớp tiêu đề. Vui lòng chọn một nhiệm vụ cụ thể.',
                data: { clarificationRequired: true, tasks: matches.slice(0, 5) },
              };
            }
            taskToComplete = matches[0];
          }

          if (!taskToComplete) {
            return {
              success: false,
              message: 'Không tìm thấy nhiệm vụ học tập nào cần đánh dấu hoàn thành.',
            };
          }

          const previewText = `Đánh dấu hoàn thành nhiệm vụ "${taskToComplete.title}" (${taskToComplete.subjectName}). Bạn có xác nhận không?`;
          const proposal = await this.saveProposal(userId, {
            actionType: 'mark_task_completed',
            conversationId,
            payload: { taskId: taskToComplete.id, title: taskToComplete.title },
            previewText,
          });

          return {
            success: true,
            requiresConfirmation: true,
            message: previewText,
            proposal,
          };
        }

        case 'create_reminder':
        case 'preview_create_reminder': {
          const title = String(args?.title || args?.content || '').trim();
          const scheduledFor = args?.scheduledFor
            ? new Date(args.scheduledFor).toISOString()
            : (args?.timeStr ? calculateCanonicalTargetDateTimeIso(undefined, args.timeStr) : undefined);
          if (!title || !scheduledFor) {
            return { success: false, message: 'Vui lòng cung cấp tiêu đề và thời điểm nhắc hợp lệ.' };
          }
          const previewText = `Tạo lời nhắc "${title}" vào lúc ${new Date(scheduledFor).toLocaleString('vi-VN')}. Bạn có xác nhận không?`;

          const proposal = await this.saveProposal(userId, {
            actionType: 'create_reminder',
            conversationId,
            payload: {
              title,
              body: args?.body,
              scheduledFor,
              priority: args?.priority || 'medium',
              actionUrl: args?.actionUrl || '/notifications',
            },
            previewText,
          });

          return {
            success: true,
            requiresConfirmation: true,
            message: previewText,
            proposal,
          };
        }

        case 'create_mistake_entry':
        case 'preview_create_mistake_entry': {
          const questionText = String(args?.questionText || args?.problemStatement || '').trim();
          const correctAnswer = String(args?.correctAnswer || '').trim();
          const correctSolution = String(args?.correctSolution || args?.correctExplanation || '').trim();
          if (!questionText || !correctAnswer || !correctSolution) {
            return { success: false, message: 'Vui lòng cung cấp câu hỏi, đáp án đúng và lời giải đúng.' };
          }
          const subjectName = args?.subjectName || args?.subject || '';
          const subjects = await subjectRepo.getByUserId(userId);
          const subject = subjectName
            ? subjects.find((s) => s.name.toLowerCase().includes(String(subjectName).toLowerCase()))
            : undefined;
          const payload = {
            subjectId: subject?.id,
            subjectName: subject?.name || subjectName,
            topic: args?.topic || 'Khác',
            questionText,
            selectedAnswer: args?.selectedAnswer,
            correctAnswer,
            mistakeReason: args?.mistakeReason || 'other',
            correctSolution,
            lessonLearned: args?.lessonLearned,
            difficulty: args?.severity === 'critical' ? 'hard' : args?.severity === 'minor' ? 'easy' : 'medium',
          };
          const previewText = `Lưu lỗi sai "${questionText.slice(0, 80)}${questionText.length > 80 ? '...' : ''}" vào Sổ lỗi sai. Bạn có xác nhận không?`;
          const proposal = await this.saveProposal(userId, {
            actionType: 'create_mistake_entry',
            conversationId,
            payload,
            previewText,
          });
          return { success: true, requiresConfirmation: true, message: previewText, proposal };
        }

        case 'cancel_event':
        case 'preview_cancel_event': {
          const eventType = args?.eventType;
          const eventId = String(args?.eventId || '').trim();
          if (!eventType || !eventId) {
            return { success: false, message: 'Vui lòng cung cấp loại và mã sự kiện cần hủy.' };
          }
          let label = eventId;
          if (eventType === 'task') {
            const task = await taskRepo.getById(userId, eventId);
            if (!task) return { success: false, message: 'Không tìm thấy nhiệm vụ thuộc tài khoản của bạn.' };
            label = task.title;
          } else if (eventType === 'busy_event') {
            const events = await timetableRepo.getBusyEvents(userId);
            const event = events.find((e) => e.id === eventId);
            if (!event) return { success: false, message: 'Không tìm thấy lịch bận thuộc tài khoản của bạn.' };
            label = event.title;
          } else if (eventType === 'timetable_entry') {
            const entries = await timetableRepo.getTimetableEntries(userId);
            const entry = entries.find((e) => e.id === eventId);
            if (!entry) return { success: false, message: 'Không tìm thấy tiết học thuộc tài khoản của bạn.' };
            label = entry.title;
          }
          const previewText = `Hủy ${eventType} "${label}". Bạn có xác nhận không?`;
          const proposal = await this.saveProposal(userId, {
            actionType: 'cancel_event',
            conversationId,
            payload: { eventType, eventId, reason: args?.reason, label },
            previewText,
          });
          return { success: true, requiresConfirmation: true, message: previewText, proposal };
        }

        case 'suggest_priority_task': {
          const tasks = await taskRepo.getByUserId(userId);
          const exams = await examRepo.getByUserId(userId);
          const pending = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');

          if (pending.length === 0) {
            return {
              success: true,
              message: 'Bạn đã hoàn thành tất cả nhiệm vụ học tập! Hãy nghỉ ngơi hoặc làm đề ôn tập mới nhé.',
            };
          }

          const topTask = pending[0];
          const reason = `bám sát hạn nộp gần nhất và chuẩn bị cho kỳ thi môn ${topTask.subjectName || 'học'}`;

          return {
            success: true,
            message: `Nhiệm vụ ưu tiên tiếp theo: "${topTask.title}" (${topTask.subjectName}, dự kiến ${topTask.estimatedMinutes} phút). Lý do: ${reason}.`,
            data: { topTask, exams: exams.slice(0, 2) },
            clientAction: {
              type: 'navigate',
              route: `/tasks/${topTask.id}`,
            },
          };
        }

        case 'open_material': {
          return {
            success: true,
            message: 'Đang mở Kho Tài Liệu học tập...',
            clientAction: {
              type: 'navigate',
              route: '/materials',
            },
          };
        }

        case 'create_quiz_revision': {
          const subjectName = args?.subjectName || 'Toán học';
          return {
            success: true,
            message: `Đang mở trung tâm luyện tập ôn thi môn ${subjectName}...`,
            clientAction: {
              type: 'navigate',
              route: '/exams',
            },
          };
        }

        case 'read_report': {
          const report = await reportRepo.getOverview(userId);
          const completionRate = report.summary.completionRate;
          return {
            success: true,
            message: `Tuần này bạn đã hoàn thành ${completionRate}% kế hoạch, tổng thời gian tập trung đạt ${report.summary.actualFocusHours} giờ và chuỗi ${report.summary.streakDays} ngày liên tục.`,
            data: { report },
            clientAction: {
              type: 'navigate',
              route: '/reports',
            },
          };
        }

        case 'confirm_pending_proposal': {
          const decision = args?.decision === 'reject' ? 'reject' : 'confirm';
          const proposalId = args?.proposalId;
          return await this.handleProposalDecision(userId, decision, proposalId, conversationId);
        }

        default:
          return {
            success: false,
            message: `Chức năng "${toolName}" chưa được hỗ trợ.`,
          };
      }
    } catch (err: any) {
      console.error(`[JamiActionService] Error executing tool ${toolName}:`, err);
      return {
        success: false,
        message: 'Không thể thực hiện thao tác lúc này. Vui lòng thử lại sau.',
      };
    }
  }

  /**
   * Saves a pending mutation proposal to MySQL / in-memory store
   */
  public async saveProposal(
    userId: string,
    data: {
      actionType: string;
      conversationId?: string;
      payload: any;
      previewText: string;
    }
  ): Promise<ActionProposalRecord> {
    const id = 'prop_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes
    const createdAt = new Date().toISOString();
    const executionKey = `jami-proposal:${userId}:${id}`;

    const record: ActionProposalRecord = {
      id,
      userId,
      conversationId: data.conversationId,
      actionType: data.actionType,
      payload: data.payload,
      previewText: data.previewText,
      status: 'pending',
      expiresAt,
      executionKey,
      createdAt,
    };

    if (isProduction && !db.isHealthy()) {
      const serviceError = new Error('PROPOSAL_PERSISTENCE_UNAVAILABLE');
      (serviceError as any).code = 'PROPOSAL_PERSISTENCE_UNAVAILABLE';
      (serviceError as any).status = 503;
      throw serviceError;
    }

    if (db.isHealthy()) {
      try {
        await db.execute(
          `INSERT INTO jami_action_proposals
           (id, user_id, conversation_id, action_type, payload_json, preview_text, status, expires_at, execution_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, NOW(3), NOW(3))`,
          [id, userId, data.conversationId || null, data.actionType, JSON.stringify(data.payload), data.previewText, new Date(expiresAt), executionKey]
        );
      } catch (err: any) {
        console.warn('[JamiActionService] Error saving proposal to DB, falling back to memory:', err.message);
        if (isProduction) {
          const serviceError = new Error('PROPOSAL_PERSISTENCE_UNAVAILABLE');
          (serviceError as any).code = 'PROPOSAL_PERSISTENCE_UNAVAILABLE';
          (serviceError as any).status = 503;
          throw serviceError;
        }
      }
    }

    if (!isProduction) {
      const list = this.demoProposals.get(userId) || [];
      list.unshift(record);
      if (list.length > 50) list.pop();
      this.demoProposals.set(userId, list);
    }

    return record;
  }

  /**
   * Retrieves the latest pending proposal for a user
   */
  public async getLatestPendingProposal(userId: string, proposalId?: string): Promise<ActionProposalRecord | null> {
    if (db.isHealthy()) {
      try {
        let rows: any[] = [];
        if (proposalId) {
          rows = await db.query<any>(
          `SELECT id, user_id, conversation_id, action_type, payload_json, preview_text, status, expires_at, confirmed_at, execution_key, result_json, created_at
             FROM jami_action_proposals
             WHERE id = ? AND user_id = ?
             LIMIT 1`,
            [proposalId, userId]
          );
        } else {
          rows = await db.query<any>(
            `SELECT id, user_id, conversation_id, action_type, payload_json, preview_text, status, expires_at, confirmed_at, execution_key, created_at
             FROM jami_action_proposals
             WHERE user_id = ? AND status = 'pending' AND (expires_at IS NULL OR expires_at > NOW(3))
             ORDER BY created_at DESC
             LIMIT 1`,
            [userId]
          );
        }

        if (rows.length > 0) {
          const r = rows[0];
          return {
            id: r.id,
            userId: r.user_id,
            conversationId: r.conversation_id || undefined,
            actionType: r.action_type,
            payload: typeof r.payload_json === 'string' ? JSON.parse(r.payload_json) : r.payload_json,
            previewText: r.preview_text,
            status: r.status,
            expiresAt: r.expires_at?.toISOString?.() || String(r.expires_at),
            confirmedAt: r.confirmed_at ? (r.confirmed_at.toISOString?.() || String(r.confirmed_at)) : undefined,
            executionKey: r.execution_key || undefined,
            resultJson: typeof r.result_json === 'string' ? JSON.parse(r.result_json) : r.result_json,
            createdAt: r.created_at?.toISOString?.() || String(r.created_at),
          };
        }
      } catch (err: any) {
        console.warn('[JamiActionService] DB getProposal error:', err.message);
      }
    }

    if (isProduction) return null;
    const list = this.demoProposals.get(userId) || [];
    if (proposalId) {
      return list.find((p) => p.id === proposalId) || null;
    }
    const now = new Date().toISOString();
    return list.find((p) => p.status === 'pending' && (!p.expiresAt || p.expiresAt > now)) || null;
  }

  /**
   * Confirms or rejects a proposal and executes the mutation transactionally
   */
  public async handleProposalDecision(
    userId: string,
    decision: 'confirm' | 'reject',
    proposalId?: string,
    conversationId?: string
  ): Promise<ActionResult> {
    if (!proposalId) {
      return {
        success: false,
        message: 'Yêu cầu mã định danh đề xuất (proposalId) hợp lệ để thực hiện thao tác.',
      };
    }

    const proposal = await this.getProposalById(userId, proposalId);
    if (!proposal || proposal.userId !== userId) {
      return {
        success: false,
        message: 'Không tìm thấy đề xuất hoặc đề xuất không thuộc quyền sở hữu của bạn.',
      };
    }

    // Idempotency: If already confirmed, return success without duplicate side-effects
    if (proposal.status === 'confirmed') {
      return {
        success: true,
        message: 'Đề xuất này đã được xác nhận trước đó.',
        isAlreadyConfirmed: true,
      };
    }

    if (decision === 'reject') {
      let rejectClaimed = false;
      if (db.isHealthy()) {
        try {
          const res = await db.execute(
            `UPDATE jami_action_proposals SET status = 'rejected', updated_at = NOW(3) WHERE id = ? AND user_id = ? AND status = 'pending'`,
            [proposal.id, userId]
          );
          rejectClaimed = (res as any)?.affectedRows > 0;
        } catch (err: any) {
          console.warn('[JamiActionService] DB reject proposal error:', err.message);
        }
      } else {
        const list = this.demoProposals.get(userId) || [];
        const item = list.find((p) => p.id === proposalId);
        if (item && item.status === 'pending') {
          item.status = 'rejected';
          rejectClaimed = true;
        }
      }
      if (!rejectClaimed) {
        const current = await this.getProposalById(userId, proposalId);
        if (current?.status === 'rejected') {
          return { success: true, message: 'De xuat nay da duoc huy truoc do.', isAlreadyConfirmed: false };
        }
        return {
          success: false,
          message: current?.status === 'processing'
            ? 'De xuat dang duoc xu ly, khong the huy luc nay.'
            : 'De xuat khong con o trang thai cho huy.',
        };
      }
      return {
        success: true,
        message: 'Đã hủy đề xuất theo yêu cầu của bạn.',
      };
    }

    if (proposal.status !== 'pending') {
      return {
        success: false,
        message: `Đề xuất ở trạng thái "${proposal.status}", không thể thực hiện xác nhận.`,
      };
    }

    if (proposal.expiresAt && new Date(proposal.expiresAt).getTime() < Date.now()) {
      await this.updateProposalStatus(userId, proposal.id, 'expired');
      return {
        success: false,
        message: 'Đề xuất đã hết hạn. Vui lòng tạo yêu cầu mới.',
      };
    }

    // Atomic Claiming: transition status from 'pending' to 'processing' to prevent concurrent race conditions
    let claimed = false;
    if (db.isHealthy()) {
      try {
        // Recover abandoned claims only after a bounded lease; active workers
        // keep the processing timestamp fresh through the normal transaction.
        await db.execute(
          `UPDATE jami_action_proposals
           SET status = 'pending', updated_at = NOW(3)
           WHERE id = ? AND user_id = ? AND status = 'processing'
             AND processing_at IS NOT NULL
             AND processing_at < DATE_SUB(NOW(3), INTERVAL 15 MINUTE)`,
          [proposal.id, userId]
        );
        const claimResult = await db.execute(
          `UPDATE jami_action_proposals
           SET status = 'processing', updated_at = NOW(3)
           WHERE id = ? AND user_id = ? AND status = 'pending' AND (expires_at IS NULL OR expires_at > NOW(3))`,
          [proposal.id, userId]
        );
        if ((claimResult as any)?.affectedRows > 0) {
          claimed = true;
        }
      } catch (err: any) {
        console.warn('[JamiActionService] DB atomic claim error:', err.message);
      }
    } else {
      const list = this.demoProposals.get(userId) || [];
      const item = list.find((p) => p.id === proposalId);
      if (item && item.status === 'pending') {
        item.status = 'processing';
        claimed = true;
      }
    }

    if (!claimed) {
      const current = await this.getProposalById(userId, proposalId);
      if (current?.status === 'confirmed') {
        return {
          success: true,
          message: 'Đề xuất này đã được xác nhận trước đó.',
          isAlreadyConfirmed: true,
        };
      }
      if (current?.status === 'processing') {
        return {
          success: false,
          message: 'Đề xuất đang được xử lý bởi một yêu cầu khác.',
        };
      }
      return {
        success: false,
        message: `Đề xuất không thể xác nhận (trạng thái: ${current?.status || 'không rõ'}).`,
      };
    }

    // Execute the mutation via canonical Tool Registry confirmExecutor
    try {
      const tool = findMutateToolByActionType(proposal.actionType);
      if (!tool) {
        throw new Error(`Loại đề xuất "${proposal.actionType}" không có trình thực thi (confirmExecutor) hợp lệ trong Tool Registry.`);
      }

      const toolContext = {
        userId,
        conversationId,
        source: 'text' as const,
        timezone: 'Asia/Ho_Chi_Minh',
        now: new Date(),
      };

       const payloadResult = (tool.proposalSchema || tool.schema).safeParse(proposal.payload);
       if (!payloadResult.success) {
         await this.markProposalFailed(userId, proposal.id, 'INVALID_PROPOSAL_PAYLOAD');
         return { success: false, message: 'Dữ liệu đề xuất không còn hợp lệ. Vui lòng tạo đề xuất mới.' };
       }

       let execResult: ActionResult;
       if (db.isHealthy()) {
         execResult = await db.withTransaction(async (conn) => {
          const [lockedRows] = await conn.query<any[]>(
            `SELECT status, user_id, expires_at, result_resource_id, result_json
             FROM jami_action_proposals
             WHERE id = ? AND user_id = ?
             FOR UPDATE`,
            [proposal.id, userId]
          );
          const lockedProposal = lockedRows[0];
          if (!lockedProposal) {
            throw new Error('PROPOSAL_NOT_FOUND');
          }
          if (lockedProposal.status !== 'processing') {
            if (lockedProposal.status === 'confirmed') {
              return {
                success: true,
                message: 'De xuat nay da duoc xac nhan truoc do.',
                isAlreadyConfirmed: true,
                data: lockedProposal.result_json,
              };
            }
            throw new Error('PROPOSAL_STATE_CHANGED');
          }
          const result = await tool.confirmExecutor(toolContext, payloadResult.data, conn);
          if (result.success) {
            await this.completeProposal(userId, proposal.id, getResultResourceId(result.data), result.data, conn);
          }
          return result;
         });
       } else {
        execResult = await tool.confirmExecutor(toolContext, payloadResult.data);
      }

      if (execResult.success) {
        if (!db.isHealthy()) {
          await this.completeProposal(userId, proposal.id, getResultResourceId(execResult.data), execResult.data);
        }
        return {
          success: true,
          message: execResult.message,
          clientAction: execResult.clientAction || { type: 'refresh' },
          data: execResult.data,
        };
      } else {
        await this.updateProposalStatus(userId, proposal.id, 'failed');
        return {
          success: false,
          message: execResult.message || 'Thao tác không thành công.',
        };
      }
    } catch (err: any) {
      console.error('[JamiActionService] Mutation execution error:', err);
      await this.markProposalFailed(userId, proposal.id, 'EXECUTION_FAILED');
      return {
        success: false,
        message: 'Không thể hoàn tất thao tác lúc này. Vui lòng thử lại sau.',
      };
    }
  }

  public async getProposalById(userId: string, proposalId: string): Promise<ActionProposalRecord | null> {
    if (db.isHealthy()) {
      try {
        const rows = await db.query<any>(
          `SELECT id, user_id, conversation_id, action_type, payload_json, preview_text, expires_at, status, confirmed_at, result_json, created_at
           FROM jami_action_proposals
           WHERE id = ? AND user_id = ?`,
          [proposalId, userId]
        );
        if (rows.length > 0) {
          const r = rows[0];
          return {
            id: r.id,
            userId: r.user_id,
            conversationId: r.conversation_id || undefined,
            actionType: r.action_type,
            previewText: r.preview_text || '',
            payload: typeof r.payload_json === 'string' ? JSON.parse(r.payload_json) : r.payload_json,
            status: r.status,
            expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : new Date().toISOString(),
            confirmedAt: r.confirmed_at ? new Date(r.confirmed_at).toISOString() : undefined,
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
            resultJson: typeof r.result_json === 'string' ? JSON.parse(r.result_json) : r.result_json,
          };
        }
      } catch (err: any) {
        console.warn('[JamiActionService] DB getProposalById error:', err.message);
      }
    }

    if (isProduction) return null;
    const list = this.demoProposals.get(userId) || [];
    return list.find((p) => p.id === proposalId) || null;
  }

  private async updateProposalStatus(
    userId: string,
    proposalId: string,
    status: 'processing' | 'confirmed' | 'rejected' | 'failed' | 'expired'
  ) {
    if (db.isHealthy()) {
      try {
        let timestampField = 'updated_at = NOW(3)';
        if (status === 'confirmed') {
          timestampField = 'confirmed_at = NOW(3), updated_at = NOW(3)';
        } else if (status === 'rejected') {
          timestampField = 'rejected_at = NOW(3), updated_at = NOW(3)';
        } else if (status === 'processing') {
          timestampField = 'processing_at = NOW(3), updated_at = NOW(3)';
        }

        await db.execute(
          `UPDATE jami_action_proposals SET status = ?, ${timestampField} WHERE id = ? AND user_id = ?`,
          [status, proposalId, userId]
        );
      } catch (err: any) {
        console.warn('[JamiActionService] DB updateProposalStatus error:', err.message);
      }
    }

    const list = this.demoProposals.get(userId) || [];
    const item = list.find((p) => p.id === proposalId);
    if (item) {
      item.status = status;
      if (status === 'confirmed') {
        item.confirmedAt = new Date().toISOString();
      }
    }
  }

  private async markProposalFailed(userId: string, proposalId: string, errorCode: string): Promise<void> {
    if (isProduction && !db.isHealthy()) {
      const serviceError = new Error('PROPOSAL_PERSISTENCE_UNAVAILABLE');
      (serviceError as any).code = 'PROPOSAL_PERSISTENCE_UNAVAILABLE';
      (serviceError as any).status = 503;
      throw serviceError;
    }

    if (db.isHealthy()) {
      await db.execute(
        `UPDATE jami_action_proposals
         SET status = 'failed', error_code = ?, error_message = ?, updated_at = NOW(3)
         WHERE id = ? AND user_id = ?`,
        [errorCode, 'Proposal could not be completed safely.', proposalId, userId]
      );
      return;
    }
    await this.updateProposalStatus(userId, proposalId, 'failed');
  }

  private async completeProposal(userId: string, proposalId: string, resultResourceId?: string, resultData?: unknown, executor?: DbExecutor): Promise<void> {
    if (executor || db.isHealthy()) {
      const writer = executor || db;
      await writer.execute(
        `UPDATE jami_action_proposals
         SET status = 'confirmed', result_resource_id = ?, result_json = ?, confirmed_at = NOW(3), updated_at = NOW(3)
         WHERE id = ? AND user_id = ? AND status = 'processing'`,
        [resultResourceId || null, resultData === undefined ? null : JSON.stringify(resultData), proposalId, userId]
      );
      return;
    }
    await this.updateProposalStatus(userId, proposalId, 'confirmed');
  }
}

function getResultResourceId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const record = data as Record<string, unknown>;
  for (const key of ['task', 'exam', 'entry', 'event', 'notification', 'session', 'applied']) {
    const value = record[key];
    if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') return (value as { id: string }).id;
  }
  return undefined;
}

export const jamiActionService = JamiActionService.getInstance();


