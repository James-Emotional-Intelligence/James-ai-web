import React, { useState, useEffect, useCallback } from 'react';
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
  UserCheck,
  UserX,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { TodayDashboardOverview, StudyTask } from '../../../shared/types';
import { useAuth } from '../auth/AuthProvider';
import confetti from 'canvas-confetti';

export const TodayDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [overview, setOverview] = useState<TodayDashboardOverview | null>(null);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [overviewData, tasksData] = await Promise.all([
        api.getDashboardOverview(),
        api.getTasks(),
      ]);
      setOverview(overviewData);
      setTasks(tasksData.tasks || []);
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
      // Refresh dashboard to reflect updated completion
      await fetchDashboardData();
    } catch (err: any) {
      alert(err.message || 'Không thể đánh dấu hoàn thành nhiệm vụ.');
    } finally {
      setCompletingTaskId(null);
    }
  };

  const getGreeting = (name: string) => {
    const hour = new Date().getHours();
    if (hour < 12) return `Chào buổi sáng, ${name}! Sẵn sàng cho một ngày học tập hiệu quả nhé.`;
    if (hour < 18) return `Chào buổi chiều, ${name}! Hãy duy trì sự tập trung nào.`;
    return `Chào buổi tối, ${name}! Hoàn thành nốt các mục tiêu hôm nay nhé.`;
  };

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

  const todayDateStr = overview.todayDateFormatted || new Date().toISOString().split('T')[0];
  const todayTasks = tasks.filter(
    (t) =>
      (t.scheduledStartAt && t.scheduledStartAt.startsWith(todayDateStr)) ||
      (t.dueAt && t.dueAt.startsWith(todayDateStr))
  );

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
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] text-xs font-black shadow-lg shadow-[#16A34A]/25 transition-all cursor-pointer shrink-0"
          >
            <Play className="w-4 h-4 fill-[#050806]" />
            <span>Bắt đầu Hẹn giờ tập trung</span>
          </button>
        </div>
      </div>

      {/* 4 Stats Highlights Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Actual Focus Today */}
        <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-md space-y-2">
          <div className="flex items-center justify-between text-[#A9B8AE]">
            <span className="text-xs font-bold">Thời gian tập trung</span>
            <Clock className="w-4 h-4 text-[#22C55E]" />
          </div>
          <div className="text-2xl font-black text-[#F3FAF5]">
            {overview.todayStudy.actualFocusMinutes}{' '}
            <span className="text-xs font-normal text-[#86EFAC]">phút</span>
          </div>
          <div className="text-[11px] text-[#A9B8AE]">
            Kế hoạch bài tập: {overview.todayStudy.plannedMinutes} phút
          </div>
        </div>

        {/* Task Completion Rate */}
        <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-md space-y-2">
          <div className="flex items-center justify-between text-[#A9B8AE]">
            <span className="text-xs font-bold">Tiến độ nhiệm vụ</span>
            <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
          </div>
          <div className="text-2xl font-black text-[#F3FAF5]">
            {overview.todayStudy.completedPercent}%
          </div>
          <div className="w-full bg-[#101A13] h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-[#22C55E] h-full rounded-full transition-all duration-500"
              style={{ width: `${overview.todayStudy.completedPercent}%` }}
            />
          </div>
        </div>

        {/* Real Streak Days */}
        <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-md space-y-2">
          <div className="flex items-center justify-between text-[#A9B8AE]">
            <span className="text-xs font-bold">Chuỗi học liên tục</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-[#F3FAF5]">
            {overview.todayStudy.streakDays}{' '}
            <span className="text-xs font-normal text-amber-400">ngày</span>
          </div>
          <div className="text-[11px] text-[#A9B8AE]">
            {overview.todayStudy.streakDays > 0 ? 'Duy trì rất tốt!' : 'Bắt đầu phiên học ngay để tạo chuỗi!'}
          </div>
        </div>

        {/* 7-Day Focus Comparison */}
        <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-md space-y-2">
          <div className="flex items-center justify-between text-[#A9B8AE]">
            <span className="text-xs font-bold">Tổng 7 ngày</span>
            <TrendingUp className="w-4 h-4 text-[#22C55E]" />
          </div>
          <div className="text-2xl font-black text-[#F3FAF5]">
            {Math.round(overview.reports.totalFocusMinutes7Days / 60 * 10) / 10}{' '}
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
          {/* Priority Task Highlight */}
          {overview.tasks.priorityTaskId && (
            <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-[#14532D]/40 to-[#0B120D] border border-[#22C55E]/40 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-rose-950 text-rose-300 border border-rose-800">
                  Nhiệm vụ ưu tiên cao nhất
                </span>
                <span className="text-xs text-[#A9B8AE]">
                  Còn {overview.tasks.pendingCount} nhiệm vụ cần làm
                </span>
              </div>

              <div>
                <h3 className="text-base sm:text-lg font-bold text-[#F3FAF5]">
                  {overview.tasks.priorityTaskTitle}
                </h3>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() =>
                    navigate(`/focus?taskId=${overview.tasks.priorityTaskId}`)
                  }
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#16A34A] text-[#050806] text-xs font-bold hover:bg-[#22C55E] transition-all cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-[#050806]" />
                  <span>Tập trung hoàn thành ngay</span>
                </button>
              </div>
            </div>
          )}

          {/* Today's Tasks List */}
          <div className="bg-[#0B120D] p-5 sm:p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(34,197,94,0.18)]">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#22C55E]" />
                <h2 className="text-sm sm:text-base font-bold text-[#F3FAF5]">
                  Nhiệm vụ học tập hôm nay ({todayTasks.length})
                </h2>
              </div>
              <button
                onClick={() => navigate('/tasks')}
                className="text-xs font-bold text-[#86EFAC] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Xem tất cả</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {todayTasks.length > 0 ? (
              <div className="space-y-2.5">
                {todayTasks.map((t) => {
                  const isDone = t.status === 'completed';
                  const isCompleting = completingTaskId === t.id;

                  return (
                    <div
                      key={t.id}
                      className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isDone
                          ? 'bg-[#101A13]/60 border-[rgba(34,197,94,0.1)] opacity-70'
                          : 'bg-[#101A13] border-[rgba(34,197,94,0.2)] hover:border-[#22C55E]/40'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <button
                          onClick={() => !isDone && handleCompleteTask(t.id)}
                          disabled={isDone || isCompleting}
                          className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 cursor-pointer transition-all ${
                            isDone
                              ? 'bg-[#16A34A] border-[#22C55E] text-[#050806]'
                              : 'border-[rgba(34,197,94,0.3)] hover:border-[#22C55E]'
                          }`}
                        >
                          {isDone && <CheckCircle2 className="w-4 h-4" />}
                        </button>
                        <div className="truncate">
                          <div
                            className={`text-xs sm:text-sm font-semibold truncate ${
                              isDone ? 'line-through text-[#A9B8AE]' : 'text-[#F3FAF5]'
                            }`}
                          >
                            {t.title}
                          </div>
                          <div className="text-[11px] text-[#A9B8AE] flex items-center gap-2 mt-0.5">
                            <span>{t.subjectName}</span>
                            <span>•</span>
                            <span>{t.estimatedMinutes || 30} phút</span>
                          </div>
                        </div>
                      </div>

                      {!isDone && (
                        <button
                          onClick={() => navigate(`/focus?taskId=${t.id}`)}
                          className="px-3 py-1.5 rounded-xl bg-[#14532D] hover:bg-[#16A34A] text-[#86EFAC] hover:text-[#050806] text-xs font-bold transition-all shrink-0 cursor-pointer"
                        >
                          Tập trung
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-[#A9B8AE] space-y-2">
                <CheckCircle2 className="w-8 h-8 text-[#22C55E] opacity-50 mx-auto" />
                <p className="font-bold text-[#F3FAF5]">Hôm nay chưa có bài tập nào được lên lịch.</p>
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
                    Còn {overview.exams.daysRemaining} ngày
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
    </div>
  );
};
