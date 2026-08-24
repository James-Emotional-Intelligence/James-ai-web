import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Play,
  ArrowRight,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { api, DashboardOverviewData } from '../../lib/api-client';
import { MODULES_CONFIG } from '../../config/modules';
import { JamiCommandCenter } from '../../components/jami/JamiCommandCenter';
import { RobotJami, JamiState } from '../../components/jami/RobotJami';

export const TodayDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<DashboardOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Robot Jami state synced with chat center
  const [jamiState, setJamiState] = useState<JamiState>('idle');
  const [robotBubbleMessage, setRobotBubbleMessage] = useState<string>(
    'Chào bạn! Jami đã sẵn sàng đồng hành cùng bạn chinh phục mục tiêu hôm nay.'
  );

  const fetchOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDashboardOverview();
      setOverview(data);
    } catch (err: any) {
      setError(err.message || 'Không thể tải thông tin bảng điều khiển.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const handleJamiStateChange = (newState: JamiState, message?: string) => {
    setJamiState(newState);
    if (message) {
      setRobotBubbleMessage(message);
    }
  };

  const getModuleMetricValue = (moduleId: string): { label: string; subtext: string } => {
    if (!overview) return { label: '...', subtext: 'Chưa có dữ liệu' };

    switch (moduleId) {
      case 'timetable':
        return {
          label: `${overview.timetable.todaySessionsCount} buổi học`,
          subtext: overview.timetable.nextSessionTitle || 'Ôn tập cá nhân',
        };
      case 'tasks':
        return {
          label: `${overview.tasks.pendingCount} nhiệm vụ chờ`,
          subtext: overview.tasks.priorityTaskTitle || 'Hoàn tất nhiệm vụ',
        };
      case 'today':
        return {
          label: `${overview.todayStudy.completedMinutes} / ${overview.todayStudy.plannedMinutes}p (${overview.todayStudy.completedPercent}%)`,
          subtext: `Chuỗi ${overview.todayStudy.streakDays} ngày liên tiếp`,
        };
      case 'jami':
        return {
          label: 'Hội thoại Sẵn sàng',
          subtext: overview.jami.latestMessage || 'Jami AI 24/7',
        };
      case 'exams':
        return {
          label: `Còn ${overview.exams.daysRemaining} ngày`,
          subtext: overview.exams.upcomingTitle || 'Kỳ kiểm tra sắp tới',
        };
      case 'reports':
        return {
          label: `${overview.reports.totalFocusMinutes7Days} phút (7 ngày)`,
          subtext: overview.reports.trendLabel,
        };
      case 'materials':
        return {
          label: `${overview.materials.totalMaterialsCount} tài liệu`,
          subtext: overview.materials.latestMaterialTitle || 'Đã lưu trữ',
        };
      case 'notifications':
        return {
          label: `${overview.notifications.unreadCount} chưa đọc`,
          subtext: overview.notifications.latestTitle || 'Thông báo hệ thống',
        };
      default:
        return { label: 'Sẵn sàng', subtext: 'Bắt đầu ngay' };
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Jami Greeting & Today's Summary Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#101A13] via-[#0B120D] to-[#050806] border border-[rgba(34,197,94,0.3)] text-[#F3FAF5] p-6 sm:p-8 shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#14532D] text-xs font-bold text-[#86EFAC] border border-[#22C55E]/30">
              <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
              <span>Đồng hành cùng Jami AI</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#F3FAF5]">
              Chào {overview?.studentName || 'bạn'}! Hôm nay mình cùng chinh phục mục tiêu học tập nhé.
            </h1>
            <p className="text-xs sm:text-sm text-[#A9B8AE] leading-relaxed">
              "Bắt đầu từng bước nhỏ vững chắc. Hãy tập trung 45 phút học tập hôm nay để nắm vững kiến thức trọng tâm!"
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={() => navigate('/focus')}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] font-extrabold text-xs sm:text-sm shadow-lg shadow-[#16A34A]/25 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-[#050806]" />
              <span>Bắt đầu Hẹn giờ tập trung</span>
            </button>
          </div>
        </div>

        {/* Decorative Glow */}
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[#16A34A]/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-[#14532D]/30 blur-3xl pointer-events-none" />
      </div>

      {/* Main PowerPoint Slide 1 Central Layout: Command Center + Robot Jami */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left / Center Column (2/3 width): Jami Command Center with MySQL Chat History */}
        <div className="lg:col-span-2">
          <JamiCommandCenter
            onStateChange={handleJamiStateChange}
            onDataUpdated={fetchOverview}
          />
        </div>

        {/* Right Column (1/3 width): Robot Jami Display Panel */}
        <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] rounded-3xl p-6 shadow-2xl flex flex-col items-center justify-between text-center min-h-[480px]">
          <div className="w-full flex items-center justify-between border-b border-[rgba(34,197,94,0.18)] pb-3">
            <span className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider">
              Robot Jami 24/7
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E] animate-ping" />
          </div>

          <div className="my-auto py-6 flex flex-col items-center justify-center space-y-4">
            <RobotJami
              state={jamiState}
              size="xl"
              showBubble={true}
              bubbleMessage={robotBubbleMessage}
              onClick={() => navigate('/jami')}
            />
            <div className="space-y-1">
              <div className="text-sm font-black text-[#F3FAF5]">Jami Trợ Lý AI</div>
              <p className="text-xs text-[#A9B8AE]">Nhấp vào Robot để mở trang tư vấn AI chi tiết</p>
            </div>
          </div>

          <button
            onClick={() => navigate('/jami')}
            className="w-full py-2.5 px-4 rounded-xl bg-[#101A13] hover:bg-[#142219] border border-[rgba(34,197,94,0.25)] text-[#86EFAC] hover:text-[#22C55E] font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Trò chuyện trực tiếp với Jami</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* PowerPoint Slide 1 Bottom Section: 8 Functional Module Cards Grid */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#14532D] text-[#86EFAC] flex items-center justify-center text-xs font-black border border-[#22C55E]/30">
              8
            </div>
            <h2 className="text-base sm:text-lg font-black text-[#F3FAF5]">
              Lưới 8 Module Thẻ Chức Năng (Số Liệu Real-time)
            </h2>
          </div>

          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-[#86EFAC]">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Đang cập nhật số liệu...</span>
            </div>
          )}
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={fetchOverview}
              className="px-3 py-1 bg-rose-900 text-white rounded-lg font-bold text-xs cursor-pointer"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* 8 Cards Responsive Grid: Desktop 4x2, Tablet 2x4, Mobile 1x8 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MODULES_CONFIG.map((mod) => {
            const metric = getModuleMetricValue(mod.id);
            return (
              <div
                key={mod.id}
                onClick={() => navigate(mod.path)}
                className="group relative bg-[#0B120D] hover:bg-[#101A13] border border-[rgba(34,197,94,0.22)] hover:border-[#22C55E]/60 rounded-2xl p-5 shadow-xl transition-all hover:scale-[1.02] cursor-pointer flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-8 h-8 rounded-xl bg-[#101A13] group-hover:bg-[#14532D] text-[#A9B8AE] group-hover:text-[#86EFAC] border border-[rgba(34,197,94,0.2)] flex items-center justify-center font-black text-xs transition-colors">
                      {mod.order}
                    </div>
                    <mod.icon className="w-5 h-5 text-[#22C55E] group-hover:scale-110 transition-transform" />
                  </div>

                  <div>
                    <h3 className="text-xs font-black tracking-wide text-[#F3FAF5] group-hover:text-[#86EFAC] transition-colors">
                      {mod.name}
                    </h3>
                    <p className="text-[11px] text-[#A9B8AE] line-clamp-2 mt-1 leading-snug">
                      {mod.description}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[rgba(34,197,94,0.15)] flex items-center justify-between gap-1">
                  <div className="min-w-0">
                    <div className="text-xs font-black text-[#F3FAF5] truncate">
                      {metric.label}
                    </div>
                    <div className="text-[10px] text-[#A9B8AE] truncate">{metric.subtext}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#A9B8AE] group-hover:text-[#22C55E] group-hover:translate-x-1 transition-all shrink-0" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
