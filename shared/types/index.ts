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
  lastActiveAt?: string;
  lastOfflineScanAt?: string;
  createdAt: string;
}

export interface StudentProfile {
  userId: string;
  gradeLevel: number;
  schoolName: string;
  goals: string[];
  preferredName?: string;
  weakSubjects?: string[];
  curriculum?: string;
  learningStyle?: string;
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
  teacher?: string;
  dayOfWeek: number; // 1 = Monday, ..., 7 = Sunday
  period?: number;
  startLocalTime: string; // "07:30"
  endLocalTime: string;   // "11:45"
  room?: string;
  location?: string;
  commuteBeforeMinutes: number;
  commuteAfterMinutes: number;
  isSkippedThisWeek?: boolean;
  exceptionId?: string;
}

export interface TimetableEntryException {
  id: string;
  userId: string;
  timetableEntryId: string;
  occurrenceDate: string; // "YYYY-MM-DD"
  exceptionType: 'cancelled' | 'rescheduled' | 'skip';
  reason?: string;
  createdAt: string;
}

export type UnderstandingLevel = 'very_easy' | 'normal' | 'hard' | 'not_understood';
export type SessionAttendanceStatus = 'attended' | 'absent';

export interface ClassSessionCheckin {
  id: string;
  userId: string;
  timetableEntryId: string;
  occurrenceDate: string; // "YYYY-MM-DD"
  learnedContent?: string;
  homework?: string;
  hasNoHomework?: boolean;
  reflection?: string;
  understandingLevel?: UnderstandingLevel;
  attendanceStatus: SessionAttendanceStatus;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MissedClassSession {
  timetableEntryId: string;
  subjectId?: string;
  subjectName: string;
  title: string;
  dayOfWeek: number;
  startLocalTime: string;
  endLocalTime: string;
  occurrenceDate: string; // "YYYY-MM-DD"
  formattedDate: string;  // "DD/MM/YYYY"
  dayOfWeekText: string;  // "Thứ Hai", "Thứ Ba", ...
  room?: string;
}

export interface TodayLessonLogItem {
  id: string;
  timetableEntryId: string;
  timetableEntryIds: string[];
  subjectId?: string;
  subjectName: string;
  subjectColor?: string;
  periodLabel: string;
  startTime: string;
  endTime: string;
  room?: string;
  isSkipped: boolean;
  skipReason?: string;
  attendanceStatus: 'attended' | 'absent' | 'unconfirmed';
  learnedContent?: string;
  homework?: string;
  hasNoHomework?: boolean;
  homeworkDueAt?: string;
  homeworkEstimatedMinutes?: number;
  reflection?: string;
  understandingLevel?: 'very_easy' | 'normal' | 'hard' | 'not_understood';
  checkinId?: string;
  linkedTaskId?: string;
  savedAt?: string;
}

export type TomorrowPlanEnergyLevel = 'high' | 'normal' | 'low' | 'due_only' | 'skip';
export type TomorrowPlanStatus = 'draft' | 'accepted' | 'in_progress' | 'completed' | 'dismissed' | 'expired' | 'empty';
export type TomorrowPlanItemSource =
  | 'due_task'
  | 'exam_review'
  | 'class_checkin_reflection'
  | 'class_checkin_homework'
  | 'tomorrow_subject_preview'
  | 'pack_bag'
  | 'general_review';
export type TomorrowPlanItemStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface TomorrowPreparationItem {
  id: string;
  planId: string;
  subjectId?: string;
  subjectName?: string;
  subjectColor?: string;
  title: string;
  description?: string;
  reason?: string;
  sourceType: TomorrowPlanItemSource;
  sourceId?: string;
  priority: 'high' | 'medium' | 'low';
  plannedMinutes: number;
  startAt: string; // "19:30"
  endAt: string;   // "19:50"
  status: TomorrowPlanItemStatus;
  sortOrder: number;
  taskId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TomorrowPreparationPlan {
  id: string;
  userId: string;
  planDate: string;   // "YYYY-MM-DD"
  targetDate: string; // "YYYY-MM-DD"
  availableStart: string; // "19:00"
  availableEnd: string;   // "22:00"
  energyLevel: TomorrowPlanEnergyLevel;
  totalMinutes: number;
  status: TomorrowPlanStatus;
  generatedAt: string;
  acceptedAt?: string;
  completedAt?: string;
  items: TomorrowPreparationItem[];
  createdAt: string;
  updatedAt: string;
}

export interface TomorrowPlanOverviewInfo {
  hasPlan: boolean;
  plan?: TomorrowPreparationPlan;
  isEvening: boolean;
  availableFreeMinutes: number;
  tomorrowSubjectsCount: number;
  tomorrowSubjects: string[];
  bannerMessage?: string;
}

export interface BusyEvent {
  id: string;
  userId: string;
  type: 'extra_class' | 'club' | 'personal' | 'meal' | 'sleep' | 'commute';
  eventType?: 'extra_class' | 'club' | 'personal' | 'meal' | 'sleep' | 'commute';
  title: string;
  startsAt: string; // ISO String
  endsAt: string;   // ISO String
  recurrenceRule?: string;
  timezone: string;
  isFixed: boolean;
  location?: string;
  commuteBeforeMinutes?: number;
  commuteAfterMinutes?: number;
  subjectId?: string;
  subjectName?: string;
  source?: string;
}

export interface BusyEventException {
  id: string;
  userId: string;
  busyEventId: string;
  occurrenceDate: string; // "YYYY-MM-DD"
  exceptionType: 'cancelled' | 'skip';
  reason?: string;
  createdAt: string;
  updatedAt: string;
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
  targetScore?: number;
  examFormat?: 'multiple_choice' | 'essay' | 'combined';
  scopeText: string;
  topics: ExamTopic[];
  milestones?: ExamMilestone[];
  dailyMinutes?: number;
  startDate?: string;
  blackoutDates?: string[];
  status?: 'upcoming' | 'completed' | 'cancelled';
  createdAt?: string;
  updatedAt?: string;
}

// ==========================================
// Exam Study Planner & Spaced Repetition Mistakes
// ==========================================

export type ExamPlanActivityType =
  | 'theory_review'
  | 'basic_practice'
  | 'medium_practice'
  | 'advanced_practice'
  | 'mistake_review'
  | 'mock_test'
  | 'light_revision';

export type ExamPlanItemStatus = 'pending' | 'in_progress' | 'completed' | 'missed' | 'skipped';

export interface ExamStudyPlanItem {
  id: string;
  planId: string;
  subjectId?: string;
  subjectName?: string;
  title: string;
  description?: string;
  activityType: ExamPlanActivityType;
  sourceType: 'exam_scope' | 'mistake_notebook' | 'weak_topic' | 'mock_test';
  sourceId?: string;
  priority: 'high' | 'medium' | 'low';
  plannedDate: string; // "YYYY-MM-DD"
  startAt: string;     // "HH:mm"
  endAt: string;       // "HH:mm"
  plannedMinutes: number;
  status: ExamPlanItemStatus;
  completedAt?: string;
  sortOrder: number;
  taskId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExamStudyPlanVersion {
  id: string;
  planId: string;
  versionNumber: number;
  snapshotJson: string;
  reason?: string;
  createdAt: string;
}

export interface ExamStudyPlan {
  id: string;
  userId: string;
  examId: string;
  examTitle?: string;
  subjectId?: string;
  subjectName?: string;
  startDate: string;  // "YYYY-MM-DD"
  targetDate: string; // "YYYY-MM-DD"
  dailyMinutes: number;
  status: 'draft' | 'accepted' | 'in_progress' | 'completed' | 'dismissed' | 'expired';
  currentVersion: number;
  generatedAt: string;
  acceptedAt?: string;
  completedAt?: string;
  items: ExamStudyPlanItem[];
  relatedMistakeCount?: number;
  daysRemaining?: number;
  totalPlannedMinutes?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExamStudyPlanReplanProposal {
  planId: string;
  examTitle: string;
  missedSession: ExamStudyPlanItem;
  suggestedSlot: {
    plannedDate: string;
    startAt: string;
    endAt: string;
  };
  explanation: string;
}

export type MistakeReason =
  | 'knowledge_gap'
  | 'misread_question'
  | 'calculation_error'
  | 'wrong_choice'
  | 'time_pressure'
  | 'not_learned_yet'
  | 'other';

export type MistakeStatus = 'new' | 'reviewing' | 'needs_retry' | 'mastered';
export type MistakeDifficulty = 'easy' | 'medium' | 'hard';
export type MistakeSourceType = 'quiz' | 'exam_mock' | 'manual' | 'class_exercise';

export interface MistakeNotebookEntry {
  id: string;
  userId: string;
  subjectId?: string;
  subjectName?: string;
  topic: string;
  questionText: string;
  questionDataJson?: string;
  selectedAnswer?: string;
  correctAnswer: string;
  mistakeReason: MistakeReason;
  correctExplanation?: string;
  difficulty: MistakeDifficulty;
  sourceType: MistakeSourceType;
  sourceId?: string;
  firstMistakeAt: string;
  lastReviewedAt?: string;
  nextReviewAt: string;
  reviewCount: number;
  correctStreak: number;
  status: MistakeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MistakeReviewAttempt {
  id: string;
  mistakeEntryId: string;
  userId: string;
  answer: string;
  isCorrect: boolean;
  reviewedAt: string;
  nextReviewAt: string;
  createdAt: string;
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
  type: 'image' | 'text' | 'quiz_result' | 'file' | 'link';
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
  mode: '15' | '25' | '45' | '60' | '25_5' | '45_10' | 'custom' | string;
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
    dailyGoalMinutes?: number;
    completedTasksCount?: number;
    totalTasksCount?: number;
    yesterdayFocusMinutes?: number;
    yesterdayComparisonLabel?: string;
    yesterdayDiffMinutes?: number;
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
  type: 'pdf' | 'image' | 'notes' | 'docx' | 'epub' | 'txt';
  materialKind?: 'document' | 'book';
  originalFilename?: string;
  detectedMime?: string;
  publisher?: string;
  editionYear?: number;
  language?: string;
  coverObjectKey?: string;
  pageCount?: number;
  chapterCount?: number;
  processingProgress?: number;
  rightsConfirmedAt?: string;
  rightsTermsVersion?: string;
  fileName?: string;
  r2ObjectKey?: string;
  mimeType?: string;
  sizeBytes: number;
  sha256?: string;
  processingStatus: 'uploading' | 'queued' | 'processing' | 'ready' | 'needs_ocr' | 'error';
  summary?: string;
  summaryJson?: StructuredMaterialSummary;
  contentText?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface BookChapter {
  id: string;
  materialId: string;
  parentId?: string;
  ordinal: number;
  title: string;
  startPage: number;
  endPage: number;
  sourceAnchor?: string;
  children?: BookChapter[];
  createdAt?: string;
}

export interface BookChunk {
  id: string;
  materialId: string;
  chapterId?: string;
  chapterTitle?: string;
  ordinal: number;
  text: string;
  pageStart: number;
  pageEnd: number;
  tokenCount: number;
  contentHash?: string;
  createdAt?: string;
}

export interface BookProgress {
  id?: string;
  userId: string;
  materialId: string;
  chapterId?: string;
  page: number;
  percentage: number;
  updatedAt?: string;
}

export interface BookBookmark {
  id: string;
  userId: string;
  materialId: string;
  chapterId?: string;
  page: number;
  title: string;
  sourceAnchor?: string;
  createdAt: string;
}

export interface BookHighlight {
  id: string;
  userId: string;
  materialId: string;
  chapterId?: string;
  page: number;
  selectedText: string;
  note?: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookStudyAidRequest {
  action: 'summary' | 'outline' | 'flashcards' | 'quiz' | 'explain' | 'study_plan' | 'send_to_mistake_notebook';
  chapterId?: string;
  startPage?: number;
  endPage?: number;
  conceptToExplain?: string;
  options?: any;
  idempotencyKey?: string;
}

export interface BookStudyCitation {
  bookTitle: string;
  chapterTitle?: string;
  pageStart?: number;
  pageEnd?: number;
  excerpt?: string;
  anchor?: string;
}

export interface BookStudyAidResult {
  action: string;
  title: string;
  contentMarkdown: string;
  structuredData?: any;
  citations: BookStudyCitation[];
}

export interface OutlineVersion {
  id: string;
  outlineId: string;
  versionNumber: number;
  title: string;
  contentMarkdown: string;
  changelog?: string;
  createdAt: string;
}

export interface Outline {
  id: string;
  userId: string;
  subjectId: string;
  subjectName?: string;
  materialId?: string;
  title: string;
  chapter?: string;
  contentMarkdown: string;
  keyPoints?: string[];
  formulas?: string[];
  isPinned?: boolean;
  versions?: OutlineVersion[];
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

export interface SubjectPerformanceInsight {
  subjectId: string;
  subjectName: string;
  color?: string;
  status: 'improving' | 'needs_attention' | 'insufficient_data';
  headline: string;
  explanation: string;
  avgScore: number | null;
  completionRate: number;
}

export interface QuizScoreProgressionPoint {
  attemptId: string;
  quizTitle: string;
  subjectName: string;
  score: number;
  maxScore: number;
  submittedAt: string;
}

export interface CommonMistakeItem {
  questionId?: string;
  topic: string;
  prompt: string;
  wrongCount: number;
  accuracyRate: number;
  explanation: string;
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
    totalCompletedSessions?: number;
    avgSessionMinutes?: number;
    streakDays: number;
    focusQualityScore: number;
  };
  dailyStudy: DailyStudyStat[];
  subjectBreakdown: SubjectReportStat[];
  topicMastery: TopicMasteryStat[];
  weakTopics: TopicMasteryStat[];
  strongTopics: TopicMasteryStat[];
  subjectInsights?: SubjectPerformanceInsight[];
  scoreProgression?: QuizScoreProgressionPoint[];
  commonMistakes?: CommonMistakeItem[];
  nextStudyPlan?: string[];
  comparison: PeriodComparison;
  recommendations: ReportRecommendation[];
  hasData: boolean;
}

export type StudyReport = ReportOverviewResponse;

