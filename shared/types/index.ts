// Shared TypeScript types for JAMI AI

export interface User {
  id: string;
  email: string;
  displayName: string;
  preferredName: string;
  locale: string;
  timezone: string;
  ageBand: string;
  status: 'active' | 'inactive';
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

export interface TimetableEntry {
  id: string;
  timetableId?: string;
  subjectId?: string;
  subjectName?: string;
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
  source?: string;
}

export interface AvailabilityRule {
  id: string;
  userId: string;
  dayOfWeek: number;
  startLocalTime: string;
  endLocalTime: string;
  type: 'available' | 'preferred' | 'blocked';
}

export interface ExamMilestone {
  name: string;
  date: string;
  status: 'completed' | 'in_progress' | 'pending';
}

export interface ExamTopic {
  id: string;
  name: string;
  weight: number;
  notes?: string;
}

export interface Exam {
  id: string;
  userId: string;
  subjectId: string;
  subjectName?: string;
  title: string;
  examAt: string; // ISO String
  importance: 'low' | 'medium' | 'high' | 'critical';
  scopeText: string;
  topics: ExamTopic[];
  milestones?: ExamMilestone[];
  status?: 'upcoming' | 'completed' | 'cancelled';
}

export interface ExecutionStep {
  id: string;
  order?: number;
  stepOrder?: number;
  title: string;
  minutes?: number;
  plannedMinutes?: number;
  instruction: string;
  expectedOutput: string;
  tips: string[];
  status: 'pending' | 'in_progress' | 'completed';
  actualMinutes?: number;
  startedAt?: string;
  completedAt?: string;
}

export interface PreparationChecklistItem {
  id?: string;
  item?: string;
  text?: string;
  completed?: boolean;
  checked?: boolean;
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
  mode: '25_5' | '45_10' | 'custom';
  plannedMinutes: number;
  actualMinutes?: number;
  durationMinutes?: number;
  state: 'ready' | 'running' | 'paused' | 'break' | 'completed' | 'abandoned';
  startedAt?: string;
  pausedAt?: string;
  endedAt?: string;
  pauseCount?: number;
  accumulatedPauseSeconds: number;
  targetEndTime?: string;
  notes?: string;
  outcome?: string;
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

export interface Material {
  id: string;
  userId: string;
  subjectId: string;
  subjectName?: string;
  title: string;
  type: 'pdf' | 'image' | 'notes';
  r2ObjectKey?: string;
  mimeType?: string;
  sizeBytes: number;
  processingStatus: 'ready' | 'processing' | 'error';
  summary?: string;
  createdAt: string;
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

export interface Notification {
  id: string;
  userId: string;
  type: 'upcoming_class' | 'upcoming_exam' | 'incomplete_task' | 'system';
  title: string;
  body: string;
  actionUrl?: string;
  scheduledFor?: string;
  deliveredAt?: string;
  readAt?: string;
  status: 'unread' | 'read';
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
  reason: string;
  tasksToSchedule: {
    taskId: string;
    title: string;
    subjectId: string;
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
}

export interface WeeklySubjectStat {
  subjectId: string;
  subjectName: string;
  color: string;
  plannedMinutes: number;
  actualMinutes: number;
  completionPercent: number;
}

export interface StudyReport {
  userId: string;
  weekStart: string;
  weekEnd: string;
  plannedHours: number;
  actualHours: number;
  completionRate: number;
  streakDays: number;
  onTimeRate: number;
  focusQualityScore: number;
  subjectBreakdown: WeeklySubjectStat[];
  weakTopics: string[];
  strongTopics: string[];
  aiRecommendations: string[];
}
