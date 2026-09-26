import { z } from 'zod';
import {
  PreviewCreateTaskArgsSchema,
  PreviewCreateScheduledTaskArgsSchema,
  PreviewAddBusyEventArgsSchema,
  PreviewReplanTasksArgsSchema,
  PreviewAddTimetableEntryArgsSchema,
  PreviewCreateExamArgsSchema,
  PreviewCreateMistakeEntryArgsSchema,
  PreviewCreateReminderArgsSchema,
  PreviewMarkTaskCompletedArgsSchema,
  PreviewCancelEventArgsSchema,
  GetDailyScheduleArgsSchema,
  GetNextTaskArgsSchema,
  GetSubjectProgressArgsSchema,
  GetUpcomingExamsArgsSchema,
  GetMistakeSummaryArgsSchema,
  GetUnreadNotificationsArgsSchema,
  GetTaskDetailsArgsSchema,
  SearchMaterialsArgsSchema,
  NavigateToArgsSchema,
  StartFocusTimerArgsSchema,
} from '../../shared/schemas';
import {
  ActionResult,
  ALLOWED_NAVIGATE_ROUTES,
  AllowedNavigateRoute,
  ActionProposalRecord,
  jamiActionService,
} from '../services/jami-action-service';
import { timetableRepo } from '../repositories/timetable-repository';
import { taskRepo } from '../repositories/task-repository';
import { examRepo } from '../repositories/exam-repository';
import { mistakeRepo } from '../repositories/mistake-repository';
import { notificationRepo } from '../repositories/notification-repository';
import { materialRepo } from '../repositories/material-repository';
import { subjectRepo } from '../repositories/subject-repository';
import { focusRepo } from '../repositories/focus-repository';
import { plannerRepo } from '../repositories/planner-repository';
import { UserRepository } from '../repositories/user-repository';
import { DeterministicScheduler } from '../services/scheduler';
import {
  getNowInTimeZone,
  resolveUserTimeZone,
  formatVnDate,
  formatVnTime,
} from '../lib/date-time';
import crypto from 'crypto';
import { db } from '../db/mysql';
import { DbExecutor } from '../db/mysql';
import { sanitizeStrictJsonSchema } from './strict-json-schema';

const userRepo = UserRepository.getInstance();

const AddTimetableEntryProposalSchema = z.object({
  title: z.string().trim().min(1),
  subjectId: z.string().optional(),
  subjectName: z.string().optional(),
  teacher: z.string().optional(),
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  startLocalTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endLocalTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  location: z.string().optional(),
  commuteBeforeMinutes: z.coerce.number().int().min(0).max(180),
  commuteAfterMinutes: z.coerce.number().int().min(0).max(180),
}).refine((value) => value.endLocalTime > value.startLocalTime, {
  message: 'Giờ kết thúc phải sau giờ bắt đầu',
  path: ['endLocalTime'],
});

export type ToolKind = 'read' | 'immediate' | 'mutate';

export interface ToolContext {
  userId: string;
  conversationId?: string;
  source: 'text' | 'voice' | 'realtime';
  clientTurnId?: string;
  realtimeCallId?: string;
  timezone: string;
  now: Date;
}

export interface MutateToolDefinition<TArgs = any> {
  name: string;
  description: string;
  kind: 'mutate';
  actionType: string;
  schema: z.ZodSchema<TArgs>;
  /** Canonical persisted payload, which may be richer than public preview args. */
  proposalSchema?: z.ZodType<any>;
  previewHandler: (ctx: ToolContext, args: TArgs) => Promise<ActionResult>;
  confirmExecutor: (ctx: ToolContext, payload: any, conn?: DbExecutor) => Promise<ActionResult>;
  openAiDefinition?: any;
}

export interface ReadToolDefinition<TArgs = any> {
  name: string;
  description: string;
  kind: 'read' | 'immediate';
  schema: z.ZodSchema<TArgs>;
  handler: (ctx: ToolContext, args: TArgs) => Promise<ActionResult>;
  openAiDefinition?: any;
}

export type AnyToolDefinition<TArgs = any> = MutateToolDefinition<TArgs> | ReadToolDefinition<TArgs>;

/**
 * Generate standard OpenAI JSON Schema parameters from Zod schema
 */
export function generateOpenAiParameters(schema: z.ZodSchema<any>): Record<string, any> {
  const jsonSchema = (schema as any).toJSONSchema ? (schema as any).toJSONSchema() : z.toJSONSchema(schema);
  return sanitizeStrictJsonSchema(jsonSchema);
}

/**
 * In-memory fallback proposals store for demo/test mode without MySQL
 */
export const demoProposalsStore: Map<string, ActionProposalRecord[]> = new Map();

/**
 * Helper to save a pending proposal into MySQL or memory (delegates to JamiActionService)
 */
export async function saveProposalRecord(
  userId: string,
  data: {
    actionType: string;
    conversationId?: string;
    payload: any;
    previewText: string;
  }
): Promise<ActionProposalRecord> {
  return jamiActionService.saveProposal(userId, data);
}

export const TOOL_REGISTRY = {
  // ==========================================
  // 1. preview_create_task (Mutate)
  // ==========================================
  preview_create_task: {
    name: 'preview_create_task',
    description: 'Tạo bản nháp nhiệm vụ học tập cần học sinh xác nhận trước khi lưu.',
    kind: 'mutate',
    actionType: 'create_task',
    schema: PreviewCreateTaskArgsSchema,
    previewHandler: async (ctx, args) => {
      const title = args.title.trim();
      const estimatedMinutes = args.estimatedMinutes || 45;
      const priority = args.priority || 'medium';
      const difficulty = args.difficulty || 'medium';

      let subjectId: string | undefined = undefined;
      let subjectName = args.subjectName?.trim();

      if (subjectName) {
        const subjects = await subjectRepo.getByUserId(ctx.userId);
        const matched = subjects.find((s) => s.name.toLowerCase().includes(subjectName!.toLowerCase()));
        if (matched) {
          subjectId = matched.id;
          subjectName = matched.name;
        }
      }

      const payload = {
        title,
        subjectId,
        subjectName,
        estimatedMinutes,
        priority,
        difficulty,
        dueAt: args.dueAt,
        notes: args.notes,
      };

      const dueNote = args.dueAt ? ` (Hạn nộp: ${formatVnDate(args.dueAt, ctx.timezone)})` : '';
      const subjNote = payload.subjectName ? ` môn ${payload.subjectName}` : '';
      const previewText = `Tạo nhiệm vụ "${title}"${subjNote} (${estimatedMinutes} phút, mức ưu tiên ${priority}${dueNote}). Bạn có đồng ý lưu không?`;

      const proposal = await saveProposalRecord(ctx.userId, {
        actionType: 'create_task',
        conversationId: ctx.conversationId,
        payload,
        previewText,
      });

      return {
        success: true,
        requiresConfirmation: true,
        message: previewText,
        proposal,
      };
    },
    confirmExecutor: async (ctx, payload, conn) => {
      const task = await taskRepo.create(ctx.userId, {
        title: payload.title,
        subjectId: payload.subjectId,
        subjectName: payload.subjectName,
        estimatedMinutes: payload.estimatedMinutes || 45,
        priority: payload.priority || 'medium',
        difficulty: payload.difficulty || 'medium',
        dueAt: payload.dueAt,
        notes: payload.notes,
        status: 'pending',
      }, conn);

      return {
        success: true,
        message: `Đã tạo nhiệm vụ "${task.title}" thành công!`,
        data: { task },
        clientAction: {
          type: 'navigate',
          route: `/tasks/${task.id}`,
        },
      };
    },
  } as MutateToolDefinition<z.infer<typeof PreviewCreateTaskArgsSchema>>,

  // ==========================================
  // 2. preview_create_scheduled_task (Mutate)
  // ==========================================
  preview_create_scheduled_task: {
    name: 'preview_create_scheduled_task',
    description: 'Tạo đề xuất ca tự học có giờ bắt đầu cụ thể, cần xác nhận trước khi xếp vào lịch.',
    kind: 'mutate',
    actionType: 'create_scheduled_task',
    schema: PreviewCreateScheduledTaskArgsSchema,
    previewHandler: async (ctx, args) => {
      const title = args.title.trim();
      const estimatedMinutes = args.estimatedMinutes || 45;
      const priority = args.priority || 'medium';
      const scheduledStartAt = args.scheduledStartAt;
      const scheduledEndAt = args.scheduledEndAt || new Date(new Date(scheduledStartAt).getTime() + estimatedMinutes * 60 * 1000).toISOString();

      let subjectId: string | undefined = undefined;
      let subjectName = args.subjectName?.trim();

      if (subjectName) {
        const subjects = await subjectRepo.getByUserId(ctx.userId);
        const matched = subjects.find((s) => s.name.toLowerCase().includes(subjectName!.toLowerCase()));
        if (matched) {
          subjectId = matched.id;
          subjectName = matched.name;
        }
      }

      const payload = {
        title,
        subjectId,
        subjectName,
        estimatedMinutes,
        priority,
        scheduledStartAt,
        scheduledEndAt,
        notes: args.notes,
      };

      const startTimeStr = formatVnTime(scheduledStartAt, ctx.timezone);
      const dateStr = formatVnDate(scheduledStartAt, ctx.timezone);
      const subjNote = payload.subjectName ? ` môn ${payload.subjectName}` : '';
      const previewText = `Thêm ca tự học "${title}"${subjNote} lúc ${startTimeStr} ngày ${dateStr} (${estimatedMinutes} phút). Bạn có xác nhận xếp vào thời khóa biểu không?`;

      const proposal = await saveProposalRecord(ctx.userId, {
        actionType: 'create_scheduled_task',
        conversationId: ctx.conversationId,
        payload,
        previewText,
      });

      return {
        success: true,
        requiresConfirmation: true,
        message: previewText,
        proposal,
      };
    },
    confirmExecutor: async (ctx, payload, conn) => {
      const task = await taskRepo.create(ctx.userId, {
        title: payload.title,
        subjectId: payload.subjectId,
        subjectName: payload.subjectName,
        estimatedMinutes: payload.estimatedMinutes || 45,
        priority: payload.priority || 'medium',
        scheduledStartAt: payload.scheduledStartAt,
        scheduledEndAt: payload.scheduledEndAt,
        dueAt: payload.scheduledEndAt,
        notes: payload.notes,
        status: 'pending',
      }, conn);

      return {
        success: true,
        message: `Đã xếp ca học "${task.title}" vào thời khóa biểu thành công!`,
        data: { task },
        clientAction: {
          type: 'navigate',
          route: '/timetable',
        },
      };
    },
  } as MutateToolDefinition<z.infer<typeof PreviewCreateScheduledTaskArgsSchema>>,

  // ==========================================
  // 3. preview_add_timetable_entry (Mutate)
  // ==========================================
  preview_add_timetable_entry: {
    name: 'preview_add_timetable_entry',
    description: 'Đề xuất thêm một tiết học vào thời khóa biểu chính khóa (Thứ 2 đến Chủ nhật) cần xác nhận.',
    kind: 'mutate',
    actionType: 'create_timetable_entry',
    schema: PreviewAddTimetableEntryArgsSchema,
    // z.object strips unknown keys, so legacy proposals containing an
    // AI-supplied timetableId are normalized to this server-owned payload.
    proposalSchema: AddTimetableEntryProposalSchema,
    previewHandler: async (ctx, args) => {
      const title = args.title.trim();
      const dayOfWeek = args.dayOfWeek;
      const startLocalTime = args.startLocalTime;
      const endLocalTime = args.endLocalTime;

      let subjectId: string | undefined = undefined;
      let subjectName = args.subjectName?.trim();

      if (subjectName) {
        const subjects = await subjectRepo.getByUserId(ctx.userId);
        const matched = subjects.find((s) => s.name.toLowerCase().includes(subjectName!.toLowerCase()));
        if (matched) {
          subjectId = matched.id;
          subjectName = matched.name;
        }
      }

      const payload = {
        title,
        subjectId,
        subjectName,
        teacher: args.teacher,
        dayOfWeek,
        startLocalTime,
        endLocalTime,
        location: args.location || args.room,
        commuteBeforeMinutes: args.commuteBeforeMinutes ?? 15,
        commuteAfterMinutes: args.commuteAfterMinutes ?? 15,
      };

      const dayNames = ['', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
      const dayLabel = dayNames[dayOfWeek] || `Thứ ${dayOfWeek}`;
      const subjNote = payload.subjectName ? ` môn ${payload.subjectName}` : '';
      const previewText = `Thêm tiết học "${payload.title}"${subjNote} vào ${dayLabel} (${startLocalTime} - ${endLocalTime}). Bạn có đồng ý lưu vào thời khóa biểu chính khóa không?`;

      const proposal = await saveProposalRecord(ctx.userId, {
        actionType: 'create_timetable_entry',
        conversationId: ctx.conversationId,
        payload,
        previewText,
      });

      return {
        success: true,
        requiresConfirmation: true,
        message: previewText,
        proposal,
      };
    },
    confirmExecutor: async (ctx, payload, conn) => {
      const activeTimetable = await timetableRepo.getOrCreateActiveTimetable(ctx.userId, conn);

      const entry = await timetableRepo.createTimetableEntry(ctx.userId, {
        timetableId: activeTimetable.id,
        subjectId: payload.subjectId,
        title: payload.title,
        teacher: payload.teacher,
        dayOfWeek: payload.dayOfWeek,
        startLocalTime: payload.startLocalTime,
        endLocalTime: payload.endLocalTime,
        location: payload.location,
        commuteBeforeMinutes: payload.commuteBeforeMinutes,
        commuteAfterMinutes: payload.commuteAfterMinutes,
      }, conn);

      return {
        success: true,
        message: `Đã thêm tiết học "${entry.title}" vào thời khóa biểu thành công!`,
        data: { entry },
        clientAction: {
          type: 'navigate',
          route: '/timetable',
        },
      };
    },
  } as MutateToolDefinition<z.infer<typeof PreviewAddTimetableEntryArgsSchema>>,

  // ==========================================
  // 4. preview_add_busy_event (Mutate)
  // ==========================================
  preview_add_busy_event: {
    name: 'preview_add_busy_event',
    description: 'Tạo đề xuất thêm sự kiện bận (học thêm, việc gia đình, ngoại khóa) vào lịch cần xác nhận.',
    kind: 'mutate',
    actionType: 'add_busy_event',
    schema: PreviewAddBusyEventArgsSchema,
    previewHandler: async (ctx, args) => {
      const payload = {
        title: args.title.trim(),
        startsAt: args.startsAt,
        endsAt: args.endsAt,
        type: args.type || 'personal',
        isAllDay: args.isAllDay ?? false,
        notes: args.notes,
        commuteBeforeMinutes: args.commuteBeforeMinutes ?? 0,
        commuteAfterMinutes: args.commuteAfterMinutes ?? 0,
      };

      const startTimeStr = formatVnTime(args.startsAt, ctx.timezone);
      const endTimeStr = formatVnTime(args.endsAt, ctx.timezone);
      const dateStr = formatVnDate(args.startsAt, ctx.timezone);
      const previewText = `Thêm lịch bận "${payload.title}" từ ${startTimeStr} đến ${endTimeStr} ngày ${dateStr}. Bạn có xác nhận thêm vào lịch không?`;

      const proposal = await saveProposalRecord(ctx.userId, {
        actionType: 'add_busy_event',
        conversationId: ctx.conversationId,
        payload,
        previewText,
      });

      return {
        success: true,
        requiresConfirmation: true,
        message: previewText,
        proposal,
      };
    },
    confirmExecutor: async (ctx, payload, conn) => {
      const event = await timetableRepo.createBusyEvent(ctx.userId, {
        title: payload.title,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
        type: payload.type || 'personal',
        isAllDay: payload.isAllDay,
        notes: payload.notes,
        commuteBeforeMinutes: payload.commuteBeforeMinutes,
        commuteAfterMinutes: payload.commuteAfterMinutes,
      }, conn);

      return {
        success: true,
        message: `Đã thêm lịch bận "${event.title}" thành công!`,
        data: { event },
        clientAction: {
          type: 'navigate',
          route: '/timetable',
        },
      };
    },
  } as MutateToolDefinition<z.infer<typeof PreviewAddBusyEventArgsSchema>>,

  // ==========================================
  // 5. preview_replan_tasks (Mutate)
  // ==========================================
  preview_replan_tasks: {
    name: 'preview_replan_tasks',
    description: 'Đề xuất sắp xếp lại toàn bộ nhiệm vụ học tập theo thuật toán tối ưu và yêu cầu xác nhận.',
    kind: 'mutate',
    actionType: 'replan_tasks',
    schema: PreviewReplanTasksArgsSchema,
    proposalSchema: z.object({
      plannerProposalId: z.string().min(1),
      reason: z.string().trim().min(1),
      strategy: z.enum(['balanced', 'urgent_first', 'deep_work']),
      daysCount: z.number().int().min(1).max(30),
      changesCount: z.number().int().min(0),
    }).strict(),
    previewHandler: async (ctx, args) => {
      const daysCount = args.daysCount || 7;
      const strategy = args.strategy || 'balanced';
      const reason = args.reason;

      const currentTasks = await taskRepo.getByUserId(ctx.userId);
      const busyEvents = await timetableRepo.getBusyEvents(ctx.userId);
      const timetableEntries = await timetableRepo.getTimetableEntries(ctx.userId);
      const availabilityRules = await timetableRepo.getAvailabilityRules(ctx.userId);
      const profile = await userRepo.getProfile(ctx.userId);

      if (!profile) {
        return { success: false, message: 'Bạn chưa thiết lập hồ sơ học tập để Jami có thể sắp xếp lại lịch.' };
      }

      const preview = DeterministicScheduler.generateScheduleProposal(
        currentTasks,
        currentTasks,
        busyEvents,
        timetableEntries,
        profile,
        new Date(),
        daysCount,
        reason,
        availabilityRules,
        ctx.timezone || 'Asia/Ho_Chi_Minh'
      );

      // Save real planner proposal in planner repository
      await plannerRepo.saveProposal(preview);

      const payload = {
        plannerProposalId: preview.id,
        reason,
        strategy,
        daysCount,
        changesCount: preview.tasksToSchedule.length,
      };

      const previewText = `Jami đã chuẩn bị phương án sắp xếp lại ${payload.changesCount} phiên học tập theo chiến lược tối ưu. Bạn có xác nhận áp dụng lịch mới không?`;

      const proposal = await saveProposalRecord(ctx.userId, {
        actionType: 'replan_tasks',
        conversationId: ctx.conversationId,
        payload,
        previewText,
      });

      return {
        success: true,
        requiresConfirmation: true,
        message: previewText,
        proposal,
      };
    },
    confirmExecutor: async (ctx, payload, conn) => {
      const plannerProposalId = payload.plannerProposalId;
      if (!plannerProposalId) {
        return {
          success: false,
          message: 'Không tìm thấy mã đề xuất kế hoạch plannerProposalId hợp lệ.',
        };
      }

      const applied = await plannerRepo.confirmProposal(ctx.userId, plannerProposalId);
      if (!applied) {
        return {
          success: false,
          message: 'Không thể áp dụng đề xuất kế hoạch (đề xuất không tồn tại hoặc đã hết hạn).',
        };
      }

      return {
        success: true,
        message: 'Đã áp dụng toàn bộ thời khóa biểu và kế hoạch học tập mới thành công!',
        clientAction: {
          type: 'navigate',
          route: '/timetable',
        },
      };
    },
  } as MutateToolDefinition<z.infer<typeof PreviewReplanTasksArgsSchema>>,

  // ==========================================
  // 6. preview_create_exam (Mutate)
  // ==========================================
  preview_create_exam: {
    name: 'preview_create_exam',
    description: 'Đề xuất tạo kỳ thi/kiểm tra và mục tiêu điểm số cần xác nhận trước khi lưu.',
    kind: 'mutate',
    actionType: 'create_exam',
    schema: PreviewCreateExamArgsSchema,
    previewHandler: async (ctx, args) => {
      const title = args.title.trim();
      const subjectName = args.subjectName.trim();
      const examAt = args.examAt;
      const targetScore = args.targetScore;
      const importance = args.importance || 'high';

      let subjectId: string | undefined = undefined;
      const subjects = await subjectRepo.getByUserId(ctx.userId);
      const matched = subjects.find((s) => s.name.toLowerCase().includes(subjectName.toLowerCase()));
      if (matched) {
        subjectId = matched.id;
      }

      const payload = {
        title,
        subjectId,
        subjectName,
        examAt,
        targetScore,
        importance,
        scopeText: args.scopeText,
        topics: args.topics || [],
      };

      const dateStr = formatVnDate(examAt, ctx.timezone);
      const scoreNote = targetScore !== undefined ? `, mục tiêu: ${targetScore} điểm` : '';
      const previewText = `Tạo kế hoạch thi môn "${subjectName}" (${title}) vào ngày ${dateStr}${scoreNote}. Bạn có đồng ý lưu không?`;

      const proposal = await saveProposalRecord(ctx.userId, {
        actionType: 'create_exam',
        conversationId: ctx.conversationId,
        payload,
        previewText,
      });

      return {
        success: true,
        requiresConfirmation: true,
        message: previewText,
        proposal,
      };
    },
    confirmExecutor: async (ctx, payload, conn) => {
      const exam = await examRepo.create(ctx.userId, {
        title: payload.title,
        subjectId: payload.subjectId,
        subjectName: payload.subjectName,
        examAt: payload.examAt,
        importance: payload.importance || 'high',
        targetScore: payload.targetScore,
        scopeText: payload.scopeText || '',
        topics: payload.topics?.map((t: any) => ({ name: typeof t === 'string' ? t : t.name, weight: t.weight || 1 })) || [],
      }, conn);

      return {
        success: true,
        message: `Đã tạo kế hoạch thi môn "${exam.title}" thành công!`,
        data: { exam },
        clientAction: {
          type: 'navigate',
          route: '/exams',
        },
      };
    },
  } as MutateToolDefinition<z.infer<typeof PreviewCreateExamArgsSchema>>,

  // ==========================================
  // 7. preview_create_mistake_entry (Mutate)
  // ==========================================
  preview_create_mistake_entry: {
    name: 'preview_create_mistake_entry',
    description: 'Đề xuất lưu một lỗi sai vào Sổ lỗi sai cá nhân (Mistake Notebook) cần xác nhận.',
    kind: 'mutate',
    actionType: 'create_mistake_entry',
    schema: PreviewCreateMistakeEntryArgsSchema,
    previewHandler: async (ctx, args) => {
      let subjectId: string | undefined = undefined;
      let subjectName = args.subjectName?.trim();

      if (subjectName) {
        const subjects = await subjectRepo.getByUserId(ctx.userId);
        const matched = subjects.find((s) => s.name.toLowerCase().includes(subjectName!.toLowerCase()));
        if (matched) {
          subjectId = matched.id;
          subjectName = matched.name;
        }
      }

      const payload = {
        subjectId,
        subjectName,
        topic: args.topic || 'Chung',
        questionText: args.questionText,
        selectedAnswer: args.selectedAnswer,
        correctAnswer: args.correctAnswer,
        correctSolution: args.correctSolution,
        mistakeReason: args.mistakeReason,
        lessonLearned: args.lessonLearned,
        severity: args.severity || 'medium',
      };

      const subjNote = payload.subjectName ? ` môn ${payload.subjectName}` : '';
      const previewText = `Lưu bài tập sai vào Sổ lỗi sai${subjNote} (Dạng: ${payload.topic}). Bạn có đồng ý lưu không?`;

      const proposal = await saveProposalRecord(ctx.userId, {
        actionType: 'create_mistake_entry',
        conversationId: ctx.conversationId,
        payload,
        previewText,
      });

      return {
        success: true,
        requiresConfirmation: true,
        message: previewText,
        proposal,
      };
    },
    confirmExecutor: async (ctx, payload, conn) => {
      const entry = await mistakeRepo.create(ctx.userId, {
        subjectId: payload.subjectId,
        topic: payload.topic || 'Chung',
        questionText: payload.questionText,
        selectedAnswer: payload.selectedAnswer,
        correctAnswer: payload.correctAnswer,
        correctExplanation: payload.correctExplanation,
        correctSolution: payload.correctSolution,
        lessonLearned: payload.lessonLearned,
        mistakeReason: (payload.mistakeReason as any) || 'other',
        difficulty: payload.severity === 'critical' ? 'hard' : payload.severity === 'minor' ? 'easy' : 'medium',
        sourceType: 'manual',
      });

      return {
        success: true,
        message: `Đã lưu câu hỏi sai vào Sổ lỗi sai thành công!`,
        data: { entry },
        clientAction: {
          type: 'navigate',
          route: '/mistakes',
        },
      };
    },
  } as MutateToolDefinition<z.infer<typeof PreviewCreateMistakeEntryArgsSchema>>,

  // ==========================================
  // 8. preview_create_reminder (Mutate)
  // ==========================================
  preview_create_reminder: {
    name: 'preview_create_reminder',
    description: 'Đề xuất tạo thông báo nhắc nhở vào một thời điểm cụ thể cần xác nhận.',
    kind: 'mutate',
    actionType: 'create_reminder',
    schema: PreviewCreateReminderArgsSchema,
    previewHandler: async (ctx, args) => {
      const payload = {
        title: args.title.trim(),
        body: args.body?.trim() || args.title.trim(),
        scheduledFor: args.scheduledFor,
        priority: args.priority || 'medium',
        actionUrl: args.actionUrl || '/today',
      };

      const timeStr = formatVnTime(args.scheduledFor, ctx.timezone);
      const dateStr = formatVnDate(args.scheduledFor, ctx.timezone);
      const previewText = `Tạo lời nhắc "${payload.title}" lúc ${timeStr} ngày ${dateStr}. Bạn có xác nhận tạo lời nhắc không?`;

      const proposal = await saveProposalRecord(ctx.userId, {
        actionType: 'create_reminder',
        conversationId: ctx.conversationId,
        payload,
        previewText,
      });

      return {
        success: true,
        requiresConfirmation: true,
        message: previewText,
        proposal,
      };
    },
    confirmExecutor: async (ctx, payload, conn) => {
      const notif = await notificationRepo.create(ctx.userId, {
        type: 'system',
        title: payload.title,
        body: payload.body || payload.title,
        scheduledFor: payload.scheduledFor,
        actionUrl: payload.actionUrl || '/today',
      });

      return {
        success: true,
        message: `Đã thiết lập thông báo nhắc nhở "${notif.title}" thành công!`,
        data: { notification: notif },
        clientAction: {
          type: 'navigate',
          route: '/notifications',
        },
      };
    },
  } as MutateToolDefinition<z.infer<typeof PreviewCreateReminderArgsSchema>>,

  // ==========================================
  // 9. preview_mark_task_completed (Mutate)
  // ==========================================
  preview_mark_task_completed: {
    name: 'preview_mark_task_completed',
    description: 'Đề xuất đánh dấu hoàn thành một nhiệm vụ học tập cần xác nhận.',
    kind: 'mutate',
    actionType: 'mark_task_completed',
    schema: PreviewMarkTaskCompletedArgsSchema,
    previewHandler: async (ctx, args) => {
      const tasks = await taskRepo.getByUserId(ctx.userId);
      let targetTask = tasks.find((t) => t.id === args.taskId);

      if (!targetTask && args.taskTitle) {
        const queryTitle = args.taskTitle.toLowerCase();
        const matches = tasks.filter((t) => t.title.toLowerCase().includes(queryTitle) && t.status !== 'completed');

        if (matches.length === 1) {
          targetTask = matches[0];
        } else if (matches.length > 1) {
          const candidateList = matches.slice(0, 5).map((t) => `• ${t.title} (${t.subjectName || 'Môn học'})`).join('\n');
          return {
            success: false,
            message: `Jami tìm thấy ${matches.length} nhiệm vụ phù hợp với "${args.taskTitle}". Vui lòng chọn rõ nhiệm vụ bạn muốn hoàn thành:\n${candidateList}`,
          };
        }
      }

      if (!targetTask) {
        return {
          success: false,
          message: `Không tìm thấy nhiệm vụ nào phù hợp để đánh dấu hoàn thành.`,
        };
      }

      const payload = {
        taskId: targetTask.id,
        taskTitle: targetTask.title,
      };

      const previewText = `Đánh dấu hoàn thành nhiệm vụ "${targetTask.title}". Bạn có xác nhận không?`;

      const proposal = await saveProposalRecord(ctx.userId, {
        actionType: 'mark_task_completed',
        conversationId: ctx.conversationId,
        payload,
        previewText,
      });

      return {
        success: true,
        requiresConfirmation: true,
        message: previewText,
        proposal,
      };
    },
    confirmExecutor: async (ctx, payload, conn) => {
      const updated = await taskRepo.completeTask(ctx.userId, payload.taskId);
      return {
        success: true,
        message: `Đã đánh dấu hoàn thành nhiệm vụ "${payload.taskTitle || updated?.title}"! Chúc mừng bạn! 🎉`,
        data: { task: updated },
        clientAction: {
          type: 'navigate',
          route: '/tasks',
        },
      };
    },
  } as MutateToolDefinition<z.infer<typeof PreviewMarkTaskCompletedArgsSchema>>,

  // ==========================================
  // 10. preview_cancel_event (Mutate)
  // ==========================================
  preview_cancel_event: {
    name: 'preview_cancel_event',
    description: 'Đề xuất hủy một sự kiện bận, tiết học, nhiệm vụ hoặc lời nhắc cần xác nhận.',
    kind: 'mutate',
    actionType: 'cancel_event',
    schema: PreviewCancelEventArgsSchema,
    previewHandler: async (ctx, args) => {
      const { eventType, eventId, reason } = args;

      // Ownership pre-check before creating proposal
      let eventTitle = 'sự kiện';
      if (eventType === 'busy_event') {
        const events = await timetableRepo.getBusyEvents(ctx.userId);
        const ev = events.find((e) => e.id === eventId);
        if (!ev) return { success: false, message: 'Không tìm thấy sự kiện bận hoặc không thuộc quyền sở hữu của bạn.' };
        eventTitle = `Sự kiện bận "${ev.title}"`;
      } else if (eventType === 'timetable_entry') {
        const entries = await timetableRepo.getTimetableEntries(ctx.userId);
        const ent = entries.find((e) => e.id === eventId);
        if (!ent) return { success: false, message: 'Không tìm thấy tiết học hoặc không thuộc quyền sở hữu của bạn.' };
        eventTitle = `Tiết học "${ent.title}"`;
      } else if (eventType === 'task') {
        const task = await taskRepo.getById(ctx.userId, eventId);
        if (!task) return { success: false, message: 'Không tìm thấy nhiệm vụ hoặc không thuộc quyền sở hữu của bạn.' };
        eventTitle = `Nhiệm vụ "${task.title}"`;
      } else if (eventType === 'reminder') {
        const notif = await notificationRepo.getById(ctx.userId, eventId);
        if (!notif) return { success: false, message: 'Không tìm thấy lời nhắc hoặc không thuộc quyền sở hữu của bạn.' };
        eventTitle = `Lời nhắc "${notif.title}"`;
      }

      const payload = {
        eventType,
        eventId,
        eventTitle,
        reason,
      };

      const previewText = `Hủy ${eventTitle}. Bạn có xác nhận hủy khỏi hệ thống không?`;

      const proposal = await saveProposalRecord(ctx.userId, {
        actionType: 'cancel_event',
        conversationId: ctx.conversationId,
        payload,
        previewText,
      });

      return {
        success: true,
        requiresConfirmation: true,
        message: previewText,
        proposal,
      };
    },
    confirmExecutor: async (ctx, payload, conn) => {
      const { eventType, eventId } = payload;

      if (eventType === 'busy_event') {
        await timetableRepo.deleteBusyEvent(ctx.userId, eventId, conn);
      } else if (eventType === 'timetable_entry') {
        await timetableRepo.deleteTimetableEntry(ctx.userId, eventId, conn);
      } else if (eventType === 'task') {
        await taskRepo.deleteTask(ctx.userId, eventId);
      } else if (eventType === 'reminder') {
        await notificationRepo.delete(ctx.userId, eventId);
      }

      return {
        success: true,
        message: `Đã hủy ${payload.eventTitle || 'sự kiện'} thành công.`,
        clientAction: {
          type: 'refresh',
        },
      };
    },
  } as MutateToolDefinition<z.infer<typeof PreviewCancelEventArgsSchema>>,

  // ==========================================
  // 11. get_daily_schedule (Read)
  // ==========================================
  get_daily_schedule: {
    name: 'get_daily_schedule',
    description: 'Tra cứu toàn bộ lịch học chính khóa, sự kiện bận và nhiệm vụ học tập theo ngày.',
    kind: 'read',
    schema: GetDailyScheduleArgsSchema,
    handler: async (ctx, args) => {
      const timeInfo = getNowInTimeZone(ctx.timezone);
      const targetDateStr = args?.date || timeInfo.currentDateStr;
      const targetDate = new Date(`${targetDateStr}T00:00:00Z`);
      const jsDay = targetDate.getUTCDay();
      const dow = jsDay === 0 ? 7 : jsDay;

      const timetables = await timetableRepo.getTimetables(ctx.userId);
      const activeTimetable = timetables.find((t) => t.isActive) || timetables[0];
      const todayEntries = activeTimetable?.entries?.filter((e) => e.dayOfWeek === dow) || [];

      const busyEvents = await timetableRepo.getBusyEvents(ctx.userId);
      const dayBusy = busyEvents.filter((b) => {
        const start = new Date(b.startsAt);
        return start.toISOString().startsWith(targetDateStr);
      });

      const tasks = await taskRepo.getByUserId(ctx.userId);
      const dayTasks = tasks.filter((t) => {
        if (!t.scheduledStartAt) return false;
        return t.scheduledStartAt.startsWith(targetDateStr);
      });

      return {
        success: true,
        message: `Lịch ngày ${targetDateStr}: ${todayEntries.length} tiết học, ${dayBusy.length} sự kiện bận, ${dayTasks.length} nhiệm vụ.`,
        data: {
          date: targetDateStr,
          dayOfWeek: dow,
          schoolEntries: todayEntries,
          busyEvents: dayBusy,
          tasks: dayTasks,
        },
      };
    },
  } as ReadToolDefinition<z.infer<typeof GetDailyScheduleArgsSchema>>,

  // ==========================================
  // 12. get_next_task (Read)
  // ==========================================
  get_next_task: {
    name: 'get_next_task',
    description: 'Xem nhiệm vụ học tập tiếp theo cần làm của học sinh.',
    kind: 'read',
    schema: GetNextTaskArgsSchema,
    handler: async (ctx) => {
      const tasks = await taskRepo.getByUserId(ctx.userId);
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
    },
  } as ReadToolDefinition<z.infer<typeof GetNextTaskArgsSchema>>,

  // ==========================================
  // 13. get_subject_progress (Read)
  // ==========================================
  get_subject_progress: {
    name: 'get_subject_progress',
    description: 'Tra cứu tiến độ học tập, điểm số và số bài tập đã hoàn thành của một môn học.',
    kind: 'read',
    schema: GetSubjectProgressArgsSchema,
    handler: async (ctx, args) => {
      const subjects = await subjectRepo.getByUserId(ctx.userId);
      const querySubject = (args?.subject || args?.subjectName || '').trim().toLowerCase();
      const filtered = querySubject
        ? subjects.filter((s) => s.name.toLowerCase().includes(querySubject))
        : subjects;

      const tasks = await taskRepo.getByUserId(ctx.userId);
      const subjectStats = filtered.map((s) => {
        const subTasks = tasks.filter((t) => t.subjectId === s.id);
        const completed = subTasks.filter((t) => t.status === 'completed').length;
        return {
          id: s.id,
          name: s.name,
          totalTasks: subTasks.length,
          completedTasks: completed,
          completionRate: subTasks.length > 0 ? Math.round((completed / subTasks.length) * 100) : 0,
        };
      });

      return {
        success: true,
        message: `Đã lấy thông tin tiến độ của ${subjectStats.length} môn học.`,
        data: { subjects: subjectStats },
      };
    },
  } as ReadToolDefinition<z.infer<typeof GetSubjectProgressArgsSchema>>,

  // ==========================================
  // 14. get_upcoming_exams (Read)
  // ==========================================
  get_upcoming_exams: {
    name: 'get_upcoming_exams',
    description: 'Xem danh sách các kỳ thi và bài kiểm tra sắp tới.',
    kind: 'read',
    schema: GetUpcomingExamsArgsSchema,
    handler: async (ctx, args) => {
      const daysAhead = args?.daysAhead || 30;
      const plans = await examRepo.getByUserId(ctx.userId);
      const now = new Date();
      const maxDate = new Date(now.getTime() + daysAhead * 24 * 3600 * 1000);

      const upcoming = plans.filter((p) => {
        const examDate = new Date(p.examAt);
        return examDate >= now && examDate <= maxDate;
      });

      return {
        success: true,
        message: `Bạn có ${upcoming.length} kỳ thi trong ${daysAhead} ngày tới.`,
        data: { upcomingExams: upcoming },
      };
    },
  } as ReadToolDefinition<z.infer<typeof GetUpcomingExamsArgsSchema>>,

  // ==========================================
  // 15. get_mistake_summary (Read)
  // ==========================================
  get_mistake_summary: {
    name: 'get_mistake_summary',
    description: 'Xem tóm tắt các lỗi sai thường gặp trong Sổ lỗi sai cá nhân theo môn học.',
    kind: 'read',
    schema: GetMistakeSummaryArgsSchema,
    handler: async (ctx, args) => {
      const mistakes = await mistakeRepo.getByUserId(ctx.userId);
      const querySubject = (args?.subject || args?.subjectName || '').trim().toLowerCase();
      const filtered = querySubject
        ? mistakes.filter((m) => m.subjectName?.toLowerCase().includes(querySubject))
        : mistakes;

      const unmastered = filtered.filter((m) => m.status !== 'mastered');

      return {
        success: true,
        message: `Sổ lỗi sai có ${filtered.length} mục (${unmastered.length} mục chưa khắc phục).`,
        data: {
          total: filtered.length,
          unmasteredCount: unmastered.length,
          recentMistakes: unmastered.slice(0, 5),
        },
      };
    },
  } as ReadToolDefinition<z.infer<typeof GetMistakeSummaryArgsSchema>>,

  // ==========================================
  // 16. get_unread_notifications (Read)
  // ==========================================
  get_unread_notifications: {
    name: 'get_unread_notifications',
    description: 'Xem danh sách các thông báo chưa đọc của học sinh.',
    kind: 'read',
    schema: GetUnreadNotificationsArgsSchema,
    handler: async (ctx, args) => {
      const limit = args?.limit || 10;
      const res = await notificationRepo.getPaginated(ctx.userId, { status: 'unread', limit });

      return {
        success: true,
        message: `Bạn có ${res.notifications.length} thông báo chưa đọc.`,
        data: { notifications: res.notifications },
      };
    },
  } as ReadToolDefinition<z.infer<typeof GetUnreadNotificationsArgsSchema>>,

  // ==========================================
  // 17. get_task_details (Read)
  // ==========================================
  get_task_details: {
    name: 'get_task_details',
    description: 'Tra cứu thông tin chi tiết, hướng dẫn làm bài và tiêu chuẩn đạt của một nhiệm vụ.',
    kind: 'read',
    schema: GetTaskDetailsArgsSchema,
    handler: async (ctx, args) => {
      const task = await taskRepo.getById(ctx.userId, args.taskId);
      if (!task) {
        return {
          success: false,
          message: `Không tìm thấy nhiệm vụ với mã ${args.taskId}.`,
        };
      }

      return {
        success: true,
        message: `Nhiệm vụ: ${task.title} (${task.subjectName || 'Môn học'})`,
        data: { task },
      };
    },
  } as ReadToolDefinition<z.infer<typeof GetTaskDetailsArgsSchema>>,

  // ==========================================
  // 18. search_materials (Read)
  // ==========================================
  search_materials: {
    name: 'search_materials',
    description: 'Tìm kiếm tài liệu học tập, sách giáo khoa, ghi chú hoặc bài tập trong kho tài liệu.',
    kind: 'read',
    schema: SearchMaterialsArgsSchema,
    handler: async (ctx, args) => {
      const query = (args?.query || '').trim().toLowerCase();
      const limit = args?.limit || 5;
      const materials = await materialRepo.getByUserId(ctx.userId);

      const matched = materials
        .filter(
          (m) =>
            m.title.toLowerCase().includes(query) ||
            m.subjectName?.toLowerCase().includes(query) ||
            m.summary?.toLowerCase().includes(query)
        )
        .slice(0, limit);

      return {
        success: true,
        message: `Tìm thấy ${matched.length} tài liệu phù hợp với "${query}".`,
        data: { materials: matched },
      };
    },
  } as ReadToolDefinition<z.infer<typeof SearchMaterialsArgsSchema>>,

  // ==========================================
  // 19. navigate_to (Read / Client Navigation)
  // ==========================================
  navigate_to: {
    name: 'navigate_to',
    description: 'Điều hướng giao diện ứng dụng tới trang được phép (/today, /timetable, /tasks, /focus, /exams, /materials, /reports, /notifications, /settings, /jami).',
    kind: 'read',
    schema: NavigateToArgsSchema,
    handler: async (ctx, args) => {
      const route = args.route;
      const routeLabels: Record<string, string> = {
        '/today': 'Tổng quan hôm nay',
        '/timetable': 'Thời khóa biểu',
        '/tasks': 'Danh sách nhiệm vụ',
        '/focus': 'Hẹn giờ tập trung',
        '/exams': 'Quản lý thi & ôn tập',
        '/materials': 'Kho tài liệu học tập',
        '/reports': 'Báo cáo học tập',
        '/notifications': 'Thông báo',
        '/settings': 'Cài đặt hệ thống',
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
    },
  } as ReadToolDefinition<z.infer<typeof NavigateToArgsSchema>>,

  // ==========================================
  // 20. start_focus_timer (Immediate)
  // ==========================================
  start_focus_timer: {
    name: 'start_focus_timer',
    description: 'Bắt đầu phiên hẹn giờ tập trung (Pomodoro) thật trong hệ thống.',
    kind: 'immediate',
    schema: StartFocusTimerArgsSchema,
    handler: async (ctx, args) => {
      const plannedMinutes = args.plannedMinutes || 25;
      const session = await focusRepo.createSession(ctx.userId, {
        plannedMinutes,
        taskId: args.taskId,
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
    },
  } as ReadToolDefinition<z.infer<typeof StartFocusTimerArgsSchema>>,
};

export type CanonicalToolName = keyof typeof TOOL_REGISTRY;
export type JamiActionType =
  | 'create_task'
  | 'create_scheduled_task'
  | 'create_timetable_entry'
  | 'add_busy_event'
  | 'replan_tasks'
  | 'create_exam'
  | 'create_mistake_entry'
  | 'create_reminder'
  | 'mark_task_completed'
  | 'cancel_event';

export const ACTION_TYPE_TO_TOOL: Record<JamiActionType, CanonicalToolName> = {
  create_task: 'preview_create_task',
  create_scheduled_task: 'preview_create_scheduled_task',
  create_timetable_entry: 'preview_add_timetable_entry',
  add_busy_event: 'preview_add_busy_event',
  replan_tasks: 'preview_replan_tasks',
  create_exam: 'preview_create_exam',
  create_mistake_entry: 'preview_create_mistake_entry',
  create_reminder: 'preview_create_reminder',
  mark_task_completed: 'preview_mark_task_completed',
  cancel_event: 'preview_cancel_event',
};

for (const [actionType, toolName] of Object.entries(ACTION_TYPE_TO_TOOL)) {
  const tool = TOOL_REGISTRY[toolName];
  if (!tool || tool.kind !== 'mutate' || tool.actionType !== actionType) {
    throw new Error(`Invalid canonical action mapping: ${actionType} -> ${toolName}`);
  }
}

/**
 * Get definition for a canonical tool name
 */
export function getToolDefinition(name: string): AnyToolDefinition | undefined {
  const tool = (TOOL_REGISTRY as any)[name];
  if (!tool) return undefined;
  return {
    ...tool,
    openAiDefinition: getOpenAiToolDefinition(name as CanonicalToolName),
  };
}

/**
 * Generates canonical OpenAI Tool Definition from Zod schema with additionalProperties:false and strict:true
 */
export function getOpenAiToolDefinition(toolName: CanonicalToolName) {
  const tool = TOOL_REGISTRY[toolName];
  if (!tool) throw new Error(`Unknown tool: ${toolName}`);

  return {
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: generateOpenAiParameters(tool.schema),
      strict: true,
    },
  };
}

/**
 * Get all 20 canonical OpenAI function definitions generated directly from Zod schemas
 */
export function getAllOpenAiToolDefinitions() {
  return (Object.keys(TOOL_REGISTRY) as CanonicalToolName[]).map((name) => getOpenAiToolDefinition(name));
}

/**
 * Execute a tool safely through the registry (Single Source of Execution)
 */
export async function executeRegisteredTool(
  userIdOrContext: string | ToolContext,
  toolName: string,
  rawArgs: any,
  legacyContext?: { conversationId?: string }
): Promise<ActionResult> {
  const tool = getToolDefinition(toolName);
  if (!tool) {
    return {
      success: false,
      message: `Thao tác "${toolName}" không nằm trong danh mục công cụ được phép.`,
    };
  }

  // Build ToolContext
  let ctx: ToolContext;
  if (typeof userIdOrContext === 'string') {
    ctx = {
      userId: userIdOrContext,
      conversationId: legacyContext?.conversationId,
      source: 'text',
      timezone: 'Asia/Ho_Chi_Minh',
      now: new Date(),
    };
  } else {
    ctx = userIdOrContext;
  }

  // Parse & validate args against Zod schema
  const parseResult = tool.schema.safeParse(rawArgs || {});
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues.map((i) => i.message).join('; ');
    return {
      success: false,
      message: `Tham số không hợp lệ cho thao tác "${toolName}": ${errorMsg}`,
    };
  }

  if (tool.kind === 'mutate') {
    return tool.previewHandler(ctx, parseResult.data);
  } else {
    return tool.handler(ctx, parseResult.data);
  }
}

/**
 * Find a mutate tool definition by actionType or toolName
 */
export function findMutateToolByActionType(actionType: string): MutateToolDefinition | undefined {
  if (!(actionType in ACTION_TYPE_TO_TOOL)) return undefined;
  const tool = TOOL_REGISTRY[ACTION_TYPE_TO_TOOL[actionType as JamiActionType]];
  return tool?.kind === 'mutate' ? tool : undefined;
}
