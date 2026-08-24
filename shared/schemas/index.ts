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
    termsAccepted: z.boolean().optional().default(true),
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
