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
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { TodayDashboardOverview, StudyTask, MissedClassSession } from '../../../shared/types';
import { useAuth } from '../auth/AuthProvider';
import { RobotJami } from '../../components/jami/RobotJami';
import confetti from 'canvas-confetti';

type TaskFilterType = 'all' | 'pending' | 'in_progress' | 'completed' | 'overdue';

export const TodayDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [overview, setOverview] = useState<TodayDashboardOverview | null>(null);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState<TaskFilterType>('all');

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

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [overviewData, tasksData, missedData] = await Promise.all([
        api.getDashboardOverview(),
        api.getTasks(),
        api.getMissedClassSessions().catch(() => ({ missedSessions: [] })),
      ]);
      setOverview(overviewData);
      setTasks(tasksData.tasks || []);
      setMissedSessions(missedData.missedSessions || []);
    } catch (err: any) {
      setError(err.message || 'Không thể tải dữ liệu học tập hôm nay.');
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-36 rounded-3xl bg-[#0B120D] border border-[rgba(34,197,94,0.2)] animate-pulse flex items-center justify-center">
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
          onClick={fetchDashboardData}
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

      {/* Top Welcome Banner */}
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

          {/* Quick Focus Button */}
          <button
            onClick={() => navigate('/focus')}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black shadow-lg shadow-[#16A34A]/25 transition-all cursor-pointer shrink-0 jami-btn-glow"
          >
            <Play className="w-4 h-4 fill-[#050806]" />
            <span>Bắt đầu Hẹn giờ tập trung</span>
          </button>
        </div>
      </div>

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
          {/* Priority Task Highlight (2.1 Hiển thị nhiệm vụ ưu tiên tiếp theo) */}
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
                  onClick={() => navigate(`/focus?taskId=${nextPriorityTask.id}`)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#16A34A] text-[#050806] text-xs font-black hover:bg-[#22C55E] transition-all cursor-pointer shadow-md shadow-[#16A34A]/25"
                >
                  <Play className="w-3.5 h-3.5 fill-[#050806]" />
                  <span>Tập trung hoàn thành ngay</span>
                </button>
              </div>
            </div>
          )}

          {/* Today's Tasks List with Filters & Sorting (2.1 Việc cần làm) */}
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
                              onClick={() => navigate(`/focus?taskId=${t.id}`)}
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

          {/* Today's Timetable / Classes */}
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
      {postponeModalTask && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.35)] p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-5 text-[#F3FAF5]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-950/80 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
                <FastForward className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-[#F3FAF5]">Hoãn bài tập / nhiệm vụ</h3>
                <p className="text-xs text-[#86EFAC] truncate max-w-[280px]">
                  {postponeModalTask.title}
                </p>
              </div>
            </div>

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

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[rgba(34,197,94,0.18)]">
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
          </div>
        </div>
      )}

      {/* Modal: Jami Hỏi Bù Sau Khi Offline (Stepper Check-in) */}
      {isCheckinModalOpen && missedSessions.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.35)] p-6 rounded-3xl max-w-lg w-full shadow-2xl space-y-5 text-[#F3FAF5] max-h-[90vh] overflow-y-auto">
            {/* Header with Robot & Stepper */}
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#14532D] border border-[#22C55E]/40 flex items-center justify-center shrink-0">
                  <RobotJami state="speaking" size="sm" showBubble={false} />
                </div>
                <div>
                  <div className="text-[10px] font-black text-[#86EFAC] uppercase tracking-wider">
                    Cập nhật buổi học offline • Bước {checkinStepIndex + 1}/{missedSessions.length}
                  </div>
                  <h3 className="text-sm sm:text-base font-black text-[#F3FAF5]">
                    {missedSessions[checkinStepIndex]?.subjectName || missedSessions[checkinStepIndex]?.title}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCheckinModalOpen(false)}
                className="p-1.5 rounded-xl text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#101A13] cursor-pointer"
                title="Đóng (Dữ liệu đã hoàn thành các bước trước đã được lưu an toàn)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Session Info Pill */}
            <div className="p-3 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.18)] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-[#86EFAC] font-bold">
                <Calendar className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>
                  {missedSessions[checkinStepIndex]?.dayOfWeekText} ({missedSessions[checkinStepIndex]?.formattedDate})
                </span>
              </div>
              <div className="text-[#A9B8AE] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>
                  {missedSessions[checkinStepIndex]?.startLocalTime} – {missedSessions[checkinStepIndex]?.endLocalTime}
                </span>
              </div>
            </div>

            {/* Attendance Toggle: Có tham gia hay nghỉ học */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-[#050806] border border-[rgba(34,197,94,0.15)]">
              <span className="text-xs text-[#A9B8AE]">Trạng thái tham gia tiết này:</span>
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
                  <label className="font-bold text-[#F3FAF5] flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-[#22C55E]" />
                    <span>1. Hôm nay bạn đã học nội dung gì?</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="VD: Bài 12 - Phương trình bậc hai, cách tính delta..."
                    value={checkinForm.learnedContent}
                    onChange={(e) => setCheckinForm((prev) => ({ ...prev, learnedContent: e.target.value }))}
                    className="w-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-xl p-2.5 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                  />
                </div>

                {/* 2) Giáo viên giao bài tập về nhà gì? */}
                <div className="space-y-1.5">
                  <label className="font-bold text-[#F3FAF5] flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#22C55E]" />
                    <span>2. Giáo viên giao bài tập về nhà gì?</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="VD: Làm bài 1, 2, 3 trang 45 SGK..."
                    value={checkinForm.homework}
                    onChange={(e) => setCheckinForm((prev) => ({ ...prev, homework: e.target.value }))}
                    className="w-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-xl p-2.5 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                  />
                  {checkinForm.homework.trim() && (
                    <label className="flex items-center gap-2 pt-1 text-[11px] text-[#86EFAC] cursor-pointer">
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
                  <label className="font-bold text-[#F3FAF5] flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-[#22C55E]" />
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
                            ? 'bg-[#14532D] border-[#22C55E] text-[#86EFAC] shadow-sm'
                            : 'bg-[#101A13] border-[rgba(34,197,94,0.15)] text-[#A9B8AE] hover:text-[#F3FAF5]'
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
                  <label className="font-bold text-[#F3FAF5] flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-[#22C55E]" />
                    <span>4. Có phần nào bạn chưa hiểu không? (Để Jami giải đáp)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="VD: Cách biến đổi công thức ở ví dụ 2..."
                    value={checkinForm.reflection}
                    onChange={(e) => setCheckinForm((prev) => ({ ...prev, reflection: e.target.value }))}
                    className="w-full bg-[#101A13] border border-[rgba(34,197,94,0.2)] rounded-xl p-2.5 text-xs text-[#F3FAF5] focus:outline-none focus:border-[#22C55E]"
                  />
                </div>
              </div>
            )}

            {/* Actions Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-[rgba(34,197,94,0.18)]">
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
          </div>
        </div>
      )}
    </div>
  );
};
