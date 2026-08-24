/// <reference types="vite/client" />

import {
  User,
  StudentProfile,
  Subject,
  TimetableEntry,
  BusyEvent,
  Exam,
  StudyTask,
  FocusSession,
  Quiz,
  QuizAttempt,
  LearningMaterial,
  NotificationItem,
  JamiMemorySummary,
  ScheduleProposal,
} from '../../shared/types';
import { z } from 'zod';
import { LoginRequestSchema, RegisterRequestSchema } from '../../shared/schemas';

const getBaseUrl = (): string => {
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  if (!envUrl) return '/api/v1';
  let clean = String(envUrl).trim();
  if (clean.endsWith('/')) clean = clean.slice(0, -1);
  return clean;
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
  let relativePath = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
  
  let fullUrl: string;
  if (API_BASE.startsWith('http://') || API_BASE.startsWith('https://')) {
    fullUrl = `${API_BASE}${relativePath}`;
  } else {
    const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
    if (relativePath.startsWith(base)) {
      fullUrl = relativePath;
    } else {
      fullUrl = `${base}${relativePath}`;
    }
  }

  const token = typeof window !== 'undefined' ? localStorage.getItem('jami_session_token') : null;
  const isBodyObject = options?.body && typeof options.body === 'string';
  const headers: Record<string, string> = {
    ...(isBodyObject ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string>),
  };

  let response: Response;
  try {
    response = await fetch(fullUrl, {
      ...options,
      credentials: 'include',
      headers,
    });
  } catch (netErr: any) {
    throw new ApiError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền mạng.', 0, netErr, 'NETWORK_ERROR');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new ApiError(
      `Máy chủ phản hồi với định dạng không phải JSON (${contentType || 'không xác định'}). Vui lòng kiểm tra lại cấu hình backend.`,
      response.status,
      null,
      'INVALID_RESPONSE_FORMAT'
    );
  }

  let result: any = null;
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

  if (result?.token && typeof window !== 'undefined') {
    localStorage.setItem('jami_session_token', result.token);
  }

  return result;
}

export const api = {
  // Auth & Identity
  getMe: () => fetchJson<{ user: User; profile: StudentProfile; isDemo: boolean }>('/me'),
  login: async (data: z.infer<typeof LoginRequestSchema>) => {
    const res = await fetchJson<{ user: User; profile: StudentProfile; isDemo: boolean; token?: string; message: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res.token) localStorage.setItem('jami_session_token', res.token);
    return res;
  },
  loginDemo: async () => {
    const res = await fetchJson<{ user: User; profile: StudentProfile; isDemo: boolean; token?: string; message: string }>('/auth/demo-login', {
      method: 'POST',
    });
    if (res.token) localStorage.setItem('jami_session_token', res.token);
    return res;
  },
  register: async (data: z.infer<typeof RegisterRequestSchema>) => {
    const res = await fetchJson<{ user: User; profile: StudentProfile; isDemo: boolean; token?: string; message: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res.token) localStorage.setItem('jami_session_token', res.token);
    return res;
  },
  logout: async () => {
    try {
      await fetchJson<{ success: boolean; message: string }>('/auth/logout', { method: 'POST' });
    } finally {
      if (typeof window !== 'undefined') localStorage.removeItem('jami_session_token');
    }
  },
  forgotPassword: (email: string) =>
    fetchJson<{ success: boolean; message: string; emailServiceConfigured: boolean }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  updateProfile: (data: Partial<StudentProfile>) =>
    fetchJson<{ profile: StudentProfile }>('/profile', { method: 'PATCH', body: JSON.stringify(data) }),
  completeOnboarding: (data: Partial<StudentProfile>) =>
    fetchJson<{ success: boolean; profile: StudentProfile }>('/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Dashboard Overview
  getDashboardOverview: () => fetchJson<DashboardOverviewData>('/dashboard/overview'),

  // Subjects
  getSubjects: () => fetchJson<{ subjects: Subject[] }>('/subjects'),

  // Timetable
  getTimetable: () => fetchJson<{ entries: TimetableEntry[]; busyEvents: BusyEvent[] }>('/timetables'),
  addBusyEvent: (event: Partial<BusyEvent>) =>
    fetchJson<{ event: BusyEvent }>('/busy-events', { method: 'POST', body: JSON.stringify(event) }),
  deleteBusyEvent: (id: string) => fetchJson<{ success: boolean }>(`/busy-events/${id}`, { method: 'DELETE' }),

  // Tasks
  getTasks: () => fetchJson<{ tasks: StudyTask[] }>('/tasks'),
  getTask: (id: string) => fetchJson<{ task: StudyTask }>(`/tasks/${id}`),
  updateTask: (id: string, updates: Partial<StudyTask>) =>
    fetchJson<{ task: StudyTask }>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  completeTaskStep: (taskId: string, stepId: string) =>
    fetchJson<{ task: StudyTask }>(`/tasks/${taskId}/steps/${stepId}/complete`, { method: 'POST' }),
  completeTask: (taskId: string) => fetchJson<{ task: StudyTask }>(`/tasks/${taskId}/complete`, { method: 'POST' }),

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
  confirmProposal: (proposalId: string) =>
    fetchJson<{ success: boolean; tasks: StudyTask[] }>(`/planner/proposals/${proposalId}/confirm`, {
      method: 'POST',
    }),
  previewReplan: () => fetchJson<{ proposal: ScheduleProposal }>('/planner/replan/preview', { method: 'POST' }),

  // Exams & Quizzes
  getExams: () => fetchJson<{ exams: Exam[] }>('/exams'),
  addExam: (data: Partial<Exam>) => fetchJson<{ exam: Exam }>('/exams', { method: 'POST', body: JSON.stringify(data) }),
  getQuizzes: () => fetchJson<{ quizzes: Quiz[] }>('/quizzes'),
  getQuiz: (id: string) => fetchJson<{ quiz: Quiz }>(`/quizzes/${id}`),
  submitQuiz: (quizId: string, answers: { questionId: string; answer: string }[]) =>
    fetchJson<{ attempt: QuizAttempt; answersFeedback: any[] }>(`/quizzes/${quizId}/attempts/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),

  // Materials
  getMaterials: () => fetchJson<{ materials: LearningMaterial[] }>('/materials'),
  addMaterial: (data: Partial<LearningMaterial>) =>
    fetchJson<{ material: LearningMaterial }>('/materials', { method: 'POST', body: JSON.stringify(data) }),
  deleteMaterial: (id: string) => fetchJson<{ success: boolean }>(`/materials/${id}`, { method: 'DELETE' }),

  // Reports
  getReportsOverview: () => fetchJson<any>('/reports/overview'),

  // Notifications
  getNotifications: () => fetchJson<{ notifications: NotificationItem[] }>('/notifications'),
  markNotificationRead: (id: string) => fetchJson<{ success: boolean }>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => fetchJson<{ success: boolean }>('/notifications/read-all', { method: 'POST' }),

  // Jami Chat & Messages
  getJamiMessages: () => fetchJson<{ messages: JamiChatMessageItem[] }>('/jami/messages'),
  sendJamiChat: (message: string) =>
    fetchJson<{ userMessage: JamiChatMessageItem; replyMessage: JamiChatMessageItem; isDemoMode: boolean }>('/jami/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  confirmJamiAction: (messageId: string) =>
    fetchJson<{ success: boolean; message: JamiChatMessageItem }>(`/jami/messages/${messageId}/confirm`, {
      method: 'POST',
    }),
  getRealtimeSession: () => fetchJson<{ clientSecret?: string; mode: string; message: string }>('/jami/realtime/session', {
    method: 'POST',
  }),
  getJamiPreferences: () => fetchJson<{ preferences: any; memories: JamiMemorySummary[] }>('/jami/preferences'),
  updateJamiPreferences: (prefs: any) =>
    fetchJson<{ preferences: any }>('/jami/preferences', { method: 'PATCH', body: JSON.stringify(prefs) }),
  deleteJamiMemory: (id: string) => fetchJson<{ success: boolean }>(`/jami/memory/${id}`, { method: 'DELETE' }),
  exportMyData: () => fetchJson<any>('/me/export', { method: 'POST' }),
};
