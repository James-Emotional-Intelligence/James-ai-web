/// <reference types="vite/client" />

import {
  User,
  StudentProfile,
  Subject,
  TimetableEntry,
  SchoolTimetable,
  BusyEvent,
  BusyEventException,
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
  TimetableEntryException,
  ClassSessionCheckin,
  MissedClassSession,
  TomorrowPreparationPlan,
  TomorrowPreparationItem,
  TomorrowPlanOverviewInfo,
  ExamStudyPlan,
  ExamStudyPlanItem,
  ExamStudyPlanReplanProposal,
  MistakeNotebookEntry,
  MistakeReviewAttempt,
  TodayLessonLogItem,
  BookChapter,
  BookChunk,
  BookProgress,
  BookBookmark,
  BookHighlight,
  BookStudyAidRequest,
  BookStudyAidResult,
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
  getTimetable: (params?: { from?: string; to?: string; forDate?: string }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return fetchJson<{
      timetables: SchoolTimetable[];
      activeTimetable: SchoolTimetable | null;
      entries: TimetableEntry[];
      busyEvents: BusyEvent[];
      availabilityRules: AvailabilityRule[];
      exceptions?: TimetableEntryException[];
      busyExceptions?: BusyEventException[];
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

  // Timetable Entry Exceptions (Nghỉ tuần này)
  skipTimetableEntryThisWeek: (entryId: string, occurrenceDate: string, reason?: string) =>
    fetchJson<{ success: boolean; exception: TimetableEntryException }>(`/timetables/entries/${entryId}/exceptions`, {
      method: 'POST',
      body: JSON.stringify({ occurrenceDate, reason, exceptionType: 'cancelled' }),
    }),
  undoSkipTimetableEntry: (entryId: string, occurrenceDate: string) =>
    fetchJson<{ success: boolean }>(`/timetables/entries/${entryId}/exceptions/${occurrenceDate}`, {
      method: 'DELETE',
    }),
  getTimetableExceptions: (params?: { from?: string; to?: string }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return fetchJson<{ exceptions: TimetableEntryException[] }>(`/timetables/exceptions${query}`);
  },

  // Busy Event Exceptions (Nghỉ tạm thời gian biểu)
  skipBusyEventThisWeek: (busyEventId: string, occurrenceDate: string, reason?: string) =>
    fetchJson<{ success: boolean; exception: BusyEventException }>(`/busy-events/${busyEventId}/exceptions`, {
      method: 'POST',
      body: JSON.stringify({ occurrenceDate, reason, exceptionType: 'cancelled' }),
    }),
  undoSkipBusyEvent: (busyEventId: string, occurrenceDate: string) =>
    fetchJson<{ success: boolean }>(`/busy-events/${busyEventId}/exceptions/${occurrenceDate}`, {
      method: 'DELETE',
    }),
  getBusyEventExceptions: (params?: { from?: string; to?: string }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return fetchJson<{ exceptions: BusyEventException[] }>(`/busy-events/exceptions${query}`);
  },

  // Offline Missed Sessions & Check-ins
  getMissedClassSessions: () =>
    fetchJson<{ missedSessions: MissedClassSession[] }>('/timetables/missed-sessions'),
  dismissMissedSessions: () =>
    fetchJson<{ success: boolean }>('/timetables/dismiss-missed-sessions', { method: 'POST' }),
  getTodayLessonLogs: () =>
    fetchJson<{ date: string; formattedDate: string; dayOfWeekText: string; classes: TodayLessonLogItem[] }>('/timetables/today-lesson-logs'),
  submitSessionCheckin: (data: {
    timetableEntryId: string;
    timetableEntryIds?: string[];
    occurrenceDate: string;
    learnedContent?: string;
    homework?: string;
    hasNoHomework?: boolean;
    reflection?: string;
    understandingLevel?: string;
    attendanceStatus?: 'attended' | 'absent';
    createTaskForHomework?: boolean;
    dueAt?: string;
    estimatedMinutes?: number;
    taskId?: string;
  }) =>
    fetchJson<{ success: boolean; checkin: ClassSessionCheckin; createdTask?: StudyTask; task?: StudyTask }>('/timetables/session-checkins', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getSessionCheckins: (params?: { from?: string; to?: string }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    return fetchJson<{ checkins: ClassSessionCheckin[] }>(`/timetables/session-checkins${query}`);
  },
  sendHeartbeat: () =>
    fetchJson<{ success: boolean }>('/users/heartbeat', { method: 'POST' }),

  // Tomorrow Preparation Plan ("Jami chuẩn bị ngày mai")
  getTomorrowPlanOverview: () =>
    fetchJson<TomorrowPlanOverviewInfo>('/tomorrow-plan/overview'),
  getTomorrowPlanCurrent: () =>
    fetchJson<{ plan: TomorrowPreparationPlan | null }>('/tomorrow-plan/current'),
  generateTomorrowPlan: (data?: { energyLevel?: string; customAvailableMinutes?: number }) =>
    fetchJson<{ plan: TomorrowPreparationPlan }>('/tomorrow-plan/generate', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  updateTomorrowPlanEnergy: (planId: string, energyLevel: string) =>
    fetchJson<{ plan: TomorrowPreparationPlan }>(`/tomorrow-plan/${planId}/energy`, {
      method: 'PATCH',
      body: JSON.stringify({ energyLevel }),
    }),
  acceptTomorrowPlan: (planId: string) =>
    fetchJson<{ success: boolean; plan: TomorrowPreparationPlan }>(`/tomorrow-plan/${planId}/accept`, {
      method: 'POST',
    }),
  dismissTomorrowPlan: (planId: string) =>
    fetchJson<{ success: boolean }>(`/tomorrow-plan/${planId}/dismiss`, {
      method: 'POST',
    }),
  updateTomorrowPlanItem: (planId: string, itemId: string, data: Partial<TomorrowPreparationItem>) =>
    fetchJson<{ item: TomorrowPreparationItem }>(`/tomorrow-plan/${planId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteTomorrowPlanItem: (planId: string, itemId: string) =>
    fetchJson<{ success: boolean }>(`/tomorrow-plan/${planId}/items/${itemId}`, {
      method: 'DELETE',
    }),
  completeTomorrowPlanItem: (planId: string, itemId: string) =>
    fetchJson<{ item: TomorrowPreparationItem }>(`/tomorrow-plan/${planId}/items/${itemId}/complete`, {
      method: 'POST',
    }),

  // Exam Study Planner ("Lập kế hoạch ôn kiểm tra tự động")
  getExamStudyPlan: (examId: string) =>
    fetchJson<{ plan: ExamStudyPlan | null }>(`/exams/${examId}/study-plan`),
  generateExamStudyPlan: (
    examId: string,
    data?: { startDate?: string; dailyMinutes?: number; blackoutDates?: string[] }
  ) =>
    fetchJson<{ plan: ExamStudyPlan }>(`/exams/${examId}/study-plan/generate`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  acceptExamStudyPlan: (planId: string) =>
    fetchJson<{ success: boolean; plan: ExamStudyPlan }>(`/exams/study-plans/${planId}/accept`, {
      method: 'POST',
    }),
  dismissExamStudyPlan: (planId: string) =>
    fetchJson<{ success: boolean }>(`/exams/study-plans/${planId}/dismiss`, {
      method: 'POST',
    }),
  getExamStudyPlanMissedProposal: (examId: string) =>
    fetchJson<{ proposal: ExamStudyPlanReplanProposal | null }>(`/exams/${examId}/study-plan/missed-proposal`),
  confirmExamStudyPlanReplan: (
    planId: string,
    data: { action: 'accept' | 'custom_slot' | 'skip_session' | 'keep_as_is'; customSlot?: any }
  ) =>
    fetchJson<{ success: boolean; plan: ExamStudyPlan }>(`/exams/study-plans/${planId}/replan-confirm`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  undoExamStudyPlanVersion: (planId: string) =>
    fetchJson<{ success: boolean; plan: ExamStudyPlan }>(`/exams/study-plans/${planId}/undo`, {
      method: 'POST',
    }),
  updateExamStudyPlanItem: (planId: string, itemId: string, data: Partial<ExamStudyPlanItem>) =>
    fetchJson<{ item: ExamStudyPlanItem }>(`/exams/study-plans/${planId}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteExamStudyPlanItem: (planId: string, itemId: string) =>
    fetchJson<{ success: boolean }>(`/exams/study-plans/${planId}/items/${itemId}`, {
      method: 'DELETE',
    }),
  completeExamStudyPlanItem: (planId: string, itemId: string) =>
    fetchJson<{ item: ExamStudyPlanItem }>(`/exams/study-plans/${planId}/items/${itemId}/complete`, {
      method: 'POST',
    }),

  // Mistake Notebook ("Sổ lỗi sai cá nhân")
  getMistakes: (filters?: {
    subjectId?: string;
    topic?: string;
    status?: string;
    difficulty?: string;
    dueOnly?: boolean;
    search?: string;
  }) => {
    const query = filters ? `?${new URLSearchParams(filters as any).toString()}` : '';
    return fetchJson<{ mistakes: MistakeNotebookEntry[] }>(`/mistakes${query}`);
  },
  createMistake: (data: Partial<MistakeNotebookEntry>) =>
    fetchJson<{ success: boolean; mistake: MistakeNotebookEntry }>('/mistakes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getMistake: (id: string) =>
    fetchJson<{ mistake: MistakeNotebookEntry }>(`/mistakes/${id}`),
  updateMistake: (id: string, data: Partial<MistakeNotebookEntry>) =>
    fetchJson<{ success: boolean; mistake: MistakeNotebookEntry }>(`/mistakes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteMistake: (id: string) =>
    fetchJson<{ success: boolean }>(`/mistakes/${id}`, {
      method: 'DELETE',
    }),
  reviewMistake: (id: string, answer: string) =>
    fetchJson<{
      success: boolean;
      isCorrect: boolean;
      entry: MistakeNotebookEntry;
      attempt: MistakeReviewAttempt;
    }>(`/mistakes/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    }),
  getSimilarMistakeQuestion: (id: string) =>
    fetchJson<{
      similarQuestion: {
        questionText: string;
        options?: string[];
        correctAnswer: string;
        explanation: string;
        difficulty: string;
      };
    }>(`/mistakes/${id}/similar`, {
      method: 'POST',
    }),
  explainMistake: (id: string) =>
    fetchJson<{ explanation: string; tips: string[] }>(`/mistakes/${id}/explain`, {
      method: 'POST',
    }),
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
  uploadMaterial: async (
    file: File | Blob,
    meta: {
      title?: string;
      subjectId?: string;
      materialKind?: 'document' | 'book';
    },
    onProgress?: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<{ success: boolean; material: LearningMaterial }> => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);
      if (meta.title) formData.append('title', meta.title);
      if (meta.subjectId) formData.append('subjectId', meta.subjectId);
      if (meta.materialKind) formData.append('materialKind', meta.materialKind);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/materials/upload`);
      xhr.withCredentials = true;

      if (signal) {
        signal.addEventListener('abort', () => {
          xhr.abort();
          reject(new Error('Tải lên đã bị hủy.'));
        });
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch {
            reject(new Error('Phản hồi từ máy chủ không hợp lệ.'));
          }
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.error?.message || err.message || `Lỗi tải lên (${xhr.status})`));
          } catch {
            reject(new Error(`Tải lên thất bại với mã lỗi HTTP ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Không thể kết nối đến máy chủ.'));
      xhr.send(formData);
    });
  },
  uploadMaterialDirect: async (key: string, fileData: Blob | ArrayBuffer, contentType: string) => {
    const res = await fetch(`${API_BASE}/materials/upload-direct?key=${encodeURIComponent(key)}`, {
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

  // Sách Mềm (Soft Books) API
  getBooks: (params?: { search?: string; subjectId?: string; status?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.subjectId) query.set('subjectId', params.subjectId);
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const qs = query.toString();
    return fetchJson<{ books: LearningMaterial[]; total: number }>(`/materials/books${qs ? `?${qs}` : ''}`);
  },
  getBook: (id: string) => fetchJson<{ book: LearningMaterial; progress?: BookProgress }>(`/materials/books/${id}`),
  createBookUploadIntent: (data: {
    title: string;
    subjectId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    rightsConfirmed: boolean;
    rightsTermsVersion?: string;
    publisher?: string;
    editionYear?: number;
    language?: string;
  }) =>
    fetchJson<{ book: LearningMaterial; uploadUrl: string; r2ObjectKey: string }>('/materials/books/upload-intent', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  uploadBook: async (
    file: File | Blob,
    meta: {
      title?: string;
      subjectId?: string;
      publisher?: string;
      editionYear?: number;
      language?: string;
      rightsConfirmed: boolean;
    },
    onProgress?: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<{ success: boolean; book: LearningMaterial }> => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);
      if (meta.title) formData.append('title', meta.title);
      if (meta.subjectId) formData.append('subjectId', meta.subjectId);
      if (meta.publisher) formData.append('publisher', meta.publisher);
      if (meta.editionYear) formData.append('editionYear', String(meta.editionYear));
      if (meta.language) formData.append('language', meta.language);
      formData.append('rightsConfirmed', String(meta.rightsConfirmed));

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/materials/books/upload`);
      xhr.withCredentials = true;

      if (signal) {
        signal.addEventListener('abort', () => {
          xhr.abort();
          reject(new Error('Tải lên đã bị hủy.'));
        });
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch {
            reject(new Error('Phản hồi từ máy chủ không hợp lệ.'));
          }
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.error?.message || err.message || `Lỗi tải lên (${xhr.status})`));
          } catch {
            reject(new Error(`Tải lên sách thất bại với mã lỗi HTTP ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Không thể kết nối đến máy chủ.'));
      xhr.send(formData);
    });
  },
  finalizeBookUpload: (id: string, data: { sizeBytes: number; sha256?: string; detectedMime?: string }) =>
    fetchJson<{ success: boolean; book: LearningMaterial }>(`/materials/books/${id}/finalize`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteBook: (id: string) => fetchJson<{ success: boolean }>(`/materials/books/${id}`, { method: 'DELETE' }),
  getBookStatus: (id: string) =>
    fetchJson<{ status: string; progress: number; pageCount: number; chapterCount: number; errorMessage?: string }>(
      `/materials/books/${id}/status`
    ),
  retryBookProcessing: (id: string) =>
    fetchJson<{ success: boolean; message: string }>(`/materials/books/${id}/retry-processing`, { method: 'POST' }),
  getBookChapters: (id: string) => fetchJson<{ chapters: BookChapter[] }>(`/materials/books/${id}/chapters`),
  readBookPage: (id: string, page: number, chapterId?: string) =>
    fetchJson<{ page: number; chunks: BookChunk[]; pageCount: number }>(
      `/materials/books/${id}/read?page=${page}${chapterId ? `&chapterId=${encodeURIComponent(chapterId)}` : ''}`
    ),
  searchBook: (id: string, query: string, chapterId?: string, page?: number) => {
    const qParams = new URLSearchParams();
    qParams.set('q', query);
    if (chapterId) qParams.set('chapterId', chapterId);
    if (page) qParams.set('page', String(page));
    return fetchJson<{ results: Array<{ chunk: BookChunk; score: number; snippet: string }> }>(
      `/materials/books/${id}/search?${qParams.toString()}`
    );
  },
  getBookProgress: (id: string) => fetchJson<{ progress: BookProgress | null }>(`/materials/books/${id}/progress`),
  saveBookProgress: (id: string, page: number, chapterId?: string, percentage?: number) =>
    fetchJson<{ progress: BookProgress }>(`/materials/books/${id}/progress`, {
      method: 'PUT',
      body: JSON.stringify({ page, chapterId, percentage: percentage || 0 }),
    }),
  getBookmarks: (id: string) => fetchJson<{ bookmarks: BookBookmark[] }>(`/materials/books/${id}/bookmarks`),
  createBookmark: (id: string, data: { page: number; title: string; chapterId?: string; sourceAnchor?: string }) =>
    fetchJson<{ bookmark: BookBookmark }>(`/materials/books/${id}/bookmarks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteBookmark: (id: string, bookmarkId: string) =>
    fetchJson<{ success: boolean }>(`/materials/books/${id}/bookmarks/${bookmarkId}`, { method: 'DELETE' }),
  getHighlights: (id: string) => fetchJson<{ highlights: BookHighlight[] }>(`/materials/books/${id}/highlights`),
  createHighlight: (
    id: string,
    data: { page: number; selectedText: string; note?: string; color?: string; chapterId?: string }
  ) =>
    fetchJson<{ highlight: BookHighlight }>(`/materials/books/${id}/highlights`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteHighlight: (id: string, highlightId: string) =>
    fetchJson<{ success: boolean }>(`/materials/books/${id}/highlights/${highlightId}`, { method: 'DELETE' }),
  generateBookStudyAid: (id: string, data: BookStudyAidRequest) =>
    fetchJson<BookStudyAidResult>(`/materials/books/${id}/study-aids`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Realtime WebRTC
  sendRealtimeSdpOffer: (sdpOffer: string) =>
    fetchJson<{ mode: 'openai_realtime' | 'demo_fallback'; sdpAnswer?: string; model?: string; message?: string }>(
      '/jami/realtime/calls',
      {
        method: 'POST',
        body: JSON.stringify({ sdpOffer }),
      }
    ),

  // Outlines (6.2)
  getOutlines: (subjectId?: string) =>
    fetchJson<{ outlines: Outline[] }>(`/outlines${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ''}`),
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
  sendJamiChat: (message: string, conversationId?: string, clientMessageId?: string, materialId?: string, signal?: AbortSignal) =>
    fetchJson<{
      userMessage: JamiMessageItem;
      replyMessage: JamiMessageItem;
      clientAction?: any;
      proposal?: any;
      isDemoMode: boolean;
    }>('/jami/chat', {
      method: 'POST',
      body: JSON.stringify({ message, conversationId, clientMessageId, materialId }),
      signal,
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
  sendVoiceCommand: (transcript: string, clientTurnId?: string, mode?: string, conversationId?: string, signal?: AbortSignal) =>
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
      signal,
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
