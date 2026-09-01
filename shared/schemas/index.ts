import { z } from 'zod';

export const LoginRequestSchema = z.object({
  email: z.string().trim().email({ message: 'Vui lòng nhập địa chỉ email hợp lệ' }),
  password: z.string().min(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' }),
  rememberMe: z.boolean().default(false),
});

export const RegisterRequestSchema = z
  .object({
    displayName: z.string().trim().min(2, { message: 'Họ và tên tối thiểu 2 ký tự' }),
    preferredName: z.string().trim().optional().or(z.literal('')),
    email: z.string().trim().email({ message: 'Vui lòng nhập địa chỉ email hợp lệ' }),
    gradeLevel: z.coerce.number().min(6, { message: 'Khối lớp từ 6 đến 12' }).max(12, { message: 'Khối lớp từ 6 đến 12' }).default(9),
    password: z.string().min(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' }),
    confirmPassword: z.string().min(6, { message: 'Mật khẩu xác nhận phải có ít nhất 6 ký tự' }),
    termsAccepted: z.boolean().refine((val) => val === true, {
      message: 'Vui lòng đồng ý với điều khoản sử dụng và chính sách bảo mật',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  });

export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  preferredName: z.string(),
  locale: z.string().default('vi-VN'),
  timezone: z.string().default('Asia/Ho_Chi_Minh'),
  ageBand: z.string().default('grade_9'),
  status: z.enum(['active', 'inactive']).default('active'),
  createdAt: z.string(),
});

export const SafeAuthResponseSchema = z.object({
  user: AuthUserSchema,
  profile: z.any(),
  isDemo: z.boolean().default(false),
  message: z.string().optional(),
});

export const VoiceGoalExtractionSchema = z.object({
  transcript: z.string(),
  intent: z.string(),
  subject: z.string(),
  topics: z.array(z.string()),
  deadline: z.string().optional(),
  examDate: z.string().optional(),
  estimatedMinutes: z.number().default(45),
  preferredWindows: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  missingFields: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.9),
  clarification: z.string().optional(),
});

export const TaskDecompositionSchema = z.object({
  goalSummary: z.string(),
  tasks: z.array(
    z.object({
      title: z.string(),
      objective: z.string(),
      subjectRef: z.string(),
      topicRefs: z.array(z.string()),
      estimatedMinutes: z.number().min(15).max(180),
      minSessionMinutes: z.number().default(20),
      maxSessionMinutes: z.number().default(60),
      splittable: z.boolean().default(false),
      priority: z.enum(['low', 'medium', 'high']),
      difficulty: z.enum(['easy', 'medium', 'hard']),
      dueAt: z.string().optional(),
      prerequisites: z.array(z.string()).default([]),
      dependencies: z.array(z.string()).default([]),
      successCriteria: z.array(z.string()),
      excellentCriteria: z.array(z.string()),
      materials: z.array(z.string()).default([]),
      rationale: z.string(),
    })
  ),
});

export const StepSchema = z.object({
  order: z.number(),
  title: z.string(),
  plannedMinutes: z.number(),
  instruction: z.string(),
  expectedOutput: z.string(),
  tips: z.array(z.string()),
});

export const ExecutionGuideSchema = z.object({
  objective: z.string(),
  whyItMatters: z.string(),
  prerequisites: z.array(z.string()),
  materials: z.array(z.string()),
  preparationChecklist: z.array(z.string()),
  steps: z.array(StepSchema),
  successCriteria: z.array(z.string()),
  excellentCriteria: z.array(z.string()),
  evidenceRequired: z.array(z.string()),
  commonMistakes: z.array(z.string()),
  fallbackAction: z.string(),
  completionQuestions: z.array(z.string()),
  nextAction: z.string(),
});

export const QuizQuestionDraftSchema = z.object({
  type: z.enum(['multiple_choice', 'true_false', 'short_answer']),
  prompt: z.string(),
  options: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  correctAnswer: z.string(),
  rubric: z.string().optional(),
  explanation: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  topicRef: z.string(),
  sourceReference: z.string().optional(),
});

export const QuizDraftSchema = z.object({
  title: z.string(),
  sourceScope: z.string(),
  learningObjectives: z.array(z.string()),
  questions: z.array(QuizQuestionDraftSchema),
});

export const JamiResponseSchema = z.object({
  message: z.string(),
  emotion: z.enum([
    'idle',
    'listening',
    'thinking',
    'speaking',
    'guiding',
    'focus',
    'reminding',
    'celebrating',
    'encouraging',
    'sleeping',
    'error',
  ]),
  suggestedActions: z.array(z.string()),
  requiresConfirmation: z.boolean().default(false),
  confirmationSummary: z.string().optional(),
  citationsToUserMaterial: z.array(z.string()).default([]),
});

// ==========================================
// Timetable & Scheduler Schemas
// ==========================================

const TimeStringRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const TimetableEntryInputSchema = z
  .object({
    timetableId: z.string().optional(),
    subjectId: z.string().nullable().optional(),
    title: z.string().trim().min(1, { message: 'Tiêu đề tiết học không được để trống' }).max(150),
    teacher: z.string().trim().max(100).optional().or(z.literal('')),
    dayOfWeek: z.coerce.number().int().min(1, { message: 'Thứ trong tuần từ 1 (Thứ 2) đến 7 (Chủ Nhật)' }).max(7),
    startLocalTime: z.string().regex(TimeStringRegex, { message: 'Giờ bắt đầu phải có định dạng HH:mm (00:00 - 23:59)' }),
    endLocalTime: z.string().regex(TimeStringRegex, { message: 'Giờ kết thúc phải có định dạng HH:mm (00:00 - 23:59)' }),
    location: z.string().trim().max(100).optional().or(z.literal('')),
    commuteBeforeMinutes: z.coerce.number().int().min(0).max(180).default(15),
    commuteAfterMinutes: z.coerce.number().int().min(0).max(180).default(15),
  })
  .refine((data) => data.startLocalTime < data.endLocalTime, {
    message: 'Giờ kết thúc phải sau giờ bắt đầu',
    path: ['endLocalTime'],
  });

export const SchoolTimetableInputSchema = z.object({
  name: z.string().trim().min(1, { message: 'Tên thời khóa biểu không được để trống' }).max(100),
  validFrom: z.string().optional().nullable(),
  validTo: z.string().optional().nullable(),
  timezone: z.string().default('Asia/Ho_Chi_Minh'),
  isActive: z.boolean().default(true),
  entries: z.array(TimetableEntryInputSchema).optional(),
});

export const BusyEventInputSchema = z
  .object({
    title: z.string().trim().min(1, { message: 'Tiêu đề sự kiện/lịch bận không được để trống' }).max(150),
    type: z.enum(['extra_class', 'club', 'personal', 'meal', 'sleep', 'commute']).default('personal'),
    startsAt: z.string().datetime({ message: 'Thời gian bắt đầu phải là chuẩn ISO 8601 hợp lệ' }),
    endsAt: z.string().datetime({ message: 'Thời gian kết thúc phải là chuẩn ISO 8601 hợp lệ' }),
    recurrenceRule: z.string().max(100).optional().nullable(),
    timezone: z.string().default('Asia/Ho_Chi_Minh'),
    isFixed: z.boolean().default(true),
    location: z.string().trim().max(150).optional().nullable().or(z.literal('')),
    commuteBeforeMinutes: z.coerce.number().int().min(0).max(180).default(0),
    commuteAfterMinutes: z.coerce.number().int().min(0).max(180).default(0),
    subjectId: z.string().optional().nullable(),
    source: z.string().default('user'),
  })
  .refine((data) => new Date(data.startsAt).getTime() < new Date(data.endsAt).getTime(), {
    message: 'Thời gian kết thúc phải sau thời gian bắt đầu',
    path: ['endsAt'],
  });

export const AvailabilityRuleInputSchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(1).max(7),
    startLocalTime: z.string().regex(TimeStringRegex, { message: 'Giờ bắt đầu phải có định dạng HH:mm' }),
    endLocalTime: z.string().regex(TimeStringRegex, { message: 'Giờ kết thúc phải có định dạng HH:mm' }),
    type: z.enum(['available', 'preferred', 'blocked']).default('available'),
    isEnabled: z.boolean().default(true),
    effectiveFrom: z.string().optional().nullable(),
    effectiveTo: z.string().optional().nullable(),
  })
  .refine((data) => data.startLocalTime < data.endLocalTime, {
    message: 'Giờ kết thúc phải sau giờ bắt đầu',
    path: ['endLocalTime'],
  });

export const ReplanPreviewRequestSchema = z.object({
  startDate: z.string().datetime().optional(),
  daysCount: z.coerce.number().int().min(1).max(30).default(7),
  reason: z.string().optional(),
});

export const ProposalConfirmRequestSchema = z.object({
  idempotencyKey: z.string().max(64).optional(),
});

export const NotificationPreferencesUpdateSchema = z.object({
  upcomingClass: z.boolean().optional(),
  upcomingExam: z.boolean().optional(),
  incompleteTask: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
  leadMinutes: z.coerce.number().int().min(0).max(180).optional(),
  classLeadMinutes: z.coerce.number().int().min(0).max(180).optional(),
  taskLeadMinutes: z.coerce.number().int().min(0).max(180).optional(),
  examLeadDays: z.coerce.number().int().min(1).max(30).optional(),
  quietHoursStart: z.string().regex(TimeStringRegex, { message: 'Giờ bắt đầu phải có định dạng HH:mm' }).optional(),
  quietHoursEnd: z.string().regex(TimeStringRegex, { message: 'Giờ kết thúc phải có định dạng HH:mm' }).optional(),
  timezone: z.string().max(50).optional(),
  inAppEnabled: z.boolean().optional(),
  webPushEnabled: z.boolean().optional(),
  pushSubscription: z.any().optional(),
});

export const NotificationFilterQuerySchema = z.object({
  status: z.enum(['all', 'unread', 'read', 'archived']).optional().default('all'),
  type: z.enum(['all', 'upcoming_class', 'upcoming_exam', 'incomplete_task', 'task_due', 'task_overdue', 'focus_upcoming', 'system']).optional().default('all'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const MaterialUploadIntentSchema = z.object({
  title: z.string().min(1, { message: 'Tiêu đề không được để trống' }).max(200),
  subjectId: z.string().min(1, { message: 'Môn học không được để trống' }),
  fileName: z.string().min(1, { message: 'Tên file không được để trống' }),
  mimeType: z.enum([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
  ], { message: 'Định dạng file không được hỗ trợ. Chỉ chấp nhận PDF, PNG, JPG/JPEG, WebP' }),
  sizeBytes: z.number().int().min(1).max(25 * 1024 * 1024, { message: 'Dung lượng file tối đa là 25MB' }),
});

export const MaterialFinalizeSchema = z.object({
  sizeBytes: z.number().int().min(1).optional(),
  sha256: z.string().length(64).optional(),
});

export const MaterialNoteCreateSchema = z.object({
  title: z.string().min(1, { message: 'Tiêu đề không được để trống' }).max(200),
  subjectId: z.string().min(1, { message: 'Môn học không được để trống' }),
  contentText: z.string().min(1, { message: 'Nội dung ghi chú không được để trống' }).max(50000),
});

export const MaterialQuizGenerateSchema = z.object({
  questionCount: z.coerce.number().int().min(3).max(20).default(5),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  title: z.string().max(200).optional(),
});

export const StructuredSummarySchema = z.object({
  overview: z.string().min(1),
  keyPoints: z.array(z.string()).min(1),
  concepts: z.array(z.object({
    name: z.string(),
    definition: z.string(),
  })).default([]),
  formulas: z.array(z.string()).optional().default([]),
  sourceReferences: z.array(z.object({
    pageOrSection: z.string(),
    note: z.string(),
  })).optional().default([]),
  warning: z.string().optional(),
});

export const ReportOverviewQuerySchema = z.object({
  period: z.enum(['week', 'month', 'custom']).optional().default('week'),
  from: z.string().optional(),
  to: z.string().optional(),
  timezone: z.string().optional(),
});

export const ExamCreateSchema = z.object({
  title: z.string().min(1, { message: 'Tiêu đề kỳ kiểm tra không được để trống' }).max(200),
  subjectId: z.string().min(1, { message: 'Vui lòng chọn môn học hợp lệ' }),
  examAt: z.string().min(1, { message: 'Ngày thi không được để trống' }),
  importance: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
  scopeText: z.string().max(1000).optional().default(''),
  topics: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    weight: z.number().min(0.1).max(10).default(1),
    notes: z.string().optional(),
  })).optional().default([]),
});

export const ExamUpdateSchema = ExamCreateSchema.partial().extend({
  status: z.enum(['upcoming', 'completed', 'cancelled']).optional(),
});

export const ExamQuizGenerateSchema = z.object({
  milestone: z.enum(['D-14', 'D-7', 'D-3', 'D-1']).default('D-7'),
  questionCount: z.coerce.number().int().min(3).max(20).default(5),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  title: z.string().max(200).optional(),
});

export const QuizAttemptSubmitSchema = z.object({
  attemptId: z.string().optional(),
  answers: z.array(z.object({
    questionId: z.string().min(1),
    answer: z.string(),
  })).default([]),
});

export const JamiChatRequestSchema = z.object({
  message: z.string().min(1, { message: 'Nội dung tin nhắn không được để trống' }).max(2000),
  conversationId: z.string().optional(),
  clientMessageId: z.string().optional(),
  includeAudio: z.boolean().optional().default(false),
});

export const JamiConversationCreateSchema = z.object({
  title: z.string().min(1).max(150).optional().default('Hội thoại với Jami'),
});

export const JamiConversationUpdateSchema = z.object({
  title: z.string().min(1, { message: 'Tiêu đề không được để trống' }).max(150),
});

export const JamiMessageConfirmSchema = z.object({
  decision: z.enum(['confirm', 'reject']).default('confirm'),
});

export const FocusSessionStartSchema = z.object({
  taskId: z.string().optional().nullable().transform((v) => (v === '' || v === 'none' || v === null ? undefined : v)),
  mode: z.string().optional().default('25_5'),
  minutes: z.coerce.number().int().min(1, { message: 'Thời gian tối thiểu là 1 phút' }).max(300, { message: 'Thời gian tối đa là 300 phút' }).optional(),
  breakMinutes: z.coerce.number().int().min(1).max(60).optional(),
  idempotencyKey: z.string().max(64).optional().nullable().transform((v) => v || undefined),
});

export const FocusSessionActionSchema = z.object({
  notes: z.string().max(1000).optional(),
  outcome: z.string().max(50).optional(),
  idempotencyKey: z.string().max(64).optional(),
});

export const TaskCreateSchema = z.object({
  title: z.string().min(1, { message: 'Tiêu đề nhiệm vụ không được để trống' }).max(200),
  subjectId: z.string().min(1, { message: 'Vui lòng chọn môn học' }),
  objective: z.string().max(1000).optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  estimatedMinutes: z.coerce.number().int().min(5, { message: 'Thời gian ước tính tối thiểu là 5 phút' }).max(300, { message: 'Thời gian ước tính tối đa là 300 phút' }).default(45),
  dueAt: z.string().optional(),
  scheduledStartAt: z.string().optional(),
  examId: z.string().optional(),
  splittable: z.boolean().optional().default(false),
  locked: z.boolean().optional().default(false),
});

export const TaskUpdateSchema = TaskCreateSchema.partial().extend({
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  completionPercent: z.coerce.number().min(0).max(100).optional(),
});

export const ExecutionGuideGenerateSchema = z.object({
  additionalNotes: z.string().max(1000).optional(),
});

export const ChecklistItemUpdateSchema = z.object({
  checked: z.boolean(),
});

export const StepActionSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed']),
  actualMinutes: z.coerce.number().int().min(0).max(300).optional(),
});

export const TaskEvidenceSubmitSchema = z.object({
  type: z.enum(['image', 'text', 'quiz_result', 'file']).default('text'),
  rating: z.coerce.number().int().min(1).max(5).default(5),
  evidenceNote: z.string().min(1, { message: 'Ghi chú minh chứng không được để trống' }).max(2000),
  fileUrl: z.string().optional(),
  r2ObjectKey: z.string().optional(),
});

export const ExecutionStepSchema = z.object({
  stepOrder: z.number().int().min(1),
  title: z.string().min(1),
  plannedMinutes: z.number().int().min(1),
  instruction: z.string().min(1),
  expectedOutput: z.string().min(1),
  tips: z.array(z.string()).default([]),
});

export const ExecutionGuideOutputSchema = z.object({
  objective: z.string().min(1),
  whyItMatters: z.string().min(1),
  prerequisites: z.array(z.string()).default([]),
  materials: z.array(z.string()).default([]),
  preparationChecklist: z.array(z.object({
    id: z.string().optional(),
    text: z.string().min(1),
    checked: z.boolean().default(false),
  })).default([]),
  steps: z.array(ExecutionStepSchema).min(1),
  successCriteria: z.array(z.string()).default([]),
  excellentCriteria: z.array(z.string()).default([]),
  evidenceRequired: z.array(z.string()).default([]),
  commonMistakes: z.array(z.string()).default([]),
  fallbackAction: z.string().default('Nếu gặp khó khăn quá 5 phút, hãy tạm thời bỏ qua hoặc hỏi trợ lý Jami AI.'),
  completionQuestions: z.array(z.string()).default([]),
  nextAction: z.string().default('Chuyển sang làm bài tập vận dụng nâng cao.'),
});







