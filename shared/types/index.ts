// Shared TypeScript types for JAMI AI

export interface User {
  id: string;
  email: string;
  displayName: string;
  preferredName: string;
  locale: string;
  timezone: string;
  ageBand: string;
  role?: 'user' | 'admin';
  status: 'active' | 'inactive' | 'banned' | 'deleted';
  createdAt: string;
}

export interface StudentProfile {
  userId: string;
  gradeLevel: number;
  schoolName: string;
  goals: string[];
  preferredSessionMinutes: number;
  maxDailyStudyMinutes: number;
  energyPreferences: {
    morning: 'low' | 'medium' | 'high';
    afternoon: 'low' | 'medium' | 'high';
    evening: 'low' | 'medium' | 'high';
  };
  sleepSchedule: {
    wakeTime: string;
    bedTime: string;
  };
  mealTimes: {
    lunch: string;
    dinner: string;
  };
  onboardingCompletedAt?: string;
}

export interface Subject {
  id: string;
  userId?: string;
  name: string;
  color: string;
  icon: string;
  sortOrder?: number;
}

export interface SchoolTimetable {
  id: string;
  userId: string;
  name: string;
  validFrom?: string;
  validTo?: string;
  timezone: string;
  isActive: boolean;
  entries?: Partial<TimetableEntry>[];
}

export interface TimetableEntry {
  id: string;
  timetableId?: string;
  subjectId?: string;
  subjectName?: string;
  subjectColor?: string;
  title: string;
  dayOfWeek: number; // 1 = Monday, ..., 7 = Sunday
  period?: number;
  startLocalTime: string; // "07:30"
  endLocalTime: string;   // "11:45"
  room?: string;
  location?: string;
  commuteBeforeMinutes: number;
  commuteAfterMinutes: number;
}

export interface BusyEvent {
  id: string;
  userId: string;
  type: 'extra_class' | 'meal' | 'sleep' | 'commute' | 'personal';
  title: string;
  startsAt: string; // ISO String
  endsAt: string;   // ISO String
  recurrenceRule?: string;
  timezone: string;
  isFixed: boolean;
  subjectId?: string;
  subjectName?: string;
  source?: string;
}

export interface AvailabilityRule {
  id: string;
  userId: string;
  dayOfWeek: number; // 1..7
  startLocalTime: string; // "07:00"
  endLocalTime: string;   // "22:00"
  effectiveFrom?: string;
  effectiveTo?: string;
  type: 'available' | 'preferred' | 'blocked';
  isEnabled: boolean;
}

export interface ExamMilestone {
  id?: string;
  examId?: string;
  milestoneType: 'D-14' | 'D-7' | 'D-3' | 'D-1';
  name: string;
  date: string;
  status: 'pending' | 'current' | 'completed' | 'overdue';
  relatedQuizId?: string;
  completedAt?: string;
}

export interface ExamTopic {
  id?: string;
  name: string;
  weight: number;
  notes?: string;
}

export interface Exam {
  id: string;
  userId: string;
  subjectId: string;
  subjectName?: string;
  subjectColor?: string;
  title: string;
  examAt: string; // ISO String
  importance: 'low' | 'medium' | 'high' | 'critical';
  scopeText: string;
  topics: ExamTopic[];
  milestones?: ExamMilestone[];
  status?: 'upcoming' | 'completed' | 'cancelled';
  createdAt?: string;
  updatedAt?: string;
}

export interface ExecutionStep {
  id: string;
  stepOrder: number;
  title: string;
  plannedMinutes: number;
  instruction: string;
  expectedOutput: string;
  tips: string[];
  status: 'pending' | 'in_progress' | 'completed';
  actualMinutes?: number;
  startedAt?: string;
  completedAt?: string;
}

export interface PreparationChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  checkedAt?: string;
}

export interface ExecutionGuide {
  id?: string;
  taskId: string;
  objective: string;
  whyItMatters: string;
  prerequisites: string[];
  materials: string[];
  preparationChecklist: PreparationChecklistItem[];
  steps: ExecutionStep[];
  successCriteria: string[];
  excellentCriteria: string[];
  evidenceRequired: string[];
  commonMistakes: string[];
  fallbackAction: string;
  completionQuestions: string[];
  nextAction: string;
}

export interface TaskEvidence {
  id: string;
  taskId: string;
  userId: string;
  stepId?: string;
  type: 'image' | 'text' | 'quiz_result' | 'file';
  r2ObjectKey?: string;
  fileUrl?: string;
  textValue?: string;
  scoreValue?: number;
  notes?: string;
  verified: boolean;
  createdAt: string;
}

export interface StudyTask {
  id: string;
  userId: string;
  planId?: string;
  subjectId: string;
  subjectName?: string;
  examId?: string;
  title: string;
  objective?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  difficulty: 'easy' | 'medium' | 'hard';
  dueAt?: string;
  estimatedMinutes: number;
  minSessionMinutes?: number;
  maxSessionMinutes?: number;
  minimumSessionMinutes?: number;
  maximumSessionMinutes?: number;
  splittable: boolean;
  locked: boolean;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  completionPercent: number;
  source?: string;
  executionGuide?: ExecutionGuide;
  guide?: ExecutionGuide;
}

export interface FocusSession {
  id: string;
  userId: string;
  taskId?: string;
  taskTitle?: string;
  subjectName?: string;
  mode: '25_5' | '45_10' | 'custom';
  phase?: 'work' | 'break';
  plannedMinutes: number;
  breakMinutes?: number;
  actualMinutes?: number;
  actualFocusSeconds?: number;
  durationMinutes?: number;
  state: 'ready' | 'running' | 'paused' | 'break' | 'completed' | 'abandoned';
  startedAt?: string;
  pausedAt?: string;
  endedAt?: string;
  lastResumedAt?: string;
  targetEndAt?: string;
  remainingSecondsAtPause?: number;
  pauseCount?: number;
  accumulatedPauseSeconds?: number;
  notes?: string;
  outcome?: string;
  idempotencyKey?: string;
  serverNow?: string;
  createdAt?: string;
}

export interface TodayDashboardOverview {
  studentName: string;
  gradeLevel: number;
  greetingMessage?: string;
  todayDateFormatted?: string;
  timetable: {
    nextSessionTitle?: string;
    nextSessionTime?: string;
    todaySessionsCount: number;
    todaySessions: { title: string; time: string; subject?: string; isBusyEvent?: boolean }[];
  };
  tasks: {
    priorityTaskTitle?: string;
    priorityTaskId?: string;
    pendingCount: number;
    todayTasksCount: number;
    overdueCount: number;
  };
  todayStudy: {
    actualFocusMinutes: number;
    completedMinutes: number;
    plannedMinutes: number;
    completedPercent: number;
    streakDays: number;
  };
  jami: {
    latestMessage: string;
    conversationStatus: string;
  };
  exams: {
    upcomingTitle?: string;
    daysRemaining: number;
  };
  reports: {
    totalFocusMinutes7Days: number;
    totalFocusMinutesPrev7Days: number;
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


export interface QuizQuestion {
  id: string;
  quizId?: string;
  order: number;
  type: 'multiple_choice' | 'true_false' | 'short_answer';
  prompt: string;
  options?: any;
  difficulty: 'easy' | 'medium' | 'hard';
  topicRef?: string;
  correctAnswer?: string;
  explanation?: string;
}

export interface Quiz {
  id: string;
  userId: string;
  examId?: string;
  subjectId: string;
  subjectName?: string;
  title: string;
  type: 'practice' | 'diagnostic' | 'weak_topic' | 'simulation' | 'quick_review';
  milestone?: 'D-14' | 'D-7' | 'D-3' | 'D-1';
  difficulty: 'easy' | 'medium' | 'hard';
  status?: 'draft' | 'ready' | 'archived';
  questionCount?: number;
  lastScore?: number;
  questions?: QuizQuestion[];
  generatedByAi?: boolean;
  createdAt?: string;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  userId: string;
  startedAt: string;
  submittedAt?: string;
  score?: number;
  maxScore: number;
  status: 'in_progress' | 'submitted' | 'abandoned';
  feedbackSummary?: string;
  answers: {
    questionId: string;
    answer: string;
    isCorrect?: boolean;
    feedback?: string;
  }[];
}

export interface StructuredMaterialSummary {
  overview: string;
  keyPoints: string[];
  concepts: { name: string; definition: string }[];
  formulas?: string[];
  sourceReferences?: { pageOrSection: string; note: string }[];
  warning?: string;
}

export interface Material {
  id: string;
  userId: string;
  subjectId: string;
  subjectName?: string;
  title: string;
  type: 'pdf' | 'image' | 'notes';
  fileName?: string;
  r2ObjectKey?: string;
  mimeType?: string;
  sizeBytes: number;
  sha256?: string;
  processingStatus: 'uploading' | 'queued' | 'processing' | 'ready' | 'error';
  summary?: string;
  summaryJson?: StructuredMaterialSummary;
  contentText?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt?: string;
}

export type LearningMaterial = Material;

export interface TopicMastery {
  id: string;
  subjectId: string;
  topicKey: string;
  masteryScore: number; // 0 - 100
  confidence: number;
  evidenceCount: number;
  lastPracticedAt: string;
}

export interface QuizSubmission {
  quizId: string;
  answers: {
    questionId: string;
    answer: string;
  }[];
}

export interface QuizAttemptResult {
  attemptId: string;
  quizId?: string;
  score: number;
  maxScore: number;
  totalQuestions?: number;
  correctCount?: number;
  percentage?: number;
  feedbackSummary: string;
  submittedAt?: string;
  answers: {
    questionId: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    explanation: string;
  }[];
}

export type NotificationType =
  | 'upcoming_class'
  | 'upcoming_exam'
  | 'incomplete_task'
  | 'task_due'
  | 'task_overdue'
  | 'focus_upcoming'
  | 'system';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  actionUrl?: string;
  scheduledFor?: string;
  deliveredAt?: string;
  readAt?: string;
  status: 'unread' | 'read' | 'archived';
  dedupeKey?: string;
  createdAt?: string;
}

export type NotificationItem = Notification;

export interface NotificationPreferences {
  userId: string;
  upcomingClass: boolean;
  upcomingExam: boolean;
  incompleteTask: boolean;
  soundEnabled: boolean;
  leadMinutes: number;
  classLeadMinutes: number;
  taskLeadMinutes: number;
  examLeadDays: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string;
  inAppEnabled: boolean;
  webPushEnabled: boolean;
  pushSubscription?: any;
}

export interface JamiConversation {
  id: string;
  userId: string;
  title: string;
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JamiActionProposal {
  id: string;
  userId: string;
  conversationId?: string;
  messageId?: string;
  actionType: string;
  arguments?: any;
  previewText?: string;
  preview?: any;
  status: 'pending' | 'confirmed' | 'executed' | 'rejected' | 'expired' | 'failed';
  idempotencyKey?: string;
  expiresAt: string;
  executedAt?: string;
  createdAt: string;
}

export interface JamiMessageItem {
  id: string;
  conversationId?: string;
  userId: string;
  sender: 'user' | 'jami';
  text: string;
  emotion?: string;
  suggestedActions?: { label: string; action?: string; route?: string }[] | string[];
  requiresConfirmation?: boolean;
  confirmationSummary?: string;
  proposalId?: string;
  proposal?: JamiActionProposal;
  isConfirmed?: boolean;
  clientMessageId?: string;
  createdAt: string;
}

export interface JamiPreferences {
  userId: string;
  voiceEnabled: boolean;
  soundEffects: boolean;
  selectedVoice: string;
  animationEnabled: boolean;
  responseLength: 'concise' | 'balanced' | 'detailed';
  preferredAddress: string;
  memoryEnabled: boolean;
}

export interface JamiMemorySummary {
  id: string;
  userId?: string;
  category: 'weak_subject' | 'preference' | 'habit';
  summary: string;
  createdAt: string;
}

export interface ScheduleProposal {
  id: string;
  userId: string;
  basePlanVersion?: number;
  status?: 'pending' | 'confirmed' | 'rejected' | 'expired';
  reason: string;
  tasksToSchedule: {
    taskId: string;
    title: string;
    subjectId: string;
    subjectName?: string;
    subjectColor?: string;
    estimatedMinutes: number;
    proposedStart: string;
    proposedEnd: string;
    reason: string;
  }[];
  unscheduledItems: {
    title: string;
    reason: string;
  }[];
  expiresAt: string;
  confirmedAt?: string;
  idempotencyKey?: string;
}

export interface DailyStudyStat {
  date: string; // YYYY-MM-DD
  dayLabel: string; // T2, T3, T4, T5, T6, T7, CN
  actualMinutes: number;
  plannedMinutes: number;
  completedTasksCount: number;
  quizScoreAvg: number | null;
}

export interface SubjectReportStat {
  subjectId: string;
  subjectName: string;
  color: string;
  plannedMinutes: number;
  actualMinutes: number;
  completionPercent: number;
  taskCount: number;
  completedTaskCount: number;
  quizCount: number;
  avgQuizScore: number | null;
}

export type WeeklySubjectStat = SubjectReportStat;

export interface TopicMasteryStat {
  topicKey: string;
  subjectName: string;
  subjectColor?: string;
  masteryScore: number;
  confidence: number;
  evidenceCount: number;
  status: 'mastered' | 'good' | 'needs_review';
  statusLabel: string;
  lastPracticedAt?: string;
}

export interface PeriodComparison {
  actualMinutesDiffPercent: number | null;
  completedTasksDiff: number;
  quizScoreDiff: number | null;
  hasPreviousData: boolean;
}

export interface ReportRecommendation {
  id: string;
  type: 'strength' | 'weakness' | 'habit' | 'schedule';
  message: string;
  actionLabel?: string;
  actionUrl?: string;
  generatedByAi?: boolean;
}

export interface ReportOverviewResponse {
  period: {
    type: 'week' | 'month' | 'custom';
    from: string;
    to: string;
    timezone: string;
    label: string;
  };
  summary: {
    plannedMinutes: number;
    plannedHours: number;
    actualFocusMinutes: number;
    actualFocusHours: number;
    totalTasks: number;
    completedTasks: number;
    completionRate: number;
    onTimeRate: number | null;
    averageQuizScore: number | null;
    totalQuizAttempts: number;
    streakDays: number;
    focusQualityScore: number;
  };
  dailyStudy: DailyStudyStat[];
  subjectBreakdown: SubjectReportStat[];
  topicMastery: TopicMasteryStat[];
  weakTopics: TopicMasteryStat[];
  strongTopics: TopicMasteryStat[];
  comparison: PeriodComparison;
  recommendations: ReportRecommendation[];
  hasData: boolean;
}

export type StudyReport = ReportOverviewResponse;

