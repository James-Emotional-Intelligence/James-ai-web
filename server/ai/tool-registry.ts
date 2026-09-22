import { z } from 'zod';
import {
  PreviewCreateTaskArgsSchema,
  PreviewAddBusyEventArgsSchema,
  PreviewReplanTasksArgsSchema,
  PreviewAddTimetableEntryArgsSchema,
  PreviewCreateExamPlanArgsSchema,
  PreviewCreateMistakeEntryArgsSchema,
  PreviewCreateReminderArgsSchema,
  PreviewCancelEventArgsSchema,
  GetDailyScheduleArgsSchema,
  GetSubjectProgressArgsSchema,
  GetUpcomingExamsArgsSchema,
  GetMistakeSummaryArgsSchema,
  GetUnreadNotificationsArgsSchema,
  GetTaskDetailsArgsSchema,
  SearchMaterialsArgsSchema,
  NavigateToArgsSchema,
  StartFocusTimerArgsSchema,
} from '../../shared/schemas';
import { JamiActionService, ActionResult, ALLOWED_NAVIGATE_ROUTES } from '../services/jami-action-service';
import { timetableRepo } from '../repositories/timetable-repository';
import { taskRepo } from '../repositories/task-repository';
import { examRepo } from '../repositories/exam-repository';
import { mistakeRepo } from '../repositories/mistake-repository';
import { notificationRepo } from '../repositories/notification-repository';
import { materialRepo } from '../repositories/material-repository';
import { reportRepo } from '../repositories/report-repository';
import { subjectRepo } from '../repositories/subject-repository';
import { focusRepo } from '../repositories/focus-repository';
import {
  resolveVietnameseDayOfWeek,
  calculateTargetDateTimeIso,
  getNowInTimeZone,
  formatVnDate,
  formatVnTime,
} from '../lib/date-time';

export type ToolKind = 'read' | 'mutate';

export interface ToolDefinition<TArgs = any> {
  name: string;
  description: string;
  kind: ToolKind;
  schema: z.ZodSchema<TArgs>;
  openAiDefinition: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  };
  handler: (userId: string, args: TArgs, context?: { conversationId?: string }) => Promise<ActionResult>;
}

const jamiActionService = JamiActionService.getInstance();

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  preview_create_task: {
    name: 'preview_create_task',
    description: 'Tạo bản nháp nhiệm vụ học tập cần học sinh xác nhận trước khi lưu vào hệ thống.',
    kind: 'mutate',
    schema: PreviewCreateTaskArgsSchema,
    openAiDefinition: {
      type: 'function',
      function: {
        name: 'preview_create_task',
        description: 'Tạo bản nháp nhiệm vụ học tập cần học sinh xác nhận.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Tiêu đề nhiệm vụ học tập' },
            subject: { type: 'string', description: 'Tên môn học (Toán học, Vật lí, Hóa học...)' },
            estimatedMinutes: { type: 'number', description: 'Thời lượng dự kiến (phút, 15-180)' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Mức độ ưu tiên' },
            dueAt: { type: 'string', description: 'Hạn chót hoàn thành (ISO timestamp)' },
            scheduledStartAt: { type: 'string', description: 'Thời điểm bắt đầu dự kiến (ISO timestamp)' },
            scheduledEndAt: { type: 'string', description: 'Thời điểm kết thúc dự kiến (ISO timestamp)' },
            notes: { type: 'string', description: 'Ghi chú thêm cho nhiệm vụ' },
          },
          required: ['title'],
        },
      },
    },
    handler: async (userId, args, context) => {
      return jamiActionService.executeTool(userId, 'preview_create_task', args, context?.conversationId);
    },
  },

  preview_add_busy_event: {
    name: 'preview_add_busy_event',
    description: 'Tạo đề xuất thêm sự kiện bận (học thêm, ngoại khóa, việc gia đình) vào lịch.',
    kind: 'mutate',
    schema: PreviewAddBusyEventArgsSchema,
    openAiDefinition: {
      type: 'function',
      function: {
        name: 'preview_add_busy_event',
        description: 'Tạo đề xuất thêm sự kiện bận cần xác nhận.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Tên sự kiện bận' },
            startsAt: { type: 'string', description: 'Thời gian bắt đầu (ISO 8601)' },
            endsAt: { type: 'string', description: 'Thời gian kết thúc (ISO 8601)' },
            isAllDay: { type: 'boolean', description: 'Sự kiện cả ngày' },
            notes: { type: 'string', description: 'Ghi chú sự kiện' },
            commuteBeforeMinutes: { type: 'number', description: 'Thời gian di chuyển trước (phút)' },
            commuteAfterMinutes: { type: 'number', description: 'Thời gian di chuyển sau (phút)' },
          },
          required: ['title', 'startsAt', 'endsAt'],
        },
      },
    },
    handler: async (userId, args, context) => {
      return jamiActionService.executeTool(userId, 'preview_add_busy_event', args, context?.conversationId);
    },
  },

  preview_replan_tasks: {
    name: 'preview_replan_tasks',
    description: 'Đề xuất sắp xếp lại toàn bộ nhiệm vụ học tập theo thuật toán tối ưu và yêu cầu người dùng xác nhận.',
    kind: 'mutate',
    schema: PreviewReplanTasksArgsSchema,
    openAiDefinition: {
      type: 'function',
      function: {
        name: 'preview_replan_tasks',
        description: 'Đề xuất sắp xếp lại lịch học/nhiệm vụ tối ưu.',
        parameters: {
          type: 'object',
          properties: {
            strategy: { type: 'string', enum: ['balanced', 'urgent_first', 'deep_work'], description: 'Chiến lược tối ưu' },
            targetDate: { type: 'string', description: 'Ngày áp dụng (YYYY-MM-DD)' },
            preserveLocked: { type: 'boolean', description: 'Giữ nguyên các khối lịch đã chốt' },
          },
        },
      },
    },
    handler: async (userId, args, context) => {
      return jamiActionService.executeTool(userId, 'preview_replan_tasks', args, context?.conversationId);
    },
  },

  preview_add_timetable_entry: {
    name: 'preview_add_timetable_entry',
    description: 'Đề xuất thêm một tiết học vào thời khóa biểu chính khóa (Thứ 2 đến Chủ nhật) cần xác nhận.',
    kind: 'mutate',
    schema: PreviewAddTimetableEntryArgsSchema,
    openAiDefinition: {
      type: 'function',
      function: {
        name: 'preview_add_timetable_entry',
        description: 'Đề xuất thêm tiết học vào thời khóa biểu.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Tên môn học / tiết học' },
            subject: { type: 'string', description: 'Tên môn học chuẩn hóa' },
            teacher: { type: 'string', description: 'Tên giáo viên phụ trách' },
            dayOfWeek: { type: 'number', description: 'Thứ trong tuần (1=Thứ Hai ... 7=Chủ Nhật)' },
            startLocalTime: { type: 'string', description: 'Giờ bắt đầu dạng HH:mm (ví dụ 07:30)' },
            endLocalTime: { type: 'string', description: 'Giờ kết thúc dạng HH:mm (ví dụ 08:15)' },
            location: { type: 'string', description: 'Phòng học / địa điểm' },
          },
          required: ['title', 'dayOfWeek', 'startLocalTime', 'endLocalTime'],
        },
      },
    },
    handler: async (userId, args, context) => {
      return jamiActionService.executeTool(userId, 'preview_create_timetable_entry', args, context?.conversationId);
    },
  },

  preview_create_exam_plan: {
    name: 'preview_create_exam_plan',
    description: 'Đề xuất kế hoạch ôn thi và mục tiêu điểm số cho một môn học cụ thể cần xác nhận.',
    kind: 'mutate',
    schema: PreviewCreateExamPlanArgsSchema,
    openAiDefinition: {
      type: 'function',
      function: {
        name: 'preview_create_exam_plan',
        description: 'Đề xuất kế hoạch ôn thi.',
        parameters: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: 'Tên môn thi' },
            examDate: { type: 'string', description: 'Ngày thi (ISO hoặc YYYY-MM-DD)' },
            targetScore: { type: 'number', description: 'Mục tiêu điểm số (thang điểm 10)' },
            topics: { type: 'array', items: { type: 'string' }, description: 'Các chuyên đề trọng tâm ôn thi' },
            notes: { type: 'string', description: 'Ghi chú chuẩn bị ôn thi' },
          },
          required: ['subject', 'examDate'],
        },
      },
    },
    handler: async (userId, args, context) => {
      return jamiActionService.executeTool(userId, 'create_exam_plan', args, context?.conversationId);
    },
  },

  preview_create_mistake_entry: {
    name: 'preview_create_mistake_entry',
    description: 'Đề xuất lưu một lỗi sai vào Sổ lỗi sai cá nhân (Mistake Notebook) cần xác nhận.',
    kind: 'mutate',
    schema: PreviewCreateMistakeEntryArgsSchema,
    openAiDefinition: {
      type: 'function',
      function: {
        name: 'preview_create_mistake_entry',
        description: 'Đề xuất lưu bài toán/câu hỏi sai vào Sổ lỗi sai.',
        parameters: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: 'Môn học' },
            topic: { type: 'string', description: 'Chuyên đề / dạng bài' },
            problemStatement: { type: 'string', description: 'Đề bài hoặc câu hỏi bị sai' },
            studentMistake: { type: 'string', description: 'Nguyên nhân sai hoặc cách làm sai' },
            correctSolution: { type: 'string', description: 'Lời giải đúng và chuẩn xác' },
            lessonLearned: { type: 'string', description: 'Bài học rút ra để tránh lặp lại' },
            severity: { type: 'string', enum: ['minor', 'medium', 'critical'], description: 'Mức độ nghiêm trọng của lỗi' },
          },
          required: ['problemStatement', 'studentMistake', 'correctSolution'],
        },
      },
    },
    handler: async (userId, args, context) => {
      return jamiActionService.executeTool(userId, 'create_mistake_entry', args, context?.conversationId);
    },
  },

  preview_create_reminder: {
    name: 'preview_create_reminder',
    description: 'Đề xuất tạo thông báo nhắc nhở vào một thời điểm cụ thể cần xác nhận.',
    kind: 'mutate',
    schema: PreviewCreateReminderArgsSchema,
    openAiDefinition: {
      type: 'function',
      function: {
        name: 'preview_create_reminder',
        description: 'Đề xuất tạo thông báo nhắc nhở.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Nội dung nhắc nhở' },
            scheduledFor: { type: 'string', description: 'Thời điểm nhắc (ISO timestamp)' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Mức ưu tiên' },
            notes: { type: 'string', description: 'Chi tiết thêm' },
          },
          required: ['title', 'scheduledFor'],
        },
      },
    },
    handler: async (userId, args, context) => {
      return jamiActionService.executeTool(userId, 'create_reminder', args, context?.conversationId);
    },
  },

  preview_cancel_event: {
    name: 'preview_cancel_event',
    description: 'Đề xuất hủy một sự kiện, tiết học hoặc nhiệm vụ khỏi hệ thống cần xác nhận.',
    kind: 'mutate',
    schema: PreviewCancelEventArgsSchema,
    openAiDefinition: {
      type: 'function',
      function: {
        name: 'preview_cancel_event',
        description: 'Đề xuất hủy sự kiện/tiết học/nhiệm vụ.',
        parameters: {
          type: 'object',
          properties: {
            eventType: { type: 'string', enum: ['busy_event', 'timetable_entry', 'task'], description: 'Loại sự kiện cần hủy' },
            eventId: { type: 'string', description: 'Mã định danh sự kiện' },
            reason: { type: 'string', description: 'Lý do hủy' },
          },
          required: ['eventType', 'eventId'],
        },
      },
    },
    handler: async (userId, args, context) => {
      return jamiActionService.executeTool(userId, 'cancel_event', args, context?.conversationId);
    },
  },

  get_daily_schedule: {
    name: 'get_daily_schedule',
    description: 'Tra cứu toàn bộ lịch học chính khóa, sự kiện bận và nhiệm vụ học tập theo ngày.',
    kind: 'read',
    schema: GetDailyScheduleArgsSchema,
    openAiDefinition: {
      type: 'function',
      function: {
        name: 'get_daily_schedule',
        description: 'Xem lịch học và nhiệm vụ trong một ngày cụ thể.',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Ngày cần xem dạng YYYY-MM-DD (mặc định là hôm nay)' },
          },
        },
      },
    },
    handler: async (userId, args) => {
      const nowInfo = getNowInTimeZone();
      const targetDateStr = args?.date || nowInfo.currentDateStr;
      const targetDate = new Date(`${targetDateStr}T00:00:00Z`);
      const jsDay = targetDate.getUTCDay();
      const dow = jsDay === 0 ? 7 : jsDay;

      const timetables = await timetableRepo.getTimetables(userId);
      const activeTimetable = timetables.find((t) => t.isActive) || timetables[0];
      const todayEntries = activeTimetable?.entries?.filter((e) => e.dayOfWeek === dow) || [];

      const busyEvents = await timetableRepo.getBusyEvents(userId);
      const dayBusy = busyEvents.filter((b) => {
        const start = new Date(b.startsAt);
        return start.toISOString().startsWith(targetDateStr);
      });

      const tasks = await taskRepo.getByUserId(userId);
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
  },

  get_subject_progress: {
    name: 'get_subject_progress',
    description: 'Tra cứu tiến độ học tập, điểm số và số bài tập đã hoàn thành của một môn học.',
    kind: 'read',
    schema: GetSubjectProgressArgsSchema,
    openAiDefinition: {
      type: 'function',
      function: {
        name: 'get_subject_progress',
        description: 'Xem tiến độ học tập theo môn học.',
        parameters: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: 'Tên môn học (ví dụ: Toán học, Vật lí)' },
          },
        },
      },
    },
    handler: async (userId, args) => {
      const subjects = await subjectRepo.getByUserId(userId);
      const querySubject = (args?.subject || '').trim().toLowerCase();
      const filtered = querySubject
        ? subjects.filter((s) => s.name.toLowerCase().includes(querySubject))
        : subjects;

      const tasks = await taskRepo.getByUserId(userId);
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
  },

  get_upcoming_exams: {
    name: 'get_upcoming_exams',
    description: 'Xem danh sách các kỳ thi và bài kiểm tra sắp tới trong thời gian tới.',
    kind: 'read',
    schema: GetUpcomingExamsArgsSchema,
    openAiDefinition: {
      type: 'function',
      function: {
        name: 'get_upcoming_exams',
        description: 'Xem các kỳ thi sắp tới.',
        parameters: {
          type: 'object',
          properties: {
            daysAhead: { type: 'number', description: 'Số ngày tới cần xem (mặc định 30 ngày)' },
          },
        },
      },
    },
    handler: async (userId, args) => {
      const daysAhead = args?.daysAhead || 30;
      const plans = await examRepo.getByUserId(userId);
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
  },

  get_mistake_summary: {
    name: 'get_mistake_summary',
    description: 'Xem tóm tắt các lỗi sai thường gặp trong Sổ lỗi sai cá nhân theo môn học.',
    kind: 'read',
    schema: GetMistakeSummaryArgsSchema,
    openAiDefinition: {
      type: 'function',
      function: {
        name: 'get_mistake_summary',
        description: 'Xem tóm tắt sổ lỗi sai.',
        parameters: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: 'Tên môn học cần lọc' },
          },
        },
      },
    },
    handler: async (userId, args) => {
      const mistakes = await mistakeRepo.getByUserId(userId);
      const querySubject = (args?.subject || '').trim().toLowerCase();
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
  },

  get_unread_notifications: {
    name: 'get_unread_notifications',
    description: 'Xem danh sách các thông báo chưa đọc của học sinh.',
    kind: 'read',
    schema: GetUnreadNotificationsArgsSchema,
    openAiDefinition: {
      type: 'function',
      function: {
        name: 'get_unread_notifications',
        description: 'Xem thông báo chưa đọc.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Số lượng thông báo tối đa (mặc định 10)' },
          },
        },
      },
    },
    handler: async (userId, args) => {
      const limit = args?.limit || 10;
      const res = await notificationRepo.getPaginated(userId, { status: 'unread', limit });

      return {
        success: true,
        message: `Bạn có ${res.notifications.length} thông báo chưa đọc.`,
        data: { notifications: res.notifications },
      };
    },
  },

  get_task_details: {
    name: 'get_task_details',
    description: 'Tra cứu thông tin chi tiết, hướng dẫn làm bài và tiêu chuẩn đạt của một nhiệm vụ.',
    kind: 'read',
    schema: GetTaskDetailsArgsSchema,
    openAiDefinition: {
      type: 'function',
      function: {
        name: 'get_task_details',
        description: 'Xem chi tiết một nhiệm vụ học tập.',
        parameters: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Mã định danh nhiệm vụ' },
          },
          required: ['taskId'],
        },
      },
    },
    handler: async (userId, args) => {
      const task = await taskRepo.getById(userId, args.taskId);
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
  },

  search_materials: {
    name: 'search_materials',
    description: 'Tìm kiếm tài liệu học tập, sách giáo khoa, ghi chú hoặc bài tập trong kho tài liệu.',
    kind: 'read',
    schema: SearchMaterialsArgsSchema,
    openAiDefinition: {
      type: 'function',
      function: {
        name: 'search_materials',
        description: 'Tìm kiếm tài liệu học tập.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Từ khóa tìm kiếm' },
            limit: { type: 'number', description: 'Số lượng kết quả (mặc định 5)' },
          },
          required: ['query'],
        },
      },
    },
    handler: async (userId, args) => {
      const query = (args?.query || '').trim().toLowerCase();
      const limit = args?.limit || 5;
      const materials = await materialRepo.getByUserId(userId);

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
  },

  navigate_to: {
    name: 'navigate_to',
    description: 'Điều hướng giao diện ứng dụng tới trang được phép (/today, /timetable, /tasks, /focus, /exams, /materials, /reports, /notifications, /settings, /jami).',
    kind: 'read',
    schema: NavigateToArgsSchema,
    openAiDefinition: {
      type: 'function',
      function: {
        name: 'navigate_to',
        description: 'Điều hướng màn hình ứng dụng.',
        parameters: {
          type: 'object',
          properties: {
            route: {
              type: 'string',
              enum: [...ALLOWED_NAVIGATE_ROUTES],
              description: 'Đường dẫn trang cần mở',
            },
            reason: { type: 'string', description: 'Lý do điều hướng' },
          },
          required: ['route'],
        },
      },
    },
    handler: async (userId, args) => {
      return jamiActionService.executeTool(userId, 'navigate_to', args);
    },
  },

  start_focus_timer: {
    name: 'start_focus_timer',
    description: 'Bắt đầu phiên hẹn giờ tập trung (Pomodoro) thật trong hệ thống.',
    kind: 'mutate',
    schema: StartFocusTimerArgsSchema,
    openAiDefinition: {
      type: 'function',
      function: {
        name: 'start_focus_timer',
        description: 'Bắt đầu phiên hẹn giờ tập trung.',
        parameters: {
          type: 'object',
          properties: {
            plannedMinutes: { type: 'number', description: 'Thời lượng tập trung (phút)' },
            taskId: { type: 'string', description: 'Mã nhiệm vụ liên kết (nếu có)' },
          },
        },
      },
    },
    handler: async (userId, args) => {
      return jamiActionService.executeTool(userId, 'start_focus_timer', args);
    },
  },
};

/**
 * Get definition for a given tool name
 */
export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY[name];
}

/**
 * Get all OpenAI function tool definitions for OpenAI Realtime / Chat
 */
export function getAllOpenAiToolDefinitions() {
  return Object.values(TOOL_REGISTRY).map((t) => t.openAiDefinition);
}

/**
 * Execute a tool safely through the registry
 */
export async function executeRegisteredTool(
  userId: string,
  toolName: string,
  rawArgs: any,
  context?: { conversationId?: string }
): Promise<ActionResult> {
  const tool = TOOL_REGISTRY[toolName];
  if (!tool) {
    // Fallback to legacy dispatcher in JamiActionService
    return jamiActionService.executeTool(userId, toolName, rawArgs, context?.conversationId);
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

  return tool.handler(userId, parseResult.data, context);
}
