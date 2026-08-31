/// <reference types="vite/client" />

import {
  User,
  StudentProfile,
  Subject,
  TimetableEntry,
  SchoolTimetable,
  BusyEvent,
  AvailabilityRule,
  Exam,
  StudyTask,
  FocusSession,
  Quiz,
  QuizAttempt,
  LearningMaterial,
  NotificationItem,
  NotificationPreferences,
  JamiMemorySummary,
  JamiConversation,
  JamiMessageItem,
  ScheduleProposal,
  ReportOverviewResponse,
  TodayDashboardOverview,
  ExecutionGuide,
  ExecutionStep,
  Outline,
  TaskEvidence,
} from '../../shared/types';
import { z } from 'zod';
import { LoginRequestSchema, RegisterRequestSchema } from '../../shared/schemas';

export function normalizeApiBaseUrl(url?: string): string {
  if (!url) return '/api/v1';
  let clean = String(url).trim();
  if (clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  if (clean.endsWith('/api/v1')) {
    return clean;
  }
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return `${clean}/api/v1`;
  }
  if (clean === '/api' || clean === '/api/v1') {
    return '/api/v1';
  }
  return `${clean}/api/v1`;
}

const getBaseUrl = (): string => {
  const runtimeWindowUrl = typeof window !== 'undefined' ? (window as any).__API_BASE_URL__ : undefined;
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  return normalizeApiBaseUrl(runtimeWindowUrl || envUrl);
};

const API_BASE = getBaseUrl();

export interface JamiChatMessageItem {
  id: string;
  sender: 'user' | 'jami';
  text: string;
  emotion?: 'idle' | 'thinking' | 'speaking' | 'listening' | 'encouraging' | 'guiding' | 'focus' | 'error';
  suggestedActions?: string[];
  requiresConfirmation?: boolean;
  confirmationSummary?: string;
  proposalId?: string;
  isConfirmed?: boolean;
  createdAt: string;
}

export interface DashboardOverviewData {
  studentName: string;
  gradeLevel: number;
  timetable: {
    nextSessionTitle?: string;
    nextSessionTime?: string;
    todaySessionsCount: number;
  };
  tasks: {
    priorityTaskTitle?: string;
    priorityTaskId?: string;
    pendingCount: number;
  };
  todayStudy: {
    completedMinutes: number;
    plannedMinutes: number;
    completedPercent: number;
    streakDays: number;
  };
  jami: {
    latestMessage?: string;
    conversationStatus: string;
  };
  exams: {
    upcomingTitle?: string;
    daysRemaining: number;
  };
  reports: {
    totalFocusMinutes7Days: number;
    trendLabel: string;
  };
  materials: {
    totalMaterialsCount: number;
    latestMaterialTitle?: string;
  };
  notifications: {
    unreadCount: number;
    latestTitle?: string;
  };
}

export class ApiError extends Error {
  public status: number;
  public code?: string;
  public data: any;

  constructor(message: string, status: number, data?: any, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.code = code;
  }
}

async function fetchJson<T>(urlPath: string, options?: RequestInit): Promise<T> {
  const relativePath = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
  const baseUrl = getBaseUrl();
  
  let fullUrl: string;
  if (baseUrl.startsWith('http://') || baseUrl.startsWith('https://')) {
    fullUrl = `${baseUrl}${relativePath}`;
  } else {
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    if (relativePath.startsWith(base)) {
      fullUrl = relativePath;
    } else {
      fullUrl = `${base}${relativePath}`;
    }
  }

  const isBodyObject = options?.body && typeof options.body === 'string';
  const headers: Record<string, string> = {
    ...(isBodyObject ? { 'Content-Type': 'application/json' } : {}),
    ...(options?.headers as Record<string, string>),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  let response: Response;
  try {
    response = await fetch(fullUrl, {
      ...options,
      credentials: 'include',
      headers,
      signal: controller.signal,
    });
  } catch (netErr: any) {
    clearTimeout(timeoutId);
    if (netErr.name === 'AbortError') {
      throw new ApiError('Kết nối tới máy chủ quá thời hạn (Timeout). Vui lòng thử lại.', 0, null, 'TIMEOUT');
    }
    throw new ApiError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối mạng.', 0, netErr, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new ApiError(
      `Máy chủ phản hồi với định dạng không phải JSON (${contentType || 'không xác định'}).`,
      response.status,
      null,
      'INVALID_RESPONSE_FORMAT'
    );
  }

  let result: any;
  try {
    result = await response.json();
  } catch {
    throw new ApiError('Không thể giải mã dữ liệu JSON từ máy chủ.', response.status, null, 'PARSE_ERROR');
  }

  if (!response.ok) {
    const errorObj = result?.error;
    const message =
      typeof errorObj === 'object' && errorObj?.message
        ? errorObj.message
        : typeof errorObj === 'string'
        ? errorObj
        : result?.message || `Yêu cầu thất bại (${response.status})`;
    const code = typeof errorObj === 'object' && errorObj?.code ? errorObj.code : result?.code;

    throw new ApiError(message, response.status, result, code);
  }

  return result;
}

export const api = {
  // Auth & Identity
  getSession: () =>
    fetchJson<{
      authenticated: boolean;
      user?: User;
      profile?: StudentProfile;
      isDemo?: boolean;
      demoLoginEnabled?: boolean;
    }>('/auth/session'),
  getMe: () => fetchJson<{ user: User; profile: StudentProfile; isDemo: boolean }>('/me'),
  login: (data: z.infer<typeof LoginRequestSchema>) =>
    fetchJson<{ user: User; profile: StudentProfile; isDemo: boolean; message: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  loginDemo: () =>
    fetchJson<{ user: User; profile: StudentProfile; isDemo: boolean; message: string }>('/auth/demo-login', {
      method: 'POST',
    }),
  register: (data: z.infer<typeof RegisterRequestSchema>) =>
    fetchJson<{ user: User; profile: StudentProfile; isDemo: boolean; message: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  logout: () =>
    fetchJson<{ success: boolean; message: string }>('/auth/logout', { method: 'POST' }),
  forgotPassword: (email: string) =>
    fetchJson<{ success: boolean; message: string; emailServiceConfigured: boolean }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, newPassword: string) =>
    fetchJson<{ success: boolean; message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    }),
  updateProfile: (data: Partial<StudentProfile>) =>
    fetchJson<{ profile: StudentProfile }>('/profile', { method: 'PATCH', body: JSON.stringify(data) }),
  completeOnboarding: (data: Partial<StudentProfile>) =>
    fetchJson<{ success: boolean; profile: StudentProfile }>('/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Dashboard Overview
  getDashboardOverview: () => fetchJson<TodayDashboardOverview>('/dashboard/overview'),

  // Subjects
  getSubjects: () => fetchJson<{ subjects: Subject[] }>('/subjects'),

  // Timetable & Schedule Management
  getTimetable: (params?: { from?: string; to?: string }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return fetchJson<{
      timetables: SchoolTimetable[];
      activeTimetable: SchoolTimetable | null;
      entries: TimetableEntry[];
      busyEvents: BusyEvent[];
      availabilityRules: AvailabilityRule[];
    }>(`/timetables${query}`);
  },
  createTimetable: (data: Partial<SchoolTimetable>) =>
    fetchJson<{ timetable: SchoolTimetable }>('/timetables', { method: 'POST', body: JSON.stringify(data) }),
  updateTimetable: (id: string, data: Partial<SchoolTimetable>) =>
    fetchJson<{ timetable: SchoolTimetable }>(`/timetables/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTimetable: (id: string) =>
    fetchJson<{ success: boolean }>(`/timetables/${id}`, { method: 'DELETE' }),

  createTimetableEntry: (data: Partial<TimetableEntry>) =>
    fetchJson<{ entry: TimetableEntry }>('/timetables/entries', { method: 'POST', body: JSON.stringify(data) }),
  updateTimetableEntry: (id: string, data: Partial<TimetableEntry>) =>
    fetchJson<{ entry: TimetableEntry }>(`/timetables/entries/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTimetableEntry: (id: string) =>
    fetchJson<{ success: boolean }>(`/timetables/entries/${id}`, { method: 'DELETE' }),
  deleteEntriesByDay: (dayOfWeek: number, timetableId?: string) => {
    const query = timetableId ? `?timetableId=${encodeURIComponent(timetableId)}` : '';
    return fetchJson<{ success: boolean; deletedCount: number }>(`/timetables/entries-by-day/${dayOfWeek}${query}`, { method: 'DELETE' });
  },
  deleteAllTimetableEntries: (timetableId?: string) => {
    const query = timetableId ? `?timetableId=${encodeURIComponent(timetableId)}` : '';
    return fetchJson<{ success: boolean; deletedCount: number }>(`/timetables-all-entries${query}`, { method: 'DELETE' });
  },
  importTimetableOcr: (imageBase64: string, mimeType?: string) =>
    fetchJson<{
      success: boolean;
      timetableName: string;
      entries: Array<{
        dayOfWeek: number;
        title: string;
        startLocalTime: string;
        endLocalTime: string;
        room?: string;
        teacher?: string;
      }>;
    }>('/timetables/import-ocr', {
      method: 'POST',
      body: JSON.stringify({ imageBase64, mimeType }),
    }),
  confirmTimetableOcr: (data: {
    timetableName?: string;
    replaceExisting?: boolean;
    entries: Array<{
      dayOfWeek: number;
      title: string;
      startLocalTime: string;
      endLocalTime: string;
      room?: string;
      teacher?: string;
    }>;
  }) =>
    fetchJson<{
      success: boolean;
      timetable: SchoolTimetable;
      savedCount: number;
      entries: TimetableEntry[];
    }>('/timetables/import-ocr/confirm', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getBusyEvents: (params?: { from?: string; to?: string }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return fetchJson<{ events: BusyEvent[] }>(`/busy-events${query}`);
  },
  addBusyEvent: (event: Partial<BusyEvent>) =>
    fetchJson<{ event: BusyEvent }>('/busy-events', { method: 'POST', body: JSON.stringify(event) }),
  updateBusyEvent: (id: string, updates: Partial<BusyEvent>) =>
    fetchJson<{ event: BusyEvent }>(`/busy-events/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteBusyEvent: (id: string) =>
    fetchJson<{ success: boolean }>(`/busy-events/${id}`, { method: 'DELETE' }),
  downloadTimetableCsv: async () => {
    const response = await fetch(`${API_BASE}/timetables/export/csv`, { credentials: 'include' });
    if (!response.ok) throw new Error('Không thể tải xuống thời khóa biểu');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jami_tkb_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  getAvailabilityRules: () =>
    fetchJson<{ rules: AvailabilityRule[] }>('/availability-rules'),
  saveAvailabilityRules: (rules: AvailabilityRule[]) =>
    fetchJson<{ rules: AvailabilityRule[] }>('/availability-rules', { method: 'PUT', body: JSON.stringify({ rules }) }),

  // Tasks
  getTasks: (params?: { status?: string; subjectId?: string }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return fetchJson<{ tasks: StudyTask[] }>(`/tasks${query}`);
  },
  createTask: (data: Partial<StudyTask>) =>
    fetchJson<{ task: StudyTask }>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  getTask: (id: string) =>
    fetchJson<{ task: StudyTask; executionGuide?: ExecutionGuide; evidence?: TaskEvidence[] }>(`/tasks/${id}`),
  updateTask: (id: string, updates: Partial<StudyTask>) =>
    fetchJson<{ task: StudyTask }>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteTask: (id: string) =>
    fetchJson<{ success: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),
  unscheduleTask: (taskId: string) =>
    fetchJson<{ task: StudyTask }>(`/tasks/${taskId}/unschedule`, { method: 'POST' }),
  downloadTasksCsv: async () => {
    const response = await fetch(`${API_BASE}/tasks/export/csv`, { credentials: 'include' });
    if (!response.ok) throw new Error('Không thể tải xuống danh sách nhiệm vụ');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jami_nhiem_vu_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
  generateExecutionGuide: (taskId: string, additionalNotes?: string) =>
    fetchJson<{ guide: ExecutionGuide; isDemoMode: boolean }>(`/tasks/${taskId}/generate-steps`, {
      method: 'POST',
      body: JSON.stringify({ additionalNotes }),
    }),
  generateSteps: (taskId: string, additionalNotes?: string) =>
    fetchJson<{ guide: ExecutionGuide; isDemoMode: boolean }>(`/tasks/${taskId}/generate-steps`, {
      method: 'POST',
      body: JSON.stringify({ additionalNotes }),
    }),
  updateChecklistItem: (taskId: string, itemId: string, checked: boolean) =>
    fetchJson<{ success: boolean; checked: boolean }>(`/tasks/${taskId}/checklist/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ checked }),
    }),
  startTaskStep: (taskId: string, stepId: string) =>
    fetchJson<{ task: StudyTask; guide: ExecutionGuide }>(`/tasks/${taskId}/steps/${stepId}/start`, { method: 'POST' }),
  completeTaskStep: (taskId: string, stepId: string, actualMinutes?: number) =>
    fetchJson<{ task: StudyTask; guide: ExecutionGuide }>(`/tasks/${taskId}/steps/${stepId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ actualMinutes }),
    }),
  updateTaskStepDetails: (taskId: string, stepId: string, updates: Partial<ExecutionStep>) =>
    fetchJson<{ success: boolean; guide: ExecutionGuide }>(`/tasks/${taskId}/steps/${stepId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  reorderTaskSteps: (taskId: string, orderedStepIds: string[]) =>
    fetchJson<{ success: boolean; guide: ExecutionGuide }>(`/tasks/${taskId}/steps/reorder`, {
      method: 'POST',
      body: JSON.stringify({ orderedStepIds }),
    }),
  explainTaskStep: (
    taskId: string,
    data: { stepId?: string; stepTitle: string; instruction: string; expectedOutput: string; plannedMinutes: number; studentQuestion?: string }
  ) =>
    fetchJson<{
      explanation: {
        explanation: string;
        actionableSteps: string[];
        example: string;
        keyTips: string[];
      };
    }>(`/tasks/${taskId}/explain-step`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  evaluateTaskEvidence: (taskId: string, data: { textValue?: string; fileUrl?: string; type?: string }) =>
    fetchJson<{
      evaluation: {
        score: number;
        rating: number;
        isPassed: boolean;
        feedback: string;
        strengths: string[];
        missingPoints: string[];
      };
    }>(`/tasks/${taskId}/evaluate-evidence`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  submitTaskEvidence: (taskId: string, data: { rating: number; evidenceNote: string; type?: string; fileUrl?: string }) =>
    fetchJson<{ evidence: TaskEvidence }>(`/tasks/${taskId}/evidence`, { method: 'POST', body: JSON.stringify(data) }),
  completeTask: (taskId: string) => fetchJson<{ task: StudyTask }>(`/tasks/${taskId}/complete`, { method: 'POST' }),
  postponeTask: (taskId: string, postponeMinutes?: number, newScheduledStartAt?: string) =>
    fetchJson<{ task: StudyTask }>(`/tasks/${taskId}/postpone`, {
      method: 'POST',
      body: JSON.stringify({ postponeMinutes, newScheduledStartAt }),
    }),

  // Focus
  getCurrentFocusSession: () => fetchJson<{ session: FocusSession | null }>('/focus-sessions/current'),
  startFocusSession: (taskId?: string, mode?: string, minutes?: number) =>
    fetchJson<{ session: FocusSession }>('/focus-sessions', {
      method: 'POST',
      body: JSON.stringify({ taskId, mode, minutes }),
    }),
  pauseFocusSession: (id: string) => fetchJson<{ session: FocusSession }>(`/focus-sessions/${id}/pause`, { method: 'POST' }),
  resumeFocusSession: (id: string) => fetchJson<{ session: FocusSession }>(`/focus-sessions/${id}/resume`, { method: 'POST' }),
  completeFocusSession: (id: string, notes?: string) =>
    fetchJson<{ session: FocusSession }>(`/focus-sessions/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),
  abandonFocusSession: (id: string, notes?: string) =>
    fetchJson<{ session: FocusSession }>(`/focus-sessions/${id}/abandon`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),

  // Planner
  previewVoiceGoal: (transcript: string) =>
    fetchJson<{ extraction: any; decomposition: any; proposal: ScheduleProposal; isDemoMode: boolean }>(
      '/planner/voice-goal/preview',
      { method: 'POST', body: JSON.stringify({ transcript }) }
    ),
  confirmProposal: (proposalId: string, idempotencyKey?: string) =>
    fetchJson<{ success: boolean; tasks: StudyTask[]; proposal: ScheduleProposal }>(
      `/planner/proposals/${proposalId}/confirm`,
      {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey }),
      }
    ),
  cancelProposal: (proposalId: string) =>
    fetchJson<{ success: boolean }>(`/planner/proposals/${proposalId}/cancel`, {
      method: 'POST',
    }),
  previewReplan: (data?: { startDate?: string; daysCount?: number; reason?: string }) =>
    fetchJson<{ proposal: ScheduleProposal }>('/planner/replan/preview', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),

  // Exams & Quizzes
  getExams: () => fetchJson<{ exams: Exam[] }>('/exams'),
  getExam: (id: string) => fetchJson<{ exam: Exam }>(`/exams/${id}`),
  addExam: (data: Partial<Exam>) => fetchJson<{ exam: Exam }>('/exams', { method: 'POST', body: JSON.stringify(data) }),
  updateExam: (id: string, data: Partial<Exam>) =>
    fetchJson<{ exam: Exam }>(`/exams/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteExam: (id: string) => fetchJson<{ success: boolean }>(`/exams/${id}`, { method: 'DELETE' }),
  generateExamQuiz: (
    examId: string,
    options?: { milestone?: 'D-14' | 'D-7' | 'D-3' | 'D-1'; questionCount?: number; difficulty?: 'easy' | 'medium' | 'hard'; title?: string }
  ) =>
    fetchJson<{ success: boolean; quiz: Quiz }>(`/exams/${examId}/quizzes/generate`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),
  generateSubjectQuiz: (options: {
    subjectId?: string;
    subjectName?: string;
    topics?: string[];
    scope?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
    questionCount?: number;
    format?: 'multiple_choice' | 'essay' | 'combined';
    title?: string;
  }) =>
    fetchJson<{ quiz: Quiz }>('/quizzes/generate', {
      method: 'POST',
      body: JSON.stringify(options),
    }),
  retakeWrongQuestions: (originalQuizId: string, wrongQuestionIds: string[]) =>
    fetchJson<{ quiz: Quiz }>('/quizzes/retake-wrong', {
      method: 'POST',
      body: JSON.stringify({ originalQuizId, wrongQuestionIds }),
    }),
  getQuizzes: (examId?: string) =>
    fetchJson<{ quizzes: Quiz[] }>(`/quizzes${examId ? `?examId=${encodeURIComponent(examId)}` : ''}`),
  getQuiz: (id: string) => fetchJson<{ quiz: Quiz }>(`/quizzes/${id}`),
  startQuizAttempt: (quizId: string) =>
    fetchJson<{ attempt: QuizAttempt }>(`/quizzes/${quizId}/attempts`, { method: 'POST' }),
  submitQuiz: (quizId: string, answers: { questionId: string; answer: string }[], attemptId?: string) =>
    fetchJson<{ attempt: QuizAttempt; answersFeedback: any[] }>(`/quizzes/${quizId}/attempts/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers, attemptId }),
    }),

  // Learning Materials
  getMaterials: () => fetchJson<{ materials: LearningMaterial[] }>('/materials'),
  getMaterial: (id: string) => fetchJson<{ material: LearningMaterial }>(`/materials/${id}`),
  createMaterialUploadIntent: (data: {
    title: string;
    subjectId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }) =>
    fetchJson<{ material: LearningMaterial; uploadUrl: string; r2ObjectKey: string }>('/materials/upload-intent', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  uploadMaterialDirect: async (key: string, fileData: Blob | ArrayBuffer, contentType: string) => {
    const res = await fetch(`/api/v1/materials/upload-direct?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
      },
      body: fileData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Tải lên tài liệu thất bại.');
    }
    return res.json();
  },
  createMaterialNote: (data: { title: string; subjectId: string; contentText: string }) =>
    fetchJson<{ success: boolean; material: LearningMaterial }>('/materials/note', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  finalizeMaterialUpload: (id: string, meta?: { sizeBytes?: number; sha256?: string }) =>
    fetchJson<{ success: boolean; material: LearningMaterial }>(`/materials/${id}/finalize`, {
      method: 'POST',
      body: JSON.stringify(meta || {}),
    }),
  reprocessMaterial: (id: string) =>
    fetchJson<{ success: boolean; summary?: any }>(`/materials/${id}/reprocess`, { method: 'POST' }),
  generateQuizFromMaterial: (
    id: string,
    options?: { questionCount?: number; difficulty?: string; title?: string }
  ) =>
    fetchJson<{ success: boolean; quizId: string; quiz?: any }>(`/materials/${id}/quizzes/generate`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),
  renameMaterial: (id: string, title: string) =>
    fetchJson<{ material: LearningMaterial }>(`/materials/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  getMaterialDownloadUrl: (id: string) =>
    fetchJson<{ downloadUrl: string; expiresAt: string }>(`/materials/${id}/download`),
  generateMaterialOutline: (id: string, options?: { chapter?: string }) =>
    fetchJson<{ outline: Outline }>(`/materials/${id}/outline`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),
  deleteMaterial: (id: string) => fetchJson<{ success: boolean }>(`/materials/${id}`, { method: 'DELETE' }),

  // Outlines (6.2)
  getOutlines: (subjectId?: string) =>
    fetchJson<{ outlines: Outline[] }>(`/outlines${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ''}`),
  getOutline: (id: string) => fetchJson<{ outline: Outline }>(`/outlines/${id}`),
  createOutline: (data: Partial<Outline>) =>
    fetchJson<{ outline: Outline }>('/outlines', { method: 'POST', body: JSON.stringify(data) }),
  updateOutline: (id: string, data: Partial<Outline>) =>
    fetchJson<{ outline: Outline }>(`/outlines/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteOutline: (id: string) => fetchJson<{ success: boolean }>(`/outlines/${id}`, { method: 'DELETE' }),

  // Reports
  getReportsOverview: (params?: { period?: 'week' | 'month' | 'custom'; from?: string; to?: string; timezone?: string }) => {
    const query = new URLSearchParams();
    if (params?.period) query.set('period', params.period);
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.timezone) query.set('timezone', params.timezone);
    const qs = query.toString();
    return fetchJson<ReportOverviewResponse>(`/reports/overview${qs ? `?${qs}` : ''}`);
  },
  getReportsExportUrl: (params?: { period?: 'week' | 'month' | 'custom'; from?: string; to?: string; timezone?: string }) => {
    const query = new URLSearchParams();
    if (params?.period) query.set('period', params.period);
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.timezone) query.set('timezone', params.timezone);
    const qs = query.toString();
    return `/api/v1/reports/export${qs ? `?${qs}` : ''}`;
  },
  downloadReportsCsv: async (params?: { period?: 'week' | 'month' | 'custom'; from?: string; to?: string; timezone?: string }) => {
    const query = new URLSearchParams();
    if (params?.period) query.set('period', params.period);
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.timezone) query.set('timezone', params.timezone);
    const qs = query.toString();

    const response = await fetch(`${API_BASE}/reports/export${qs ? `?${qs}` : ''}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Không thể xuất tệp CSV báo cáo');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jami_report_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
  downloadMaterialFile: async (materialId: string, fallbackFileName?: string) => {
    const response = await fetch(`${API_BASE}/materials/${materialId}/content`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Không thể tải xuống nội dung tài liệu này.');
    }

    const disposition = response.headers.get('content-disposition');
    let fileName = fallbackFileName || 'tai_lieu_jami';
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) fileName = match[1];
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  // Notifications & Preferences
  getNotifications: (params?: { status?: string; type?: string; cursor?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.type) query.set('type', params.type);
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return fetchJson<{
      notifications: NotificationItem[];
      unreadCount: number;
      nextCursor?: string;
      total: number;
    }>(`/notifications${qs ? `?${qs}` : ''}`);
  },
  getUnreadNotificationCount: () => fetchJson<{ unreadCount: number }>('/notifications/unread-count'),
  getNotificationPreferences: () => fetchJson<{ preferences: NotificationPreferences }>('/notifications/preferences'),
  updateNotificationPreferences: (preferences: Partial<NotificationPreferences>) =>
    fetchJson<{ preferences: NotificationPreferences }>('/notifications/preferences', {
      method: 'PATCH',
      body: JSON.stringify(preferences),
    }),
  markNotificationRead: (id: string) => fetchJson<{ success: boolean; unreadCount: number }>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => fetchJson<{ success: boolean; count: number; unreadCount: number }>('/notifications/read-all', { method: 'POST' }),
  deleteNotification: (id: string) => fetchJson<{ success: boolean; unreadCount: number }>(`/notifications/${id}`, { method: 'DELETE' }),

  // Jami Assistant & Conversations
  getJamiConversations: () => fetchJson<{ conversations: JamiConversation[] }>('/jami/conversations'),
  createJamiConversation: (title?: string) =>
    fetchJson<{ conversation: JamiConversation }>('/jami/conversations', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  updateJamiConversation: (id: string, title: string) =>
    fetchJson<{ conversation: JamiConversation }>(`/jami/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  deleteJamiConversation: (id: string) =>
    fetchJson<{ success: boolean }>(`/jami/conversations/${id}`, { method: 'DELETE' }),

  getJamiMessages: (conversationId?: string) =>
    fetchJson<{ messages: JamiMessageItem[] }>(
      `/jami/messages${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''}`
    ),
  clearJamiMessages: (conversationId?: string) =>
    fetchJson<{ success: boolean }>(
      `/jami/messages${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''}`,
      { method: 'DELETE' }
    ),
  sendJamiChat: (message: string, conversationId?: string, clientMessageId?: string) =>
    fetchJson<{
      userMessage: JamiMessageItem;
      replyMessage: JamiMessageItem;
      clientAction?: any;
      proposal?: any;
      isDemoMode: boolean;
    }>('/jami/chat', {
      method: 'POST',
      body: JSON.stringify({ message, conversationId, clientMessageId }),
    }),
  confirmJamiAction: (messageId: string, decision: 'confirm' | 'reject' = 'confirm') =>
    fetchJson<{ success: boolean; message: JamiMessageItem; actionResult?: any }>(
      `/jami/messages/${messageId}/confirm`,
      {
        method: 'POST',
        body: JSON.stringify({ decision }),
      }
    ),
  getRealtimeSession: () =>
    fetchJson<{ clientSecret?: string; mode: string; message: string; expiresAt?: number; model?: string; voice?: string }>('/jami/realtime/client-secret', {
      method: 'POST',
    }),
  getRealtimeClientSecret: () =>
    fetchJson<{ clientSecret?: string; mode: string; message: string; expiresAt?: number; model?: string; voice?: string }>('/jami/realtime/client-secret', {
      method: 'POST',
    }),
  sendVoiceCommand: (transcript: string, clientTurnId?: string, mode?: string, conversationId?: string) =>
    fetchJson<{
      replyText: string;
      emotion: string;
      requiresConfirmation?: boolean;
      proposal?: any;
      clientAction?: { type: string; route?: string; sessionId?: string; params?: any };
      replyMessage?: JamiMessageItem;
    }>('/jami/voice/command', {
      method: 'POST',
      body: JSON.stringify({ transcript, clientTurnId, mode, conversationId }),
    }),
  confirmVoiceProposal: (decision: 'confirm' | 'reject' = 'confirm', proposalId?: string, conversationId?: string) =>
    fetchJson<{ success: boolean; message: string; clientAction?: any }>('/jami/voice/confirm', {
      method: 'POST',
      body: JSON.stringify({ decision, proposalId, conversationId }),
    }),
  logVoiceRequest: (data: any) =>
    fetchJson<{ success: boolean; log: any }>('/jami/voice/log', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getJamiPreferences: () => fetchJson<{ preferences: any; memories: JamiMemorySummary[] }>('/jami/preferences'),
  updateJamiPreferences: (prefs: any) =>
    fetchJson<{ preferences: any }>('/jami/preferences', { method: 'PATCH', body: JSON.stringify(prefs) }),
  deleteJamiMemory: (id: string) => fetchJson<{ success: boolean }>(`/jami/memory/${id}`, { method: 'DELETE' }),
  exportMyData: () => fetchJson<any>('/me/export', { method: 'POST' }),

  // Admin User Management
  getAdminUsers: (params?: { q?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.q) query.set('q', params.q);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    return fetchJson<{
      users: User[];
      totalCount: number;
      activeCount: number;
      bannedCount: number;
      adminCount: number;
    }>(`/admin/users${qs ? `?${qs}` : ''}`);
  },
  banAdminUser: (userId: string) =>
    fetchJson<{ success: boolean; user: User; message: string }>(`/admin/users/${userId}/ban`, { method: 'POST' }),
  unbanAdminUser: (userId: string) =>
    fetchJson<{ success: boolean; user: User; message: string }>(`/admin/users/${userId}/unban`, { method: 'POST' }),
  updateAdminUserRole: (userId: string, role: 'admin' | 'user') =>
    fetchJson<{ success: boolean; user: User; message: string }>(`/admin/users/${userId}/role`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),
  deleteAdminUser: (userId: string) =>
    fetchJson<{ success: boolean; message: string }>(`/admin/users/${userId}`, { method: 'DELETE' }),
};
