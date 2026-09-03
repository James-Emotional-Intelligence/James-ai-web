import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Bot,
  GraduationCap,
  Bell,
  RefreshCw,
  AlertCircle,
  Play,
  Flame,
  BookOpen,
  Shield,
  Target,
  ArrowUpRight,
  FastForward,
  Check,
  X,
  AlertTriangle,
  FileText,
  HelpCircle,
  MessageSquarePlus,
  Moon,
  BatteryCharging,
  Trash2,
  Edit2,
  Briefcase,
  RotateCcw,
  BookOpenCheck,
  PenLine,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api-client';
import {
  TodayDashboardOverview,
  StudyTask,
  MissedClassSession,
  TomorrowPreparationPlan,
  TomorrowPreparationItem,
  TomorrowPlanOverviewInfo,
  TomorrowPlanEnergyLevel,
  TodayLessonLogItem,
} from '../../../shared/types';
import { useAuth } from '../auth/AuthProvider';
import { useTheme } from '../../context/ThemeContext';
import { ModalPortal } from '../../components/common/ModalPortal';
import { HAI_BA_TRUNG_ASSETS } from '../../assets/themes/hai-ba-trung';
import { HaiBaTrungHero } from '../../components/themes/HaiBaTrungHero';
import { RobotJami } from '../../components/jami/RobotJami';
import confetti from 'canvas-confetti';

type TaskFilterType = 'all' | 'pending' | 'in_progress' | 'completed' | 'overdue';

function buildFocusUrl(options: {
  duration?: number;
  taskId?: string;
  planId?: string;
  planItemId?: string;
  title?: string;
  subjectId?: string;
  subject?: string;
  returnTo?: string;
}): string {
  const params = new URLSearchParams();
  if (options.duration) params.set('duration', String(options.duration));
  if (options.taskId && options.taskId.trim()) params.set('taskId', options.taskId.trim());
  if (options.planId && options.planId.trim()) params.set('planId', options.planId.trim());
  if (options.planItemId && options.planItemId.trim()) params.set('planItemId', options.planItemId.trim());
  if (options.title && options.title.trim()) params.set('title', options.title.trim());
  if (options.subjectId && options.subjectId.trim()) params.set('subjectId', options.subjectId.trim());
  if (options.subject && options.subject.trim()) params.set('subject', options.subject.trim());
  params.set('returnTo', options.returnTo || '/today');
  return `/focus?${params.toString()}`;
}

export const TodayDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme } = useTheme();

  const [overview, setOverview] = useState<TodayDashboardOverview | null>(null);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [isStoryModalOpen, setIsStoryModalOpen] = useState(false);
  const [taskFilter, setTaskFilter] = useState<TaskFilterType>('all');

  // Today Lesson Logs & Homework ("Ghi lại bài học & BTVN hôm nay") States
  const [todayLessonLogs, setTodayLessonLogs] = useState<TodayLessonLogItem[]>([]);
  const [activeLessonForms, setActiveLessonForms] = useState<Record<string, {
    learnedContent: string;
    homework: string;
    hasNoHomework: boolean;
    homeworkDueOption: string;
    homeworkEstimatedMinutes: number;
    attendanceStatus: 'attended' | 'absent';
    isSaving: boolean;
    savedStatus: string | null;
  }>>({});

  // Tomorrow Preparation Plan ("Jami chuẩn bị ngày mai") States
  const [tomorrowPlanOverview, setTomorrowPlanOverview] = useState<TomorrowPlanOverviewInfo | null>(null);
  const [tomorrowPlan, setTomorrowPlan] = useState<TomorrowPreparationPlan | null>(null);
  const [isTomorrowPlanBannerDismissed, setIsTomorrowPlanBannerDismissed] = useState<boolean>(() => {
    return sessionStorage.getItem('jami_tomorrow_plan_dismissed') === 'true';
  });
  const [isTomorrowPlanModalOpen, setIsTomorrowPlanModalOpen] = useState(false);
  const [tomorrowPlanModalStep, setTomorrowPlanModalStep] = useState<'energy' | 'plan'>('energy');
  const [selectedEnergyLevel, setSelectedEnergyLevel] = useState<TomorrowPlanEnergyLevel>('normal');
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isAcceptingPlan, setIsAcceptingPlan] = useState(false);

  // Offline Missed Sessions Check-in States
  const [missedSessions, setMissedSessions] = useState<MissedClassSession[]>([]);
  const [isBannerDismissed, setIsBannerDismissed] = useState<boolean>(() => {
    return sessionStorage.getItem('jami_offline_dismissed') === 'true';
  });
  const [isCheckinModalOpen, setIsCheckinModalOpen] = useState(false);
  const [checkinStepIndex, setCheckinStepIndex] = useState(0);
  const [isSubmittingCheckin, setIsSubmittingCheckin] = useState(false);
  const [checkinForm, setCheckinForm] = useState<{
    learnedContent: string;
    homework: string;
    reflection: string;
    understandingLevel: 'very_easy' | 'normal' | 'hard' | 'not_understood';
    attendanceStatus: 'attended' | 'absent';
    createTaskForHomework: boolean;
  }>({
    learnedContent: '',
    homework: '',
    reflection: '',
    understandingLevel: 'normal',
    attendanceStatus: 'attended',
    createTaskForHomework: true,
  });

  // Postpone task modal state
  const [postponeModalTask, setPostponeModalTask] = useState<StudyTask | null>(null);
  const [postponeOption, setPostponeOption] = useState<'30m' | '60m' | 'tonight' | 'tomorrow' | 'custom'>('30m');
  const [customPostponeTime, setCustomPostponeTime] = useState<string>('');
  const [isPostponing, setIsPostponing] = useState<boolean>(false);

  // Scroll position keeper on page navigation
  useEffect(() => {
    const savedY = sessionStorage.getItem('jami_today_scroll_y');
    if (savedY) {
      const y = parseInt(savedY, 10);
      if (!isNaN(y) && y > 0) {
        window.scrollTo({ top: y, behavior: 'instant' });
      }
      sessionStorage.removeItem('jami_today_scroll_y');
    }
  }, []);

  const navigateToFocus = (url: string) => {
    sessionStorage.setItem('jami_today_scroll_y', String(window.scrollY));
    navigate(url);
  };

  const fetchDashboardData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    setError(null);
    try {
      const [overviewData, tasksData, missedData, planOverviewData, currentPlanData, todayClassesData] = await Promise.all([
        api.getDashboardOverview(),
        api.getTasks(),
        api.getMissedClassSessions().catch(() => ({ missedSessions: [] })),
        api.getTomorrowPlanOverview().catch(() => null),
        api.getTomorrowPlanCurrent().catch(() => ({ plan: null })),
        api.getTodayLessonLogs().catch(() => ({ classes: [] })),
      ]);
      setOverview(overviewData);
      setTasks(tasksData.tasks || []);
      setMissedSessions(missedData.missedSessions || []);
      setTomorrowPlanOverview(planOverviewData);
      setTomorrowPlan(currentPlanData.plan || null);

      const classes: TodayLessonLogItem[] = (todayClassesData as any).classes || [];
      setTodayLessonLogs(classes);

      // Initialize forms for classes if not already edited by user
      setActiveLessonForms((prev) => {
        const next = { ...prev };
        for (const cls of classes) {
          if (!next[cls.id]) {
            next[cls.id] = {
              learnedContent: cls.learnedContent || '',
              homework: cls.homework || '',
              hasNoHomework: cls.hasNoHomework || (cls.checkinId ? !cls.homework : false),
              homeworkDueOption: 'tomorrow',
              homeworkEstimatedMinutes: cls.homeworkEstimatedMinutes || 30,
              attendanceStatus: cls.attendanceStatus === 'absent' ? 'absent' : 'attended',
              isSaving: false,
              savedStatus: cls.savedAt ? `Đã lưu lúc ${new Date(cls.savedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : null,
            };
          }
        }
        return next;
      });
    } catch (err: any) {
      setError(err.message || 'Không thể tải dữ liệu học tập hôm nay.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSaveLessonLog = async (item: TodayLessonLogItem, createTask: boolean) => {
    const form = activeLessonForms[item.id];
    if (!form) return;

    if (createTask && !form.hasNoHomework && (!form.homework || !form.homework.trim())) {
      alert('Vui lòng nhập nội dung bài tập về nhà trước khi tạo nhiệm vụ.');
      return;
    }

    setActiveLessonForms((prev) => ({
      ...prev,
      [item.id]: { ...prev[item.id], isSaving: true },
    }));

    try {
      const occurrenceDate = overview?.todayDateFormatted
        ? overview.todayDateFormatted
        : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

      // Calculate dueAt date
      let dueAt: string | undefined = undefined;
      const now = new Date();
      if (form.homeworkDueOption === 'tonight') {
        const tonight = new Date(now);
        tonight.setHours(21, 0, 0, 0);
        dueAt = tonight.toISOString();
      } else if (form.homeworkDueOption === 'tomorrow') {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(8, 0, 0, 0);
        dueAt = tomorrow.toISOString();
      } else if (form.homeworkDueOption === '2days') {
        const d2 = new Date(now);
        d2.setDate(d2.getDate() + 2);
        d2.setHours(8, 0, 0, 0);
        dueAt = d2.toISOString();
      } else if (form.homeworkDueOption === '1week') {
        const d7 = new Date(now);
        d7.setDate(d7.getDate() + 7);
        d7.setHours(8, 0, 0, 0);
        dueAt = d7.toISOString();
      }

      await api.submitSessionCheckin({
        timetableEntryId: item.timetableEntryId,
        timetableEntryIds: item.timetableEntryIds,
        occurrenceDate,
        learnedContent: form.learnedContent.trim() || undefined,
        homework: form.hasNoHomework ? undefined : form.homework.trim() || undefined,
        hasNoHomework: form.hasNoHomework,
        attendanceStatus: form.attendanceStatus,
        createTaskForHomework: createTask && !form.hasNoHomework && Boolean(form.homework.trim()),
        dueAt,
        estimatedMinutes: form.homeworkEstimatedMinutes,
        taskId: item.linkedTaskId,
      });

      confetti({ particleCount: 40, spread: 50 });

      const nowTimeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      setActiveLessonForms((prev) => ({
        ...prev,
        [item.id]: {
          ...prev[item.id],
          isSaving: false,
          savedStatus: `Đã lưu lúc ${nowTimeStr}${createTask ? ' (Đã tạo nhiệm vụ)' : ''}`,
        },
      }));

      // Background silent refetch so no scroll jump!
      await fetchDashboardData(true);
    } catch (err: any) {
      alert(err.message || 'Không thể lưu nhật ký bài học.');
      setActiveLessonForms((prev) => ({
        ...prev,
        [item.id]: { ...prev[item.id], isSaving: false },
      }));
    }
  };

  // Tomorrow Plan Handlers
  const handleOpenTomorrowPlanModal = () => {
    if (tomorrowPlan && tomorrowPlan.items && tomorrowPlan.items.length > 0) {
      setTomorrowPlanModalStep('plan');
    } else {
      setTomorrowPlanModalStep('energy');
    }
    setIsTomorrowPlanModalOpen(true);
  };

  const handleSelectEnergyAndGenerate = async (energy: TomorrowPlanEnergyLevel) => {
    setSelectedEnergyLevel(energy);
    if (energy === 'skip') {
      setIsGeneratingPlan(true);
      try {
        await api.generateTomorrowPlan({ energyLevel: 'skip' });
        setIsTomorrowPlanBannerDismissed(true);
        sessionStorage.setItem('jami_tomorrow_plan_dismissed', 'true');
        setIsTomorrowPlanModalOpen(false);
        await fetchDashboardData();
      } catch (err: any) {
        alert(err.message || 'Không thể cập nhật tùy chọn');
      } finally {
        setIsGeneratingPlan(false);
      }
      return;
    }

    setIsGeneratingPlan(true);
    try {
      const res = await api.generateTomorrowPlan({ energyLevel: energy });
      setTomorrowPlan(res.plan);
      setTomorrowPlanModalStep('plan');
    } catch (err: any) {
      alert(err.message || 'Không thể tạo kế hoạch chuẩn bị ngày mai');
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleAcceptTomorrowPlan = async () => {
    if (!tomorrowPlan) return;
    setIsAcceptingPlan(true);
    try {
      const res = await api.acceptTomorrowPlan(tomorrowPlan.id);
      setTomorrowPlan(res.plan);
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
      setIsTomorrowPlanModalOpen(false);
      await fetchDashboardData();
    } catch (err: any) {
      alert(err.message || 'Không thể chấp nhận kế hoạch');
    } finally {
      setIsAcceptingPlan(false);
    }
  };

  const handleDismissTomorrowPlan = async (permanent = false) => {
    setIsTomorrowPlanBannerDismissed(true);
    sessionStorage.setItem('jami_tomorrow_plan_dismissed', 'true');
    if (tomorrowPlan && permanent) {
      await api.dismissTomorrowPlan(tomorrowPlan.id).catch(() => {});
    }
    setIsTomorrowPlanModalOpen(false);
    await fetchDashboardData();
  };

  const handleDeletePlanItem = async (itemId: string) => {
    if (!tomorrowPlan) return;
    try {
      await api.deleteTomorrowPlanItem(tomorrowPlan.id, itemId);
      setTomorrowPlan((prev) => {
        if (!prev) return null;
        const newItems = prev.items.filter((i) => i.id !== itemId);
        return {
          ...prev,
          items: newItems,
          totalMinutes: newItems.reduce((acc, i) => acc + i.plannedMinutes, 0),
        };
      });
      await fetchDashboardData();
    } catch (err: any) {
      alert(err.message || 'Không thể xóa mục này');
    }
  };

  const handleCompletePlanItem = async (itemId: string) => {
    if (!tomorrowPlan) return;
    try {
      const res = await api.completeTomorrowPlanItem(tomorrowPlan.id, itemId);
      setTomorrowPlan((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          items: prev.items.map((i) => (i.id === itemId ? res.item : i)),
        };
      });
      confetti({ particleCount: 50, spread: 50 });
      await fetchDashboardData();
    } catch (err: any) {
      alert(err.message || 'Không thể đánh dấu hoàn thành');
    }
  };

  const handleRegenerateTomorrowPlan = async () => {
    setIsGeneratingPlan(true);
    try {
      const res = await api.generateTomorrowPlan({ energyLevel: selectedEnergyLevel });
      setTomorrowPlan(res.plan);
    } catch (err: any) {
      alert(err.message || 'Không thể tạo lại kế hoạch');
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleCompleteTask = async (taskId: string) => {
    setCompletingTaskId(taskId);
    try {
      await api.completeTask(taskId);
      confetti({ particleCount: 70, spread: 60 });
      await fetchDashboardData();
    } catch (err: any) {
      alert(err.message || 'Không thể đánh dấu hoàn thành nhiệm vụ.');
    } finally {
      setCompletingTaskId(null);
    }
  };

  const handleConfirmPostpone = async () => {
    if (!postponeModalTask) return;
    setIsPostponing(true);
    try {
      const now = new Date();
      let postponeMinutes: number | undefined = undefined;
      let newScheduledStartAt: string | undefined = undefined;

      if (postponeOption === '30m') {
        postponeMinutes = 30;
      } else if (postponeOption === '60m') {
        postponeMinutes = 60;
      } else if (postponeOption === 'tonight') {
        const tonight = new Date(now);
        tonight.setHours(19, 30, 0, 0);
        if (tonight.getTime() <= now.getTime()) {
          tonight.setDate(tonight.getDate() + 1);
        }
        newScheduledStartAt = tonight.toISOString();
      } else if (postponeOption === 'tomorrow') {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(8, 0, 0, 0);
        newScheduledStartAt = tomorrow.toISOString();
      } else if (postponeOption === 'custom' && customPostponeTime) {
        newScheduledStartAt = new Date(customPostponeTime).toISOString();
      }

      await api.postponeTask(postponeModalTask.id, postponeMinutes, newScheduledStartAt);
      setPostponeModalTask(null);
      await fetchDashboardData();
    } catch (err: any) {
      alert(err.message || 'Không thể hoãn nhiệm vụ.');
    } finally {
      setIsPostponing(false);
    }
  };

  // Offline Missed Sessions Handlers
  const handleStartCheckin = () => {
    setCheckinStepIndex(0);
    setCheckinForm({
      learnedContent: '',
      homework: '',
      reflection: '',
      understandingLevel: 'normal',
      attendanceStatus: 'attended',
      createTaskForHomework: true,
    });
    setIsCheckinModalOpen(true);
  };

  const handleDismissBanner = (persist = false) => {
    setIsBannerDismissed(true);
    if (persist) {
      sessionStorage.setItem('jami_offline_dismissed', 'true');
    }
  };

  const handleSaveCheckinStep = async () => {
    const currentSession = missedSessions[checkinStepIndex];
    if (!currentSession) return;

    setIsSubmittingCheckin(true);
    try {
      await api.submitSessionCheckin({
        timetableEntryId: currentSession.timetableEntryId,
        occurrenceDate: currentSession.occurrenceDate,
        learnedContent: checkinForm.learnedContent.trim() || undefined,
        homework: checkinForm.homework.trim() || undefined,
        reflection: checkinForm.reflection.trim() || undefined,
        understandingLevel: checkinForm.understandingLevel || undefined,
        attendanceStatus: checkinForm.attendanceStatus,
        createTaskForHomework: checkinForm.createTaskForHomework,
      });

      if (checkinStepIndex < missedSessions.length - 1) {
        setCheckinStepIndex((prev) => prev + 1);
        setCheckinForm({
          learnedContent: '',
          homework: '',
          reflection: '',
          understandingLevel: 'normal',
          attendanceStatus: 'attended',
          createTaskForHomework: true,
        });
      } else {
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
        setIsCheckinModalOpen(false);
        setMissedSessions([]);
        await fetchDashboardData();
      }
    } catch (err: any) {
      alert(err.message || 'Không thể lưu thông tin cập nhật buổi học.');
    } finally {
      setIsSubmittingCheckin(false);
    }
  };

  const getGreeting = (name: string) => {
    try {
      const vnFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: 'numeric',
        hour12: false,
      });
      const hour = parseInt(vnFormatter.format(new Date()), 10);
      if (hour < 12) return `Chào buổi sáng, ${name}! Sẵn sàng cho một ngày học tập hiệu quả nhé.`;
      if (hour < 18) return `Chào buổi chiều, ${name}! Hãy duy trì sự tập trung nào.`;
      return `Chào buổi tối, ${name}! Hoàn thành nốt các mục tiêu hôm nay nhé.`;
    } catch {
      const hour = new Date().getHours();
      if (hour < 12) return `Chào buổi sáng, ${name}! Sẵn sàng cho một ngày học tập hiệu quả nhé.`;
      if (hour < 18) return `Chào buổi chiều, ${name}! Hãy duy trì sự tập trung nào.`;
      return `Chào buổi tối, ${name}! Hoàn thành nốt các mục tiêu hôm nay nhé.`;
    }
  };

  const todayDateStr = useMemo(() => {
    if (overview?.todayDateFormatted) return overview.todayDateFormatted;
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  }, [overview?.todayDateFormatted]);

  const nowTime = new Date().getTime();

  // Filter tasks for today or overdue using user timezone date conversion
  const rawTodayTasks = useMemo(() => {
    const isDateMatchingLocalDay = (isoDateStr?: string) => {
      if (!isoDateStr) return false;
      try {
        const d = new Date(isoDateStr);
        if (isNaN(d.getTime())) return isoDateStr.startsWith(todayDateStr);
        const localStr = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Ho_Chi_Minh',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(d);
        return localStr === todayDateStr;
      } catch {
        return isoDateStr.startsWith(todayDateStr);
      }
    };

    return tasks.filter((t) => {
      const isScheduledToday = isDateMatchingLocalDay(t.scheduledStartAt);
      const isDueToday = isDateMatchingLocalDay(t.dueAt);
      return isScheduledToday || isDueToday;
    });
  }, [tasks, todayDateStr]);

  // Priority next task
  const nextPriorityTask = useMemo(() => {
    const incomplete = rawTodayTasks.filter((t) => t.status !== 'completed');
    if (incomplete.length === 0) return null;
    const highPri = incomplete.find((t) => t.priority === 'high');
    if (highPri) return highPri;
    const medPri = incomplete.find((t) => t.priority === 'medium');
    if (medPri) return medPri;
    return incomplete[0];
  }, [rawTodayTasks]);

  // Filtered and sorted tasks
  const filteredSortedTasks = useMemo(() => {
    let list = [...rawTodayTasks];

    if (taskFilter === 'pending') {
      list = list.filter((t) => t.status === 'pending');
    } else if (taskFilter === 'in_progress') {
      list = list.filter((t) => t.status === 'in_progress');
    } else if (taskFilter === 'completed') {
      list = list.filter((t) => t.status === 'completed');
    } else if (taskFilter === 'overdue') {
      list = list.filter((t) => {
        if (t.status === 'completed') return false;
        if (!t.dueAt) return false;
        return new Date(t.dueAt).getTime() < nowTime;
      });
    }

    // Sort by scheduledStartAt ascending, then dueAt, then priority
    list.sort((a, b) => {
      if (a.scheduledStartAt && b.scheduledStartAt) {
        return a.scheduledStartAt.localeCompare(b.scheduledStartAt);
      }
      if (a.scheduledStartAt) return -1;
      if (b.scheduledStartAt) return 1;

      if (a.dueAt && b.dueAt) {
        return a.dueAt.localeCompare(b.dueAt);
      }
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;

      const priOrder: Record<string, number> = { high: 1, medium: 2, low: 3 };
      return (priOrder[a.priority || 'medium'] || 2) - (priOrder[b.priority || 'medium'] || 2);
    });

    return list;
  }, [rawTodayTasks, taskFilter, nowTime]);

  const taskCounts = useMemo(() => {
    return {
      all: rawTodayTasks.length,
      pending: rawTodayTasks.filter((t) => t.status === 'pending').length,
      in_progress: rawTodayTasks.filter((t) => t.status === 'in_progress').length,
      completed: rawTodayTasks.filter((t) => t.status === 'completed').length,
      overdue: rawTodayTasks.filter((t) => t.status !== 'completed' && t.dueAt && new Date(t.dueAt).getTime() < nowTime).length,
    };
  }, [rawTodayTasks, nowTime]);

  if (isLoading && !overview) {
    return (
      <div className="space-y-6">
        <div className="h-48 rounded-3xl bg-[#0B120D] border border-[rgba(34,197,94,0.2)] animate-pulse flex items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-[#A9B8AE]">
            <RefreshCw className="w-4 h-4 animate-spin text-[#22C55E]" />
            <span>Đang tải kế hoạch học tập hôm nay...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="p-6 bg-rose-950/40 border border-rose-800 rounded-3xl text-rose-300 text-xs flex flex-col items-center justify-center space-y-3 text-center">
        <AlertCircle className="w-8 h-8 text-rose-400" />
        <p className="font-bold">{error || 'Không thể kết nối đến máy chủ.'}</p>
        <button
          onClick={() => fetchDashboardData()}
          className="px-4 py-2 bg-rose-900 text-white font-bold rounded-xl cursor-pointer hover:bg-rose-800"
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin Privilege Control Banner */}
      {user?.role === 'admin' && (
        <div className="bg-gradient-to-r from-purple-950/80 via-indigo-950/80 to-purple-900/70 border-2 border-purple-500/50 p-5 sm:p-6 rounded-3xl shadow-xl shadow-purple-950/40 relative overflow-hidden backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="p-3 bg-purple-500/20 text-purple-300 border border-purple-500/40 rounded-2xl shrink-0">
                <Shield className="w-7 h-7 text-purple-400" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-900/60 text-purple-300 border border-purple-400/40 text-[10px] font-black uppercase tracking-wider mb-1">
                  👑 QUYỀN QUẢN TRỊ VIÊN TỐI CAO (ADMIN)
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-white">
                  Bảng Điều Khiển Quản Trị Hệ Thống JAMI AI
                </h2>
                <p className="text-xs text-purple-200/80 mt-0.5">
                  Bạn có toàn quyền quản lý danh sách học sinh, khóa/mở khóa tài khoản (Ban/Unban) và xóa tài khoản vi phạm.
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white text-xs font-black shadow-lg shadow-purple-600/30 transition-all cursor-pointer shrink-0 border border-purple-300"
            >
              <Shield className="w-4 h-4" />
              <span>Mở Bảng Quản Lý Người Dùng & Ban TK →</span>
            </button>
          </div>
        </div>
      )}

      {/* Top Welcome Banner / Hai Ba Trung Hero Banner */}
      {theme === 'hai-ba-trung' ? (
        <HaiBaTrungHero
          studentName={overview.studentName}
          greetingMessage={getGreeting(overview.studentName)}
          todayDateFormatted={`Học tập hôm nay • ${todayDateStr}`}
          onOpenStoryModal={() => setIsStoryModalOpen(true)}
          onScrollToLessonLogs={() => {
            const el = document.getElementById('today-lesson-logs-card');
            if (el) {
              el.scrollIntoView({ behavior: 'smooth' });
            }
          }}
        />
      ) : (
        <div className="bg-[#0B120D] p-6 sm:p-8 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-radial from-[#22C55E]/10 to-transparent blur-2xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-[11px] font-bold text-[#86EFAC]">
                <Calendar className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>Học tập hôm nay • {todayDateStr}</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-[#F3FAF5]">
                {getGreeting(overview.studentName)}
              </h1>
              <p className="text-xs text-[#A9B8AE]">
                {user?.role === 'admin'
                  ? 'Tài khoản Quản trị viên (Admin) • Giám sát và đồng hành cùng toàn bộ hệ thống JAMI AI.'
                  : `Lớp ${overview.gradeLevel} • Jami đồng hành tối ưu hóa thời gian tự học của em.`}
              </p>
            </div>

            {/* Quick Actions in Banner */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('today-lesson-logs-card');
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#101A13] hover:bg-[#142319] text-[#86EFAC] hover:text-[#F3FAF5] text-xs font-bold border border-[rgba(34,197,94,0.3)] shadow-md transition-all cursor-pointer shrink-0"
              >
                <PenLine className="w-4 h-4 text-[#22C55E]" />
                <span>Nhập bài học & BTVN</span>
              </button>

              <button
                onClick={() => navigateToFocus(buildFocusUrl({ returnTo: '/today' }))}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black shadow-lg shadow-[#16A34A]/25 transition-all cursor-pointer shrink-0 jami-btn-glow"
              >
                <Play className="w-4 h-4 fill-[#050806]" />
                <span>Hẹn giờ tập trung</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Jami Offline Catch-up Banner */}
      {missedSessions.length > 0 && !isBannerDismissed && (
        <div className="bg-gradient-to-r from-[#0D1F14] via-[#10291B] to-[#0A1A10] border-2 border-[#22C55E]/40 p-5 sm:p-6 rounded-3xl shadow-2xl relative overflow-hidden transition-all">
          <div className="absolute top-0 right-0 w-64 h-64 bg-radial from-[#22C55E]/15 to-transparent blur-2xl pointer-events-none" />
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#050806] border border-[#22C55E]/40 flex items-center justify-center shrink-0 shadow-inner">
                <RobotJami state="speaking" size="sm" showBubble={false} />
              </div>
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#14532D]/80 text-[#86EFAC] border border-[#22C55E]/40 text-[10px] font-black uppercase tracking-wider">
                  <Sparkles className="w-3 h-3 text-[#22C55E]" />
                  <span>Jami Trợ Lý Nhắc Nhở</span>
                </div>
                <h2 className="text-sm sm:text-base font-bold text-[#F3FAF5]">
                  Trong lúc bạn không online, bạn có <span className="text-[#86EFAC] font-black">{missedSessions.length} tiết học</span> đã kết thúc.
                </h2>
                <p className="text-xs text-[#A9B8AE]">
                  Hãy cập nhật nhanh để Jami hỗ trợ bạn tốt hơn nhé!
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                onClick={() => handleDismissBanner(true)}
                className="px-3 py-2 rounded-xl text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#050806]/50 cursor-pointer transition-colors"
              >
                Bỏ qua
              </button>
              <button
                type="button"
                onClick={() => handleDismissBanner(false)}
                className="px-3.5 py-2 rounded-xl bg-[#101A13] hover:bg-[#142319] text-[#A9B8AE] hover:text-[#F3FAF5] text-xs font-bold border border-[rgba(34,197,94,0.2)] cursor-pointer transition-all"
              >
                Nhắc tôi sau
              </button>
              <button
                type="button"
                onClick={handleStartCheckin}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black rounded-xl shadow-lg shadow-[#16A34A]/25 cursor-pointer transition-all jami-btn-glow"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                <span>Cập nhật ngay ({missedSessions.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Jami Tomorrow Preparation Plan Banner ("Jami chuẩn bị ngày mai") */}
      {tomorrowPlanOverview?.bannerMessage && !isTomorrowPlanBannerDismissed && (
        <div className="bg-gradient-to-r from-[#0C1A1D] via-[#0E2824] to-[#0A1A10] border-2 border-[#10B981]/40 p-5 sm:p-6 rounded-3xl shadow-2xl relative overflow-hidden transition-all">
          <div className="absolute top-0 right-0 w-64 h-64 bg-radial from-[#10B981]/15 to-transparent blur-2xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#050806] border border-[#10B981]/40 flex items-center justify-center shrink-0 shadow-inner">
                <RobotJami state="thinking" size="sm" showBubble={false} />
              </div>
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#064E3B]/80 text-[#6EE7B7] border border-[#10B981]/40 text-[10px] font-black uppercase tracking-wider">
                  <Moon className="w-3 h-3 text-[#10B981]" />
                  <span>Jami Chuẩn Bị Ngày Mai</span>
                </div>
                <h2 className="text-sm sm:text-base font-bold text-[#F3FAF5]">
                  {tomorrowPlanOverview.bannerMessage}
                </h2>
                <p className="text-xs text-[#A9B8AE]">
                  Dành 20–45 phút tối nay để làm bài tập, xem trước bài và chuẩn bị sách vở ngày mai.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                onClick={() => handleDismissTomorrowPlan(true)}
                className="px-3 py-2 rounded-xl text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#050806]/50 cursor-pointer transition-colors"
              >
                Không nhắc hôm nay
              </button>
              <button
                type="button"
                onClick={() => handleDismissTomorrowPlan(false)}
                className="px-3.5 py-2 rounded-xl bg-[#101A13] hover:bg-[#142319] text-[#A9B8AE] hover:text-[#F3FAF5] text-xs font-bold border border-[rgba(34,197,94,0.2)] cursor-pointer transition-all"
              >
                Tối nay tôi bận
              </button>
              <button
                type="button"
                onClick={() => handleDismissTomorrowPlan(false)}
                className="px-3.5 py-2 rounded-xl bg-[#101A13] hover:bg-[#142319] text-[#A9B8AE] hover:text-[#F3FAF5] text-xs font-bold border border-[rgba(34,197,94,0.2)] cursor-pointer transition-all"
              >
                Nhắc tôi sau
              </button>
              <button
                type="button"
                onClick={handleOpenTomorrowPlanModal}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#10B981] to-[#059669] hover:from-[#34D399] hover:to-[#10B981] text-[#050806] text-xs font-black rounded-xl shadow-lg shadow-[#10B981]/25 cursor-pointer transition-all jami-btn-glow"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Xem kế hoạch</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4 Stats Highlights Cards (2.3 Theo dõi tiến độ) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 jami-card-grid">
        {/* Actual Focus Today & Comparison vs Yesterday */}
        <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-md space-y-2 jami-card-interactive">
          <div className="flex items-center justify-between text-[#A9B8AE]">
            <span className="text-xs font-bold">Thời gian tập trung</span>
            <Clock className="w-4 h-4 text-[#22C55E]" />
          </div>
          <div className="text-2xl font-black text-[#F3FAF5]">
            {overview.todayStudy.actualFocusMinutes}{' '}
            <span className="text-xs font-normal text-[#86EFAC]">phút</span>
          </div>
          <div className="text-[11px] font-semibold text-[#86EFAC] flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-[#22C55E]" />
            <span>{overview.todayStudy.yesterdayComparisonLabel || `Mục tiêu: ${overview.todayStudy.dailyGoalMinutes || 120} phút`}</span>
          </div>
        </div>

        {/* Task Completion Rate & Daily Goal */}
        <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-md space-y-2 jami-card-interactive">
          <div className="flex items-center justify-between text-[#A9B8AE]">
            <span className="text-xs font-bold">Nhiệm vụ hoàn thành</span>
            <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
          </div>
          <div className="text-2xl font-black text-[#F3FAF5]">
            {overview.todayStudy.completedTasksCount || 0} / {overview.todayStudy.totalTasksCount || taskCounts.all}{' '}
            <span className="text-xs font-normal text-[#86EFAC]">({overview.todayStudy.completedPercent}%)</span>
          </div>
          <div className="w-full bg-[#101A13] h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-[#22C55E] h-full rounded-full transition-all duration-500"
              style={{ width: `${overview.todayStudy.completedPercent}%` }}
            />
          </div>
        </div>

        {/* Real Streak Days */}
        <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-md space-y-2 jami-card-interactive">
          <div className="flex items-center justify-between text-[#A9B8AE]">
            <span className="text-xs font-bold">Chuỗi học liên tục</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-[#F3FAF5]">
            {overview.todayStudy.streakDays}{' '}
            <span className="text-xs font-normal text-amber-400">ngày</span>
          </div>
          <div className="text-[11px] text-[#A9B8AE]">
            {overview.todayStudy.streakDays > 0 ? 'Duy trì rất tốt!' : 'Học hôm nay để bắt đầu chuỗi!'}
          </div>
        </div>

        {/* 7-Day Focus Comparison */}
        <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-md space-y-2 jami-card-interactive">
          <div className="flex items-center justify-between text-[#A9B8AE]">
            <span className="text-xs font-bold">Tổng 7 ngày</span>
            <TrendingUp className="w-4 h-4 text-[#22C55E]" />
          </div>
          <div className="text-2xl font-black text-[#F3FAF5]">
            {Math.round((overview.reports.totalFocusMinutes7Days / 60) * 10) / 10}{' '}
            <span className="text-xs font-normal text-[#86EFAC]">giờ</span>
          </div>
          <div className="text-[11px] text-[#86EFAC] truncate">
            {overview.reports.trendLabel}
          </div>
        </div>
      </div>

      {/* Main Grid: Left 2 cols (Schedule + Tasks), Right 1 col (Jami + Exams + Material) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols */}
        <div className="lg:col-span-2 space-y-6">
          {/* 1. Today's Timetable / Classes (Lịch học & Sự kiện hôm nay) */}
          <div className="bg-[#0B120D] p-5 sm:p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#22C55E]" />
                <h2 className="text-sm sm:text-base font-bold text-[#F3FAF5]">
                  Lịch học & Sự kiện hôm nay ({overview.timetable.todaySessionsCount})
                </h2>
              </div>
              <button
                onClick={() => navigate('/timetable')}
                className="text-xs font-bold text-[#86EFAC] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Xem TKB tuần</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {overview.timetable.todaySessions.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {overview.timetable.todaySessions.map((s, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-xs sm:text-sm text-[#F3FAF5]">{s.title}</div>
                      <div className="text-[11px] text-[#A9B8AE] mt-0.5">{s.subject}</div>
                    </div>
                    <span className="px-2.5 py-1 rounded-xl bg-[#050806] border border-[rgba(34,197,94,0.2)] text-[#86EFAC] text-xs font-bold">
                      {s.time}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-[#A9B8AE]">
                Hôm nay không có lịch học cố định nào trên thời khóa biểu.
              </div>
            )}
          </div>

          {/* 2. Ghi lại bài học & BTVN hôm nay */}
          <div id="today-lesson-logs-card" className="bg-[#0B120D] p-5 sm:p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl space-y-5 scroll-mt-24">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)] gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#14532D] border border-[#22C55E]/40 flex items-center justify-center text-[#86EFAC]">
                  <BookOpenCheck className="w-4 h-4 text-[#22C55E]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-bold text-[#F3FAF5]">
                      Ghi lại bài học & BTVN hôm nay
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#102A1A] text-[#86EFAC] border border-[#22C55E]/30">
                      {todayLessonLogs.length} môn học
                    </span>
                  </div>
                  <p className="text-xs text-[#A9B8AE]">
                    Ghi lại kiến thức đã học và bài tập về nhà theo từng môn để Jami nhắc nhở và tối ưu kế hoạch ôn tập.
                  </p>
                </div>
              </div>
            </div>

            {todayLessonLogs.length > 0 ? (
              <div className="space-y-4">
                {todayLessonLogs.map((cls) => {
                  const form = activeLessonForms[cls.id] || {
                    learnedContent: cls.learnedContent || '',
                    homework: cls.homework || '',
                    hasNoHomework: cls.hasNoHomework || (cls.checkinId ? !cls.homework : false),
                    homeworkDueOption: 'tomorrow',
                    homeworkEstimatedMinutes: cls.homeworkEstimatedMinutes || 30,
                    attendanceStatus: cls.attendanceStatus === 'absent' ? 'absent' : 'attended',
                    isSaving: false,
                    savedStatus: cls.savedAt ? `Đã lưu lúc ${new Date(cls.savedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : null,
                  };

                  const isAbsent = form.attendanceStatus === 'absent' || cls.isSkipped;

                  return (
                    <div
                      key={cls.id}
                      className="p-4 sm:p-5 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] space-y-3.5 transition-all"
                    >
                      {/* Subject Row Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-[rgba(34,197,94,0.12)]">
                        <div className="flex items-center gap-2.5">
                          <span className="px-2.5 py-1 rounded-xl bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30 text-xs font-black">
                            {cls.subjectName}
                          </span>
                          <span className="text-xs font-bold text-[#F3FAF5]">
                            {cls.periodLabel}
                          </span>
                          <span className="text-xs text-[#A9B8AE]">
                            ({cls.startTime} – {cls.endTime})
                          </span>
                          {cls.room && (
                            <span className="text-[11px] text-[#A9B8AE]/80">
                              • {cls.room}
                            </span>
                          )}
                        </div>

                        {/* Attendance / Skip Status Toggle */}
                        <div className="flex items-center gap-1.5 self-end sm:self-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveLessonForms((prev) => ({
                                ...prev,
                                [cls.id]: { ...prev[cls.id], attendanceStatus: 'attended' },
                              }));
                            }}
                            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              !isAbsent
                                ? 'bg-[#16A34A] text-[#050806] shadow-sm'
                                : 'bg-[#050806] text-[#A9B8AE] hover:text-[#F3FAF5]'
                            }`}
                          >
                            ✓ Đi học
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveLessonForms((prev) => ({
                                ...prev,
                                [cls.id]: { ...prev[cls.id], attendanceStatus: 'absent' },
                              }));
                            }}
                            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              isAbsent
                                ? 'bg-amber-600 text-[#050806] shadow-sm'
                                : 'bg-[#050806] text-[#A9B8AE] hover:text-[#F3FAF5]'
                            }`}
                          >
                            {cls.isSkipped ? `Nghỉ (${cls.skipReason || 'Nghỉ tuần này'})` : 'Nghỉ tiết'}
                          </button>
                        </div>
                      </div>

                      {/* Content Section */}
                      {isAbsent ? (
                        <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 text-xs text-amber-200 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>
                            Tiết học này được ghi nhận nghỉ. Bạn không cần khai báo bài tập về nhà.
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* 1) Hôm nay học gì? */}
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-[#F3FAF5] flex items-center gap-1.5">
                              <BookOpen className="w-3.5 h-3.5 text-[#22C55E]" />
                              <span>Hôm nay học nội dung gì?</span>
                            </label>
                            <textarea
                              rows={2}
                              value={form.learnedContent}
                              onChange={(e) => {
                                const val = e.target.value;
                                setActiveLessonForms((prev) => ({
                                  ...prev,
                                  [cls.id]: { ...prev[cls.id], learnedContent: val },
                                }));
                              }}
                              placeholder="VD: Bài 12 - Phương trình bậc hai, định lý Vi-ét..."
                              className="w-full bg-[#050806] border border-[rgba(34,197,94,0.2)] rounded-xl p-2.5 text-xs text-[#F3FAF5] placeholder-[#A9B8AE]/50 focus:outline-none focus:border-[#22C55E]"
                            />
                          </div>

                          {/* 2) BTVN là gì? */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-[#F3FAF5] flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-[#22C55E]" />
                                <span>Bài tập về nhà (BTVN):</span>
                              </label>

                              <label className="flex items-center gap-1.5 text-xs text-[#86EFAC] font-semibold cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={form.hasNoHomework}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setActiveLessonForms((prev) => ({
                                      ...prev,
                                      [cls.id]: { ...prev[cls.id], hasNoHomework: checked },
                                    }));
                                  }}
                                  className="rounded border-[rgba(34,197,94,0.3)] text-[#16A34A] focus:ring-0"
                                />
                                <span>Không có BTVN</span>
                              </label>
                            </div>

                            <textarea
                              rows={2}
                              disabled={form.hasNoHomework}
                              value={form.hasNoHomework ? '' : form.homework}
                              onChange={(e) => {
                                const val = e.target.value;
                                setActiveLessonForms((prev) => ({
                                  ...prev,
                                  [cls.id]: { ...prev[cls.id], homework: val },
                                }));
                              }}
                              placeholder={
                                form.hasNoHomework
                                  ? 'Môn này không có bài tập về nhà'
                                  : 'VD: Làm bài 1, 2, 3 trang 45 SGK...'
                              }
                              className={`w-full rounded-xl p-2.5 text-xs focus:outline-none transition-all ${
                                form.hasNoHomework
                                  ? 'bg-[#050806]/40 border-[rgba(34,197,94,0.1)] text-[#A9B8AE]/50 cursor-not-allowed italic'
                                  : 'bg-[#050806] border border-[rgba(34,197,94,0.2)] text-[#F3FAF5] placeholder-[#A9B8AE]/50 focus:border-[#22C55E]'
                              }`}
                            />
                          </div>

                          {/* Options: Hạn nộp & Thời lượng dự kiến */}
                          {!form.hasNoHomework && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                              <div className="space-y-1">
                                <label className="text-[11px] font-bold text-[#A9B8AE]">Hạn hoàn thành:</label>
                                <select
                                  value={form.homeworkDueOption}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setActiveLessonForms((prev) => ({
                                      ...prev,
                                      [cls.id]: { ...prev[cls.id], homeworkDueOption: val },
                                    }));
                                  }}
                                  className="w-full bg-[#050806] border border-[rgba(34,197,94,0.2)] rounded-xl px-3 py-2 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E] cursor-pointer"
                                >
                                  <option value="tonight">Tối nay (làm ngay)</option>
                                  <option value="tomorrow">Ngày mai (trước giờ học)</option>
                                  <option value="2days">Sau 2 ngày</option>
                                  <option value="1week">Sau 1 tuần</option>
                                  <option value="none">Chưa xác định</option>
                                </select>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[11px] font-bold text-[#A9B8AE]">Thời lượng ước tính:</label>
                                <select
                                  value={form.homeworkEstimatedMinutes}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10) || 30;
                                    setActiveLessonForms((prev) => ({
                                      ...prev,
                                      [cls.id]: { ...prev[cls.id], homeworkEstimatedMinutes: val },
                                    }));
                                  }}
                                  className="w-full bg-[#050806] border border-[rgba(34,197,94,0.2)] rounded-xl px-3 py-2 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E] cursor-pointer"
                                >
                                  <option value={15}>15 phút (Bài ngắn)</option>
                                  <option value={30}>30 phút (Trung bình)</option>
                                  <option value={45}>45 phút (Chuẩn)</option>
                                  <option value={60}>60 phút (Bài dài)</option>
                                  <option value={90}>90 phút (Luyện sâu)</option>
                                </select>
                              </div>
                            </div>
                          )}

                          {/* Action Buttons & Save Status */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-[rgba(34,197,94,0.1)]">
                            <div className="text-[11px] text-[#86EFAC] font-semibold flex items-center gap-1.5">
                              {form.savedStatus ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-[#22C55E]" />
                                  <span>{form.savedStatus}</span>
                                </>
                              ) : (
                                <span className="text-[#A9B8AE]">Chưa lưu thay đổi mới</span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={form.isSaving}
                                onClick={() => handleSaveLessonLog(cls, false)}
                                className="px-3 py-2 rounded-xl bg-[#050806] hover:bg-[#142319] text-[#A9B8AE] hover:text-[#F3FAF5] text-xs font-bold border border-[rgba(34,197,94,0.2)] transition-all cursor-pointer disabled:opacity-50"
                              >
                                {form.isSaving ? 'Đang lưu...' : 'Lưu bài học'}
                              </button>

                              <button
                                type="button"
                                disabled={form.isSaving || (form.hasNoHomework ? false : !form.homework.trim())}
                                onClick={() => handleSaveLessonLog(cls, true)}
                                className="flex items-center gap-1.5 px-4 py-2 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black rounded-xl shadow-md shadow-[#16A34A]/25 transition-all cursor-pointer disabled:opacity-50 jami-btn-glow"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                                <span>{form.isSaving ? 'Đang lưu...' : 'Lưu & Tạo nhiệm vụ'}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-[#A9B8AE] bg-[#101A13] rounded-2xl border border-[rgba(34,197,94,0.15)]">
                Hôm nay không có tiết học nào trên thời khóa biểu.
              </div>
            )}
          </div>

          {/* 3. Card Chuẩn Bị Cho Ngày Mai */}
          <div className="p-5 sm:p-6 rounded-3xl bg-[#0B120D] border border-[rgba(34,197,94,0.25)] shadow-xl space-y-4 jami-card-interactive relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#064E3B] border border-[#10B981]/40 flex items-center justify-center text-[#6EE7B7]">
                  <Moon className="w-4 h-4 text-[#10B981]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-[#F3FAF5]">Chuẩn bị cho ngày mai</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#102A1A] text-[#86EFAC] border border-[#22C55E]/30">
                      Jami AI Planner
                    </span>
                  </div>
                  <p className="text-xs text-[#A9B8AE]">
                    {tomorrowPlanOverview?.tomorrowSubjectsCount
                      ? `Ngày mai có ${tomorrowPlanOverview.tomorrowSubjectsCount} môn (${tomorrowPlanOverview.tomorrowSubjects.join(', ')})`
                      : 'Kế hoạch học tập & xem trước bài tối nay'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={handleOpenTomorrowPlanModal}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#101A13] hover:bg-[#142319] text-[#86EFAC] hover:text-[#F3FAF5] text-xs font-bold border border-[rgba(34,197,94,0.25)] transition-all cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
                  <span>{tomorrowPlan ? 'Xem / Tùy chỉnh kế hoạch' : 'Tạo kế hoạch tối nay'}</span>
                </button>
              </div>
            </div>

            {/* Plan Content */}
            {tomorrowPlan && tomorrowPlan.items && tomorrowPlan.items.length > 0 ? (
              <div className="space-y-3 pt-1">
                {/* Progress bar if accepted */}
                {tomorrowPlan.status === 'accepted' && (
                  <div className="p-3 rounded-2xl bg-[#050806] border border-[rgba(34,197,94,0.15)] flex items-center justify-between text-xs">
                    <span className="text-[#A9B8AE]">
                      Tiến độ hoàn thành: <span className="text-[#86EFAC] font-bold">{tomorrowPlan.items.filter(i => i.status === 'completed').length}/{tomorrowPlan.items.length} mục</span>
                    </span>
                    <span className="text-[11px] font-black text-[#86EFAC]">
                      {Math.round((tomorrowPlan.items.filter(i => i.status === 'completed').length / tomorrowPlan.items.length) * 100)}%
                    </span>
                  </div>
                )}

                <div className="divide-y divide-[rgba(34,197,94,0.1)]">
                  {tomorrowPlan.items.map((item) => (
                    <div
                      key={item.id}
                      className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3 group"
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => handleCompletePlanItem(item.id)}
                          className={`mt-0.5 p-1 rounded-lg border transition-all cursor-pointer ${
                            item.status === 'completed'
                              ? 'bg-[#16A34A] border-[#22C55E] text-[#050806]'
                              : 'bg-[#101A13] border-[rgba(34,197,94,0.3)] text-[#A9B8AE] hover:text-[#86EFAC]'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-black text-[#86EFAC] bg-[#101A13] px-2 py-0.5 rounded-md border border-[rgba(34,197,94,0.2)]">
                              ⏰ {item.startAt} – {item.endAt}
                            </span>
                            {item.subjectName && (
                              <span className="text-xs font-bold text-[#A9B8AE]">
                                {item.subjectName}
                              </span>
                            )}
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#050806] text-[#A9B8AE] border border-[rgba(34,197,94,0.15)]">
                              {item.plannedMinutes} phút
                            </span>
                          </div>
                          <div className={`text-xs sm:text-sm font-bold ${item.status === 'completed' ? 'line-through text-[#A9B8AE]/60' : 'text-[#F3FAF5]'}`}>
                            {item.title}
                          </div>
                          {item.reason && (
                            <p className="text-[11px] text-[#A9B8AE] flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-[#22C55E] shrink-0" />
                              <span>{item.reason}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {item.status !== 'completed' && (
                          <button
                            type="button"
                            onClick={() =>
                              navigateToFocus(
                                buildFocusUrl({
                                  duration: item.plannedMinutes,
                                  planId: tomorrowPlan?.id,
                                  planItemId: item.id,
                                  title: item.title,
                                  subjectId: item.subjectId,
                                  subject: item.subjectName,
                                  returnTo: '/today',
                                })
                              )
                            }
                            className="p-2 rounded-xl bg-[#101A13] hover:bg-[#16A34A] text-[#86EFAC] hover:text-[#050806] border border-[rgba(34,197,94,0.2)] transition-all cursor-pointer text-xs flex items-center gap-1"
                            title="Bắt đầu phiên Focus cho mục này"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline font-bold text-[11px]">Tập trung</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeletePlanItem(item.id)}
                          className="p-2 rounded-xl text-[#A9B8AE] hover:text-rose-400 hover:bg-[#101A13] transition-all cursor-pointer"
                          title="Xóa mục này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-[#050806] border border-[rgba(34,197,94,0.15)] flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-[#F3FAF5]">Chưa có kế hoạch chuẩn bị tối nay</div>
                  <div className="text-[11px] text-[#A9B8AE]">
                    Jami sẽ giúp bạn sắp xếp thời gian làm bài tập, xem trước bài và soạn đồ dùng chỉ trong 20–45 phút.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleOpenTomorrowPlanModal}
                  className="px-4 py-2 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black rounded-xl shadow-md transition-all cursor-pointer shrink-0"
                >
                  Tạo kế hoạch ngay →
                </button>
              </div>
            )}
          </div>

          {/* 4. Priority Task Highlight */}
          {nextPriorityTask && (
            <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-[#14532D]/40 to-[#0B120D] border border-[#22C55E]/40 shadow-xl space-y-3 jami-card-interactive">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-rose-400" />
                  <span>Nhiệm vụ ưu tiên tiếp theo</span>
                </span>
                <span className="text-xs text-[#A9B8AE]">
                  Còn {taskCounts.pending + taskCounts.in_progress} nhiệm vụ chưa hoàn thành
                </span>
              </div>

              <div>
                <h3
                  onClick={() => navigate(`/tasks/${nextPriorityTask.id}`)}
                  className="text-base sm:text-lg font-bold text-[#F3FAF5] hover:text-[#86EFAC] cursor-pointer transition-colors"
                >
                  {nextPriorityTask.title}
                </h3>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                  <span className="px-2.5 py-0.5 rounded-md bg-[#101A13] text-[#86EFAC] border border-[#22C55E]/30 font-bold">
                    {nextPriorityTask.subjectName || 'Môn học'}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md bg-[#101A13] text-[#A9B8AE] border border-[rgba(34,197,94,0.2)]">
                    ⏱️ {nextPriorityTask.estimatedMinutes || 30} phút
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-md font-bold text-[10px] ${
                    nextPriorityTask.priority === 'high' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                    nextPriorityTask.priority === 'medium' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                    'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  }`}>
                    Ưu tiên {nextPriorityTask.priority === 'high' ? 'Cao' : nextPriorityTask.priority === 'medium' ? 'Trung bình' : 'Thấp'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => navigate(`/tasks/${nextPriorityTask.id}`)}
                  className="px-3.5 py-2 rounded-xl bg-[#101A13] hover:bg-[#142319] text-[#A9B8AE] hover:text-[#F3FAF5] text-xs font-bold transition-all cursor-pointer border border-[rgba(34,197,94,0.2)]"
                >
                  Chi tiết nhiệm vụ
                </button>
                <button
                  type="button"
                  onClick={() =>
                    navigateToFocus(
                      buildFocusUrl({
                        duration: nextPriorityTask.estimatedMinutes || 25,
                        taskId: nextPriorityTask.id,
                        title: nextPriorityTask.title,
                        subjectId: nextPriorityTask.subjectId,
                        subject: nextPriorityTask.subjectName,
                        returnTo: '/today',
                      })
                    )
                  }
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#16A34A] text-[#050806] text-xs font-black hover:bg-[#22C55E] transition-all cursor-pointer shadow-md shadow-[#16A34A]/25"
                >
                  <Play className="w-3.5 h-3.5 fill-[#050806]" />
                  <span>Tập trung hoàn thành ngay</span>
                </button>
              </div>
            </div>
          )}

          {/* 5. Today's Tasks List with Filters & Sorting */}
          <div className="bg-[#0B120D] p-5 sm:p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)] gap-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#22C55E]" />
                <h2 className="text-sm sm:text-base font-bold text-[#F3FAF5]">
                  Nhiệm vụ học tập hôm nay ({taskCounts.all})
                </h2>
              </div>
              <button
                onClick={() => navigate('/tasks')}
                className="text-xs font-bold text-[#86EFAC] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Xem tất cả bài tập</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Filter Tabs for Tasks */}
            <div className="flex flex-wrap gap-1.5 pb-1">
              {[
                { key: 'all', label: `Tất cả (${taskCounts.all})` },
                { key: 'pending', label: `Chưa học (${taskCounts.pending})` },
                { key: 'in_progress', label: `Đang học (${taskCounts.in_progress})` },
                { key: 'completed', label: `Đã xong (${taskCounts.completed})` },
                { key: 'overdue', label: `Quá hạn (${taskCounts.overdue})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setTaskFilter(tab.key as TaskFilterType)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    taskFilter === tab.key
                      ? 'bg-[#16A34A] text-[#050806] shadow-sm'
                      : 'bg-[#101A13] text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#142319]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {filteredSortedTasks.length > 0 ? (
              <div className="space-y-2.5">
                {filteredSortedTasks.map((t) => {
                  const isDone = t.status === 'completed';
                  const isCompleting = completingTaskId === t.id;
                  const isOverdue = !isDone && t.dueAt && new Date(t.dueAt).getTime() < nowTime;

                  return (
                    <div
                      key={t.id}
                      className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isDone
                          ? 'bg-[#101A13]/60 border-[rgba(34,197,94,0.1)] opacity-70'
                          : isOverdue
                          ? 'bg-rose-950/20 border-rose-800/40 hover:border-rose-700'
                          : 'bg-[#101A13] border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/40'
                      }`}
                    >
                      <div className="flex items-start gap-3 truncate">
                        <button
                          type="button"
                          onClick={() => !isDone && handleCompleteTask(t.id)}
                          disabled={isDone || isCompleting}
                          className={`w-5 h-5 mt-0.5 rounded-lg border flex items-center justify-center shrink-0 cursor-pointer transition-all ${
                            isDone
                              ? 'bg-[#16A34A] border-[#22C55E] text-[#050806]'
                              : 'border-[rgba(34,197,94,0.3)] hover:border-[#22C55E]'
                          }`}
                          title={isDone ? 'Đã hoàn thành' : 'Đánh dấu hoàn thành'}
                        >
                          {isDone && <CheckCircle2 className="w-4 h-4" />}
                        </button>
                        <div className="truncate">
                          <div
                            onClick={() => navigate(`/tasks/${t.id}`)}
                            className={`text-xs sm:text-sm font-semibold truncate hover:text-[#86EFAC] cursor-pointer ${
                              isDone ? 'line-through text-[#A9B8AE]' : 'text-[#F3FAF5]'
                            }`}
                          >
                            {t.title}
                          </div>
                          <div className="text-[11px] text-[#A9B8AE] flex flex-wrap items-center gap-2 mt-1">
                            <span className="font-bold text-[#86EFAC]">{t.subjectName || 'Môn học'}</span>
                            <span>•</span>
                            <span>⏱️ {t.estimatedMinutes || 30} phút</span>
                            {t.scheduledStartAt && (
                              <>
                                <span>•</span>
                                <span className="text-[#86EFAC] flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-[#22C55E]" />
                                  <span>{new Date(t.scheduledStartAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                                </span>
                              </>
                            )}
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              t.priority === 'high' ? 'bg-rose-950/80 text-rose-300 border border-rose-800' :
                              t.priority === 'medium' ? 'bg-amber-950/80 text-amber-300 border border-amber-800' :
                              'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                            }`}>
                              {t.priority === 'high' ? 'Ưu tiên Cao' : t.priority === 'medium' ? 'Ưu tiên Vừa' : 'Ưu tiên Thấp'}
                            </span>
                            {isOverdue && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-900 text-white animate-pulse">
                                ⚠️ Quá hạn
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Task Action Buttons */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {!isDone && (
                          <>
                            <button
                              type="button"
                              onClick={() => setPostponeModalTask(t)}
                              className="px-2.5 py-1.5 rounded-xl bg-[#101A13] hover:bg-[#142319] text-[#A9B8AE] hover:text-[#F3FAF5] text-xs font-bold transition-all border border-[rgba(34,197,94,0.18)] cursor-pointer flex items-center gap-1"
                              title="Hoãn nhiệm vụ này"
                            >
                              <FastForward className="w-3 h-3 text-amber-400" />
                              <span>Hoãn</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                navigateToFocus(
                                  buildFocusUrl({
                                    duration: t.estimatedMinutes || 25,
                                    taskId: t.id,
                                    title: t.title,
                                    subjectId: t.subjectId,
                                    subject: t.subjectName,
                                    returnTo: '/today',
                                  })
                                )
                              }
                              className="px-3 py-1.5 rounded-xl bg-[#14532D] hover:bg-[#16A34A] text-[#86EFAC] hover:text-[#050806] text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1 shadow-sm"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Tập trung</span>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => navigate(`/tasks/${t.id}`)}
                          className="px-2.5 py-1.5 rounded-xl bg-[#101A13] hover:bg-[#142319] text-[#A9B8AE] hover:text-[#F3FAF5] text-xs font-bold transition-all border border-[rgba(34,197,94,0.18)] cursor-pointer flex items-center gap-0.5"
                          title="Xem chi tiết nhiệm vụ"
                        >
                          <span>Chi tiết</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-[#A9B8AE] space-y-2 bg-[#101A13]/50 rounded-2xl border border-[rgba(34,197,94,0.1)]">
                <CheckCircle2 className="w-8 h-8 text-[#22C55E] opacity-50 mx-auto" />
                <p className="font-bold text-[#F3FAF5]">Không có nhiệm vụ nào trong danh mục này.</p>
                <p>Em có thể bấm vào Quản lý bài tập để thêm hoặc nhờ Jami phân bổ tự động nhé.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar: Jami + Upcoming Exam + Materials */}
        <div className="space-y-6">
          {/* Jami AI Assistant Message Card */}
          <div className="bg-[#0B120D] p-5 sm:p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-[rgba(34,197,94,0.18)]">
              <div className="w-7 h-7 rounded-xl bg-[#14532D] text-[#86EFAC] flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black text-[#F3FAF5]">Trợ Lý Jami AI</h3>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-xs text-[#F3FAF5] leading-relaxed">
              {overview.jami.latestMessage}
            </div>

            <button
              onClick={() => navigate('/jami')}
              className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-[#14532D] hover:bg-[#16A34A] text-[#86EFAC] hover:text-[#050806] text-xs font-bold transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Trò chuyện cùng Jami</span>
            </button>
          </div>

          {/* Upcoming Exam Card */}
          <div className="bg-[#0B120D] p-5 sm:p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-[#22C55E]" />
                <h3 className="text-xs font-black text-[#F3FAF5]">Kỳ kiểm tra sắp tới</h3>
              </div>
              <button
                onClick={() => navigate('/exams')}
                className="text-[11px] text-[#86EFAC] hover:underline"
              >
                Xem chi tiết
              </button>
            </div>

            {overview.exams.upcomingTitle ? (
              <div className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] space-y-2">
                <div className="font-bold text-xs text-[#F3FAF5]">
                  {overview.exams.upcomingTitle}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#A9B8AE]">Thời gian còn lại:</span>
                  <span className="font-extrabold text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded-lg border border-amber-800/50">
                    {overview.exams.daysRemaining === 0 ? 'Hôm nay thi!' : `Còn ${overview.exams.daysRemaining} ngày`}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-[#A9B8AE]">
                Chưa có kỳ kiểm tra nào sắp tới.
              </div>
            )}
          </div>

          {/* Quick Learning Materials Card */}
          <div className="bg-[#0B120D] p-5 sm:p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#22C55E]" />
                <h3 className="text-xs font-black text-[#F3FAF5]">Kho tài liệu ({overview.materials.totalMaterialsCount})</h3>
              </div>
              <button
                onClick={() => navigate('/materials')}
                className="text-[11px] text-[#86EFAC] hover:underline"
              >
                Mở kho
              </button>
            </div>

            {overview.materials.latestMaterialTitle ? (
              <div
                onClick={() => navigate('/materials')}
                className="p-3.5 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/40 transition-all cursor-pointer flex items-center justify-between"
              >
                <span className="text-xs font-bold text-[#F3FAF5] truncate">
                  {overview.materials.latestMaterialTitle}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-[#86EFAC] shrink-0" />
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-[#A9B8AE]">
                Chưa có tài liệu nào được tải lên.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Hoãn nhiệm vụ (Postpone Task Modal) */}
      <ModalPortal
        isOpen={!!postponeModalTask}
        onClose={() => setPostponeModalTask(null)}
        title="Hoãn bài tập / nhiệm vụ"
        subtitle={postponeModalTask?.title}
        icon={<FastForward className="w-5 h-5 text-amber-400" />}
        maxWidthClass="max-w-md"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <button
              type="button"
              onClick={() => setPostponeModalTask(null)}
              className="px-4 py-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={isPostponing || (postponeOption === 'custom' && !customPostponeTime)}
              onClick={handleConfirmPostpone}
              className="px-4 py-2 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black rounded-xl cursor-pointer transition-all shadow-md shadow-[#16A34A]/25 disabled:opacity-40"
            >
              {isPostponing ? 'Đang hoãn...' : 'Xác nhận hoãn'}
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-[#F3FAF5]">
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-[#A9B8AE]">Chọn thời gian hoãn:</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: '30m', label: '+30 phút' },
                { key: '60m', label: '+1 tiếng' },
                { key: 'tonight', label: 'Tối nay (19:30)' },
                { key: 'tomorrow', label: 'Ngày mai (08:00)' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPostponeOption(opt.key as any)}
                  className={`p-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                    postponeOption === opt.key
                      ? 'bg-[#16A34A] text-[#050806] border-[#22C55E]'
                      : 'bg-[#101A13] text-[#A9B8AE] border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/40'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setPostponeOption('custom')}
                className={`w-full py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center mb-2 ${
                  postponeOption === 'custom'
                    ? 'bg-[#16A34A] text-[#050806] border-[#22C55E]'
                    : 'bg-[#101A13] text-[#A9B8AE] border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/40'
                }`}
              >
                ⚙️ Chọn giờ tùy chỉnh
              </button>

              {postponeOption === 'custom' && (
                <input
                  type="datetime-local"
                  value={customPostponeTime}
                  onChange={(e) => setCustomPostponeTime(e.target.value)}
                  className="w-full p-2.5 bg-[#101A13] border border-[rgba(34,197,94,0.3)] rounded-xl text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                />
              )}
            </div>
          </div>
        </div>
      </ModalPortal>

      {/* Modal: Jami Hỏi Bù Sau Khi Offline (Stepper Check-in) */}
      <ModalPortal
        isOpen={isCheckinModalOpen && missedSessions.length > 0}
        onClose={() => setIsCheckinModalOpen(false)}
        title={missedSessions[checkinStepIndex]?.subjectName || missedSessions[checkinStepIndex]?.title}
        subtitle={`Cập nhật buổi học offline • Bước ${checkinStepIndex + 1}/${missedSessions.length}`}
        icon={<RobotJami state="speaking" size="sm" showBubble={false} />}
        maxWidthClass="max-w-lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="text-[11px] text-[#A9B8AE]">
              💾 Dữ liệu lưu ngay sau từng môn
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSubmittingCheckin}
                onClick={() => setIsCheckinModalOpen(false)}
                className="px-3.5 py-2 text-xs font-bold text-[#A9B8AE] hover:text-[#F3FAF5] rounded-xl cursor-pointer"
              >
                Để sau
              </button>
              <button
                type="button"
                disabled={isSubmittingCheckin}
                onClick={handleSaveCheckinStep}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black rounded-xl shadow-lg shadow-[#16A34A]/25 cursor-pointer disabled:opacity-50 transition-all"
              >
                <Check className="w-4 h-4" />
                <span>
                  {isSubmittingCheckin
                    ? 'Đang lưu...'
                    : checkinStepIndex < missedSessions.length - 1
                    ? 'Lưu & Sang môn tiếp theo →'
                    : 'Hoàn tất cập nhật'}
                </span>
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Session Info Pill */}
          <div className="p-3 rounded-2xl bg-[#101A13] [data-theme=hai-ba-trung]:bg-[#102B20] border border-[rgba(34,197,94,0.18)] [data-theme=hai-ba-trung]:border-[rgba(210,168,74,0.2)] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-[#86EFAC] [data-theme=hai-ba-trung]:text-[#E8C66A] font-bold">
              <Calendar className="w-3.5 h-3.5 text-[#22C55E] [data-theme=hai-ba-trung]:text-[#D2A84A]" />
              <span>
                {missedSessions[checkinStepIndex]?.dayOfWeekText} ({missedSessions[checkinStepIndex]?.formattedDate})
              </span>
            </div>
            <div className="text-[#A9B8AE] [data-theme=hai-ba-trung]:text-[#B9C8BE] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#22C55E] [data-theme=hai-ba-trung]:text-[#D2A84A]" />
              <span>
                {missedSessions[checkinStepIndex]?.startLocalTime} – {missedSessions[checkinStepIndex]?.endLocalTime}
              </span>
            </div>
          </div>

          {/* Attendance Toggle: Có tham gia hay nghỉ học */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-[#050806] [data-theme=hai-ba-trung]:bg-[#06130E] border border-[rgba(34,197,94,0.15)] [data-theme=hai-ba-trung]:border-[rgba(210,168,74,0.2)]">
            <span className="text-xs text-[#A9B8AE] [data-theme=hai-ba-trung]:text-[#B9C8BE]">Trạng thái tham gia tiết này:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCheckinForm((prev) => ({ ...prev, attendanceStatus: 'attended' }))}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  checkinForm.attendanceStatus === 'attended'
                    ? 'bg-[#16A34A] text-[#050806] shadow-sm'
                    : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
                }`}
              >
                ✓ Tôi có đi học
              </button>
              <button
                type="button"
                onClick={() => setCheckinForm((prev) => ({ ...prev, attendanceStatus: 'absent' }))}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  checkinForm.attendanceStatus === 'absent'
                    ? 'bg-amber-600 text-[#050806] shadow-sm'
                    : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
                }`}
              >
                Tôi đã nghỉ tiết này
              </button>
            </div>
          </div>

          {checkinForm.attendanceStatus === 'absent' ? (
            <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-800/40 text-xs text-amber-200 space-y-1">
              <p className="font-bold">Đã chọn: Em đã nghỉ tiết học này.</p>
              <p className="text-[11px] text-amber-300/80">
                Jami sẽ ghi nhận buổi nghỉ để hỗ trợ nhắc nhở em mượn vở bạn hoặc học bù khi cần.
              </p>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              {/* 1) Hôm nay bạn đã học nội dung gì? */}
              <div className="space-y-1.5">
                <label className="font-bold text-[#F3FAF5] [data-theme=hai-ba-trung]:text-[#F5F4EF] flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-[#22C55E] [data-theme=hai-ba-trung]:text-[#D2A84A]" />
                  <span>1. Hôm nay bạn đã học nội dung gì?</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="VD: Bài 12 - Phương trình bậc hai, cách tính delta..."
                  value={checkinForm.learnedContent}
                  onChange={(e) => setCheckinForm((prev) => ({ ...prev, learnedContent: e.target.value }))}
                  className="w-full bg-[#101A13] [data-theme=hai-ba-trung]:bg-[#102B20] border border-[rgba(34,197,94,0.2)] [data-theme=hai-ba-trung]:border-[rgba(210,168,74,0.25)] rounded-xl p-2.5 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                />
              </div>

              {/* 2) Giáo viên giao bài tập về nhà gì? */}
              <div className="space-y-1.5">
                <label className="font-bold text-[#F3FAF5] [data-theme=hai-ba-trung]:text-[#F5F4EF] flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-[#22C55E] [data-theme=hai-ba-trung]:text-[#D2A84A]" />
                  <span>2. Giáo viên giao bài tập về nhà gì?</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="VD: Làm bài 1, 2, 3 trang 45 SGK..."
                  value={checkinForm.homework}
                  onChange={(e) => setCheckinForm((prev) => ({ ...prev, homework: e.target.value }))}
                  className="w-full bg-[#101A13] [data-theme=hai-ba-trung]:bg-[#102B20] border border-[rgba(34,197,94,0.2)] [data-theme=hai-ba-trung]:border-[rgba(210,168,74,0.25)] rounded-xl p-2.5 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                />
                {checkinForm.homework.trim() && (
                  <label className="flex items-center gap-2 pt-1 text-[11px] text-[#86EFAC] [data-theme=hai-ba-trung]:text-[#E8C66A] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checkinForm.createTaskForHomework}
                      onChange={(e) => setCheckinForm((prev) => ({ ...prev, createTaskForHomework: e.target.checked }))}
                      className="rounded border-[rgba(34,197,94,0.3)] text-[#16A34A] focus:ring-0"
                    />
                    <span>Tự động tạo nhiệm vụ học tập cho bài tập này vào hôm nay</span>
                  </label>
                )}
              </div>

              {/* 3) Bạn cảm thấy buổi học như thế nào? */}
              <div className="space-y-1.5">
                <label className="font-bold text-[#F3FAF5] [data-theme=hai-ba-trung]:text-[#F5F4EF] flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-[#22C55E] [data-theme=hai-ba-trung]:text-[#D2A84A]" />
                  <span>3. Bạn cảm thấy buổi học như thế nào?</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { value: 'very_easy', label: 'Rất dễ', icon: '😄' },
                    { value: 'normal', label: 'Bình thường', icon: '🙂' },
                    { value: 'hard', label: 'Hơi khó', icon: '🤔' },
                    { value: 'not_understood', label: 'Chưa hiểu bài', icon: '😕' },
                  ].map((lvl) => (
                    <button
                      key={lvl.value}
                      type="button"
                      onClick={() => setCheckinForm((prev) => ({ ...prev, understandingLevel: lvl.value as any }))}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                        checkinForm.understandingLevel === lvl.value
                          ? 'bg-[#14532D] [data-theme=hai-ba-trung]:bg-[#163B2C] border-[#22C55E] [data-theme=hai-ba-trung]:border-[#D2A84A] text-[#86EFAC] [data-theme=hai-ba-trung]:text-[#E8C66A] shadow-sm'
                          : 'bg-[#101A13] [data-theme=hai-ba-trung]:bg-[#102B20] border-[rgba(34,197,94,0.15)] [data-theme=hai-ba-trung]:border-[rgba(210,168,74,0.2)] text-[#A9B8AE] [data-theme=hai-ba-trung]:text-[#B9C8BE] hover:text-[#F3FAF5]'
                      }`}
                    >
                      <div className="text-base">{lvl.icon}</div>
                      <div className="text-[11px] font-bold mt-0.5">{lvl.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 4) Có phần nào bạn chưa hiểu không? */}
              <div className="space-y-1.5">
                <label className="font-bold text-[#F3FAF5] [data-theme=hai-ba-trung]:text-[#F5F4EF] flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-[#22C55E] [data-theme=hai-ba-trung]:text-[#D2A84A]" />
                  <span>4. Có phần nào bạn chưa hiểu không? (Để Jami giải đáp)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="VD: Cách biến đổi công thức ở ví dụ 2..."
                  value={checkinForm.reflection}
                  onChange={(e) => setCheckinForm((prev) => ({ ...prev, reflection: e.target.value }))}
                  className="w-full bg-[#101A13] [data-theme=hai-ba-trung]:bg-[#102B20] border border-[rgba(34,197,94,0.2)] [data-theme=hai-ba-trung]:border-[rgba(210,168,74,0.25)] rounded-xl p-2.5 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                />
              </div>
            </div>
          )}
        </div>
      </ModalPortal>

      {/* Tomorrow Preparation Plan Modal ("Jami chuẩn bị ngày mai") */}
      <ModalPortal
        isOpen={isTomorrowPlanModalOpen}
        onClose={() => setIsTomorrowPlanModalOpen(false)}
        title={tomorrowPlanModalStep === 'energy' ? 'Tối nay bạn cảm thấy thế nào?' : 'Kế hoạch học tập & xem trước bài tối nay'}
        subtitle="Jami AI Planner • Chuẩn Bị Ngày Mai"
        icon={<Moon className="w-5 h-5 text-[#10B981] [data-theme=hai-ba-trung]:text-[#D2A84A]" />}
        maxWidthClass="max-w-2xl"
        footer={
          tomorrowPlanModalStep === 'plan' && tomorrowPlan ? (
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={() => handleDismissTomorrowPlan(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-[#A9B8AE] [data-theme=hai-ba-trung]:text-[#B9C8BE] hover:text-[#F3FAF5] hover:bg-[#101A13] [data-theme=hai-ba-trung]:hover:bg-[#102B20] cursor-pointer"
              >
                Tối nay tôi bận / Để sau
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsTomorrowPlanModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-[#101A13] [data-theme=hai-ba-trung]:bg-[#102B20] hover:bg-[#142319] [data-theme=hai-ba-trung]:hover:bg-[#163B2C] text-[#A9B8AE] [data-theme=hai-ba-trung]:text-[#B9C8BE] hover:text-[#F3FAF5] text-xs font-bold border border-[rgba(34,197,94,0.2)] [data-theme=hai-ba-trung]:border-[rgba(210,168,74,0.25)] cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  disabled={isAcceptingPlan}
                  onClick={handleAcceptTomorrowPlan}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#10B981] to-[#059669] [data-theme=hai-ba-trung]:from-[#19C76F] [data-theme=hai-ba-trung]:to-[#118C4E] hover:from-[#34D399] hover:to-[#10B981] text-[#050806] text-xs font-black shadow-lg shadow-[#10B981]/25 cursor-pointer disabled:opacity-50 transition-all jami-btn-glow"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{isAcceptingPlan ? 'Đang lưu...' : 'Chấp nhận kế hoạch'}</span>
                </button>
              </div>
            </div>
          ) : undefined
        }
      >
        {/* Step 1: Energy Selector */}
        {tomorrowPlanModalStep === 'energy' && (
          <div className="space-y-4">
            <p className="text-xs text-[#A9B8AE] [data-theme=hai-ba-trung]:text-[#B9C8BE]">
              Chọn mức năng lượng tối nay để Jami tối ưu thời lượng và nội dung bài học phù hợp nhất với bạn:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  level: 'high',
                  title: 'Khỏe, có thể học tập trung',
                  duration: '60–90 phút',
                  desc: 'Làm bài tập, ôn kiến thức chưa hiểu và xem trước bài mới.',
                  icon: '⚡',
                  border: 'border-emerald-500/40 [data-theme=hai-ba-trung]:border-[#D2A84A]/40',
                  badge: 'bg-emerald-950 text-emerald-300 [data-theme=hai-ba-trung]:bg-[#2D4235] [data-theme=hai-ba-trung]:text-[#E8C66A]',
                },
                {
                  level: 'normal',
                  title: 'Bình thường',
                  duration: '40–60 phút',
                  desc: 'Hoàn thành bài tập trọng tâm và xem qua bài ngày mai.',
                  icon: '🙂',
                  border: 'border-[#10B981]/40 [data-theme=hai-ba-trung]:border-[#19C76F]/40',
                  badge: 'bg-green-950 text-green-300 [data-theme=hai-ba-trung]:bg-[#163B2C] [data-theme=hai-ba-trung]:text-[#86EFAC]',
                },
                {
                  level: 'low',
                  title: 'Hơi mệt',
                  duration: '20–30 phút',
                  desc: 'Chỉ làm bài tập ngắn và soạn sách vở nhẹ nhàng.',
                  icon: '🥱',
                  border: 'border-amber-500/40',
                  badge: 'bg-amber-950 text-amber-300',
                },
                {
                  level: 'due_only',
                  title: 'Chỉ làm bài cần nộp',
                  duration: 'Tùy bài tập',
                  desc: 'Tập trung giải quyết các bài tập có hạn nộp vào ngày mai.',
                  icon: '🎯',
                  border: 'border-purple-500/40',
                  badge: 'bg-purple-950 text-purple-300',
                },
                {
                  level: 'skip',
                  title: 'Tối nay không học',
                  duration: '0 phút',
                  desc: 'Nghỉ ngơi hoàn toàn, Jami sẽ không nhắc nhở tối nay.',
                  icon: '🌙',
                  border: 'border-slate-600/40',
                  badge: 'bg-slate-900 text-slate-400',
                },
              ].map((item) => (
                <button
                  key={item.level}
                  type="button"
                  disabled={isGeneratingPlan}
                  onClick={() => handleSelectEnergyAndGenerate(item.level as TomorrowPlanEnergyLevel)}
                  className={`p-4 rounded-2xl bg-[#101A13] [data-theme=hai-ba-trung]:bg-[#102B20] hover:bg-[#142319] [data-theme=hai-ba-trung]:hover:bg-[#163B2C] border text-left transition-all cursor-pointer group space-y-1.5 ${item.border} ${
                    selectedEnergyLevel === item.level ? 'ring-2 ring-[#10B981] [data-theme=hai-ba-trung]:ring-[#D2A84A]' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xl">{item.icon}</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${item.badge}`}>
                      {item.duration}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-[#F3FAF5] group-hover:text-[#6EE7B7] [data-theme=hai-ba-trung]:group-hover:text-[#E8C66A] transition-colors">
                    {item.title}
                  </div>
                  <p className="text-[11px] text-[#A9B8AE] [data-theme=hai-ba-trung]:text-[#B9C8BE] leading-relaxed">
                    {item.desc}
                  </p>
                </button>
              ))}
            </div>

            {isGeneratingPlan && (
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-[#6EE7B7] [data-theme=hai-ba-trung]:text-[#E8C66A] font-bold">
                <RefreshCw className="w-4 h-4 animate-spin text-[#10B981] [data-theme=hai-ba-trung]:text-[#D2A84A]" />
                <span>Jami đang tính toán thời gian rảnh và lập kế hoạch...</span>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Plan Timeline Review & Edit */}
        {tomorrowPlanModalStep === 'plan' && tomorrowPlan && (
          <div className="space-y-4">
            {/* Meta summary bar */}
            <div className="p-3.5 rounded-2xl bg-[#101A13] [data-theme=hai-ba-trung]:bg-[#102B20] border border-[rgba(34,197,94,0.2)] [data-theme=hai-ba-trung]:border-[rgba(210,168,74,0.25)] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-[#F3FAF5]">
                <Clock className="w-4 h-4 text-[#10B981] [data-theme=hai-ba-trung]:text-[#D2A84A]" />
                <span>
                  Tổng thời gian: <strong className="text-[#6EE7B7] [data-theme=hai-ba-trung]:text-[#E8C66A]">{tomorrowPlan.totalMinutes} phút</strong> ({tomorrowPlan.items.length} mục)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTomorrowPlanModalStep('energy')}
                  className="px-2.5 py-1 rounded-lg bg-[#050806] [data-theme=hai-ba-trung]:bg-[#06130E] hover:bg-[#142319] text-[#A9B8AE] [data-theme=hai-ba-trung]:text-[#B9C8BE] hover:text-[#F3FAF5] text-[11px] font-bold border border-[rgba(34,197,94,0.2)] [data-theme=hai-ba-trung]:border-[rgba(210,168,74,0.2)] transition-all cursor-pointer"
                >
                  Đổi mức năng lượng
                </button>
                <button
                  type="button"
                  disabled={isGeneratingPlan}
                  onClick={handleRegenerateTomorrowPlan}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#050806] [data-theme=hai-ba-trung]:bg-[#06130E] hover:bg-[#142319] text-[#6EE7B7] [data-theme=hai-ba-trung]:text-[#E8C66A] hover:text-[#F3FAF5] text-[11px] font-bold border border-[#10B981]/30 [data-theme=hai-ba-trung]:border-[#D2A84A]/30 transition-all cursor-pointer"
                >
                  <RotateCcw className={`w-3 h-3 ${isGeneratingPlan ? 'animate-spin' : ''}`} />
                  <span>Tạo lại</span>
                </button>
              </div>
            </div>

            {/* Timeline items list */}
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1 divide-y divide-[rgba(34,197,94,0.1)] [data-theme=hai-ba-trung]:divide-[rgba(210,168,74,0.1)]">
              {tomorrowPlan.items.map((item, idx) => (
                <div key={item.id} className="pt-3 first:pt-0 flex items-start justify-between gap-3 group">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black text-[#6EE7B7] [data-theme=hai-ba-trung]:text-[#E8C66A] bg-[#101A13] [data-theme=hai-ba-trung]:bg-[#102B20] px-2.5 py-0.5 rounded-md border border-[#10B981]/30 [data-theme=hai-ba-trung]:border-[#D2A84A]/30">
                        {item.startAt} – {item.endAt}
                      </span>
                      {item.subjectName && (
                        <span className="text-xs font-bold text-[#F3FAF5] bg-[#050806] [data-theme=hai-ba-trung]:bg-[#06130E] px-2 py-0.5 rounded-md border border-[rgba(34,197,94,0.2)] [data-theme=hai-ba-trung]:border-[rgba(210,168,74,0.2)]">
                          {item.subjectName}
                        </span>
                      )}
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#14532D]/60 [data-theme=hai-ba-trung]:bg-[#163B2C] text-[#86EFAC] [data-theme=hai-ba-trung]:text-[#E8C66A]">
                        {item.plannedMinutes} phút
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        item.priority === 'high' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                        item.priority === 'medium' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                        'bg-slate-900 text-slate-300'
                      }`}>
                        {item.priority === 'high' ? 'Ưu tiên cao' : item.priority === 'medium' ? 'Trung bình' : 'Nhẹ'}
                      </span>
                    </div>

                    <div className="text-xs sm:text-sm font-bold text-[#F3FAF5]">
                      {idx + 1}. {item.title}
                    </div>

                    {item.description && (
                      <p className="text-xs text-[#A9B8AE] [data-theme=hai-ba-trung]:text-[#B9C8BE] leading-relaxed">
                        {item.description}
                      </p>
                    )}

                    {item.reason && (
                      <div className="p-2 rounded-xl bg-[#050806] [data-theme=hai-ba-trung]:bg-[#06130E] border border-[rgba(34,197,94,0.15)] [data-theme=hai-ba-trung]:border-[rgba(210,168,74,0.2)] text-[11px] text-[#A9B8AE] [data-theme=hai-ba-trung]:text-[#B9C8BE] flex items-start gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#10B981] [data-theme=hai-ba-trung]:text-[#D2A84A] shrink-0 mt-0.5" />
                        <span><strong>Lý do Jami đề xuất:</strong> {item.reason}</span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeletePlanItem(item.id)}
                    className="p-1.5 text-[#A9B8AE] hover:text-rose-400 hover:bg-[#101A13] rounded-lg transition-all cursor-pointer shrink-0"
                    title="Xóa mục này"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </ModalPortal>

      {/* Hai Bà Trưng Story Modal */}
      <ModalPortal
        isOpen={isStoryModalOpen}
        onClose={() => setIsStoryModalOpen(false)}
        title="Góc Lịch Sử – Hai Bà Trưng"
        subtitle="Hào khí non sông • Tinh thần tự chủ"
        icon={<BookOpen className="w-5 h-5 text-[#D2A84A]" />}
        maxWidthClass="max-w-xl"
        footer={
          <div className="flex justify-end w-full">
            <button
              type="button"
              onClick={() => setIsStoryModalOpen(false)}
              className="px-5 py-2.5 rounded-xl bg-[#19C76F] hover:bg-[#26DE81] text-[#06130E] text-xs font-black shadow-md cursor-pointer transition-all"
            >
              Đã hiểu & Tiếp tục học tập
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-xs text-[#B9C8BE] leading-relaxed">
          <div className="p-4 rounded-2xl bg-[#102B20] border border-[#D2A84A]/30 space-y-2">
            <h4 className="text-sm font-black text-[#F5F4EF]">Cuộc khởi nghĩa Hai Bà Trưng (Năm 40 SCN)</h4>
            <p>
              Khởi nghĩa Hai Bà Trưng năm 40 là một dấu mốc tiêu biểu về ý chí tự chủ và tinh thần kiên cường của dân tộc Việt Nam.
              Hai vị nữ anh hùng Trưng Trắc và Trưng Nhị đã phất cờ khởi nghĩa tại Hát Môn, quy tụ hào kiệt bốn phương, giải phóng 65 thành trì và lập lại nền độc lập đầu tiên cho nước nhà.
            </p>
          </div>

          <div className="space-y-2">
            <h5 className="font-bold text-[#E8C66A]">Thông điệp truyền cảm hứng học tập cho học sinh:</h5>
            <ul className="list-disc pl-4 space-y-1.5 text-[#E9E5DC]">
              <li><strong>Tinh thần tự lập & tự chủ:</strong> Chủ động làm chủ việc học, không ỷ lại và luôn đặt mục tiêu rõ ràng.</li>
              <li><strong>Kiên cường trước thử thách:</strong> Mỗi bài toán khó hay kỳ thi quan trọng là một cơ hội rèn luyện bản lĩnh.</li>
              <li><strong>Đoàn kết và dẫn đầu:</strong> Cùng bạn bè tiến bộ, phát huy trí tuệ và khát vọng vươn lên tương lai.</li>
            </ul>
          </div>
        </div>
      </ModalPortal>
    </div>
  );
};
