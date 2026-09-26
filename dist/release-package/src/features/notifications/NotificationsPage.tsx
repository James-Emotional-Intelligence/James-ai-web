import React, { useState, useEffect } from 'react';
import {
  Bell,
  Clock,
  GraduationCap,
  AlertTriangle,
  Check,
  RefreshCw,
  Sliders,
  Trash2,
  Calendar,
  BookOpen,
  Volume2,
  VolumeX,
  Moon,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  Play,
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import { NotificationItem, NotificationType } from '../../../shared/types';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api-client';

type FilterTab = 'all' | 'unread' | 'class' | 'exam' | 'task';

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    preferences,
    isLoading,
    isPreferencesLoading,
    error,
    hasMore,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    updatePreferences,
    playNotificationSound,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);

  // Settings local draft state
  const [draftPrefs, setDraftPrefs] = useState({
    upcomingClass: true,
    upcomingExam: true,
    incompleteTask: true,
    soundEnabled: true,
    classLeadMinutes: 15,
    taskLeadMinutes: 30,
    examLeadDays: 1,
    quietHoursStart: '22:30',
    quietHoursEnd: '06:30',
    inAppEnabled: true,
    webPushEnabled: false,
  });

  useEffect(() => {
    if (preferences) {
      setDraftPrefs({
        upcomingClass: preferences.upcomingClass,
        upcomingExam: preferences.upcomingExam,
        incompleteTask: preferences.incompleteTask,
        soundEnabled: preferences.soundEnabled,
        classLeadMinutes: preferences.classLeadMinutes || 15,
        taskLeadMinutes: preferences.taskLeadMinutes || 30,
        examLeadDays: preferences.examLeadDays || 1,
        quietHoursStart: preferences.quietHoursStart || '22:30',
        quietHoursEnd: preferences.quietHoursEnd || '06:30',
        inAppEnabled: preferences.inAppEnabled,
        webPushEnabled: preferences.webPushEnabled,
      });
    }
  }, [preferences]);

  // Tab change handler
  useEffect(() => {
    let typeParam: string | undefined = undefined;
    let statusParam: string | undefined = undefined;

    if (activeTab === 'unread') {
      statusParam = 'unread';
    } else if (activeTab === 'class') {
      typeParam = 'upcoming_class';
    } else if (activeTab === 'exam') {
      typeParam = 'upcoming_exam';
    } else if (activeTab === 'task') {
      typeParam = 'task';
    }

    fetchNotifications(true, typeParam, statusParam);
  }, [activeTab, fetchNotifications]);

  const handleNotificationClick = async (n: NotificationItem) => {
    if (n.status === 'unread') {
      await markAsRead(n.id);
    }
    if (n.actionUrl) {
      navigate(n.actionUrl);
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await updatePreferences(draftPrefs);
    if (ok) {
      setSettingsSuccess(true);
      setTimeout(() => {
        setSettingsSuccess(false);
        setIsSettingsOpen(false);
      }, 1500);
    }
  };

  const handleEnableWebPush = async () => {
    if (!('Notification' in window)) {
      alert('Trình duyệt của bạn không hỗ trợ Web Push Notification.');
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setPushStatus('Đã cấp quyền thông báo Web Push thành công!');
        setDraftPrefs((prev) => ({ ...prev, webPushEnabled: true }));
        await updatePreferences({ webPushEnabled: true });
      } else {
        setPushStatus('Bạn đã từ chối quyền Web Push trên trình duyệt.');
      }
    } catch {
      setPushStatus('Không thể kích hoạt quyền Web Push.');
    }
  };

  const formatNotificationTime = (dateStr?: string) => {
    if (!dateStr) return 'Vừa xong';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const isToday =
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

      const timeFormatted = date.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      if (isToday) {
        return `Hôm nay, ${timeFormatted}`;
      }

      const dateFormatted = date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
      });
      return `${dateFormatted}, ${timeFormatted}`;
    } catch {
      return dateStr;
    }
  };

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'upcoming_class':
        return <Clock className="w-5 h-5 text-[#22C55E]" />;
      case 'upcoming_exam':
        return <GraduationCap className="w-5 h-5 text-purple-400" />;
      case 'task_due':
      case 'incomplete_task':
      case 'task_overdue':
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case 'focus_upcoming':
        return <BookOpen className="w-5 h-5 text-blue-400" />;
      default:
        return <Bell className="w-5 h-5 text-[#86EFAC]" />;
    }
  };

  const getCategoryBadge = (type: NotificationType) => {
    switch (type) {
      case 'upcoming_class':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30">Lịch học</span>;
      case 'upcoming_exam':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-950/60 text-purple-300 border border-purple-800/40">Kỳ thi</span>;
      case 'task_due':
      case 'incomplete_task':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-950/60 text-amber-300 border border-amber-800/40">Nhiệm vụ</span>;
      case 'task_overdue':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-950/60 text-rose-300 border border-rose-800/40">Quá hạn</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#101A13] text-[#A9B8AE]">Hệ thống</span>;
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="bg-[#0B120D] p-5 sm:p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-black text-[#F3FAF5] flex items-center gap-2.5">
            <Bell className="w-6 h-6 text-[#22C55E]" />
            <span>Trung Tâm Thông Báo & Nhắc Nhở</span>
            {unreadCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-[#22C55E] text-[#050806] shadow-sm">
                {unreadCount} chưa đọc
              </span>
            )}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              playNotificationSound();
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#86EFAC] border border-[rgba(34,197,94,0.2)] font-bold text-xs transition-colors cursor-pointer"
            title="Thử âm thanh robot Jami"
          >
            <Volume2 className="w-4 h-4 text-[#22C55E]" />
            <span className="hidden sm:inline">Thử chuông</span>
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#86EFAC] border border-[rgba(34,197,94,0.2)] font-bold text-xs transition-colors cursor-pointer"
            title="Cài đặt thông báo"
          >
            <Sliders className="w-4 h-4 text-[#22C55E]" />
            <span className="hidden sm:inline">Cài đặt</span>
          </button>

          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-black text-xs transition-all shadow-md cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Đọc tất cả</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'all'
              ? 'bg-[#16A34A] text-[#050806] shadow-md'
              : 'bg-[#0B120D] text-[#A9B8AE] hover:text-[#F3FAF5] border border-[rgba(34,197,94,0.18)]'
          }`}
        >
          Tất cả
        </button>
        <button
          onClick={() => setActiveTab('unread')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'unread'
              ? 'bg-[#16A34A] text-[#050806] shadow-md'
              : 'bg-[#0B120D] text-[#A9B8AE] hover:text-[#F3FAF5] border border-[rgba(34,197,94,0.18)]'
          }`}
        >
          <span>Chưa đọc</span>
          {unreadCount > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              activeTab === 'unread' ? 'bg-[#050806] text-[#86EFAC]' : 'bg-[#14532D] text-[#86EFAC]'
            }`}>
              {unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('class')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'class'
              ? 'bg-[#16A34A] text-[#050806] shadow-md'
              : 'bg-[#0B120D] text-[#A9B8AE] hover:text-[#F3FAF5] border border-[rgba(34,197,94,0.18)]'
          }`}
        >
          Lịch học
        </button>
        <button
          onClick={() => setActiveTab('exam')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'exam'
              ? 'bg-[#16A34A] text-[#050806] shadow-md'
              : 'bg-[#0B120D] text-[#A9B8AE] hover:text-[#F3FAF5] border border-[rgba(34,197,94,0.18)]'
          }`}
        >
          Kỳ thi
        </button>
        <button
          onClick={() => setActiveTab('task')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'task'
              ? 'bg-[#16A34A] text-[#050806] shadow-md'
              : 'bg-[#0B120D] text-[#A9B8AE] hover:text-[#F3FAF5] border border-[rgba(34,197,94,0.18)]'
          }`}
        >
          Nhiệm vụ & Quá hạn
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 rounded-2xl text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchNotifications(true)}
            className="px-3 py-1 bg-rose-900 text-white font-bold rounded-lg cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Notification Items List */}
      {isLoading && notifications.length === 0 ? (
        <div className="p-16 text-center text-xs text-[#A9B8AE] flex items-center justify-center gap-2.5">
          <RefreshCw className="w-5 h-5 animate-spin text-[#22C55E]" />
          <span>Đang đồng bộ thông báo mới nhất...</span>
        </div>
      ) : notifications.length === 0 ? (
        <div className="p-16 text-center bg-[#0B120D] rounded-3xl border border-[rgba(34,197,94,0.2)] text-xs text-[#A9B8AE] space-y-2">
          <CheckCircle2 className="w-8 h-8 text-[#22C55E] mx-auto opacity-75" />
          <p className="font-bold text-sm text-[#F3FAF5]">Không có thông báo nào trong mục này</p>
          <p className="text-[11px]">Hệ thống sẽ tự động gửi nhắc nhở khi đến giờ học hoặc các mốc quan trọng.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => {
            const isExam = n.type === 'upcoming_exam';
            const isOverdue = n.type === 'task_overdue' || n.type === 'incomplete_task';

            return (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`p-4 sm:p-5 rounded-3xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4 group ${
                  n.status === 'unread'
                    ? 'bg-[#101A13] border-[#22C55E]/40 hover:border-[#22C55E] shadow-xl'
                    : 'bg-[#0B120D] border-[rgba(34,197,94,0.18)] hover:border-[rgba(34,197,94,0.35)] opacity-85 hover:opacity-100'
                }`}
              >
                <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-[#050806] border border-[rgba(34,197,94,0.2)] flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                    {getIcon(n.type)}
                  </div>

                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        {getCategoryBadge(n.type)}
                        <h3 className="text-xs sm:text-sm font-bold text-[#F3FAF5] truncate">{n.title}</h3>
                      </div>
                      <span className="text-[11px] text-[#A9B8AE] font-mono">
                        {formatNotificationTime(n.deliveredAt || n.createdAt)}
                      </span>
                    </div>

                    <p className="text-xs text-[#A9B8AE] leading-relaxed break-words">{n.body}</p>

                    {/* Interactive Action Quick Buttons */}
                    <div className="pt-2 flex flex-wrap items-center gap-2">
                      {isExam && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/exams');
                          }}
                          className="flex items-center gap-1 px-3 py-1 bg-[#14532D] hover:bg-[#16A34A] text-[#86EFAC] hover:text-[#050806] rounded-xl text-[11px] font-bold transition-all cursor-pointer"
                        >
                          <Play className="w-3 h-3" />
                          <span>Luyện đề ngay</span>
                        </button>
                      )}

                      {isOverdue && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate('/tasks');
                            }}
                            className="flex items-center gap-1 px-3 py-1 bg-[#14532D] hover:bg-[#16A34A] text-[#86EFAC] hover:text-[#050806] rounded-xl text-[11px] font-bold transition-all cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            <span>Mở nhiệm vụ</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate('/timetable');
                            }}
                            className="flex items-center gap-1 px-3 py-1 bg-[#101A13] hover:bg-[#142219] text-amber-300 border border-amber-800/40 rounded-xl text-[11px] font-bold transition-all cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3 text-amber-400" />
                            <span>Xếp lại lịch</span>
                          </button>
                        </>
                      )}

                      {n.actionUrl && !isExam && !isOverdue && (
                        <div className="flex items-center gap-1 text-[11px] font-bold text-[#86EFAC] group-hover:text-[#22C55E] transition-colors">
                          <span>Xem chi tiết</span>
                          <ExternalLink className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {n.status === 'unread' && (
                    <span
                      className="w-2.5 h-2.5 rounded-full bg-[#22C55E] ring-4 ring-[#22C55E]/20"
                      title="Chưa đọc"
                    />
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNotification(n.id);
                    }}
                    className="p-2 rounded-xl text-[#526356] hover:text-rose-400 hover:bg-rose-950/30 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                    title="Xóa thông báo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Load More Button */}
          {hasMore && (
            <div className="pt-2 text-center">
              <button
                onClick={() => fetchNotifications(false)}
                disabled={isLoading}
                className="px-6 py-2.5 rounded-2xl bg-[#0B120D] hover:bg-[#101A13] text-[#86EFAC] border border-[rgba(34,197,94,0.25)] font-bold text-xs transition-colors cursor-pointer"
              >
                {isLoading ? 'Đang tải thêm...' : 'Tải thêm thông báo'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#0B120D] border border-[rgba(34,197,94,0.3)] rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[rgba(34,197,94,0.15)] pb-4">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#22C55E]" />
                <h2 className="text-base font-black text-[#F3FAF5]">Cài Đặt Tùy Chọn Thông Báo</h2>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 rounded-xl hover:bg-[#142219] text-[#A9B8AE] hover:text-[#F3FAF5] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {settingsSuccess && (
              <div className="p-3 bg-[#14532D]/40 border border-[#22C55E]/40 rounded-2xl text-[#86EFAC] text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                <span>Đã lưu cài đặt thông báo thành công!</span>
              </div>
            )}

            <form onSubmit={handleSavePreferences} className="space-y-4 text-xs">
              {/* Category Toggles */}
              <div className="space-y-3 p-4 bg-[#101A13] rounded-2xl border border-[rgba(34,197,94,0.15)]">
                <h3 className="font-bold text-[#F3FAF5] text-xs">Loại thông báo kích hoạt</h3>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-[#A9B8AE]">Nhắc tiết học theo thời khóa biểu</span>
                  <input
                    type="checkbox"
                    checked={draftPrefs.upcomingClass}
                    onChange={(e) => setDraftPrefs({ ...draftPrefs, upcomingClass: e.target.checked })}
                    className="accent-[#16A34A] w-4 h-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-[#A9B8AE]">Nhắc mốc ôn thi (D-14, D-7, D-3, D-1)</span>
                  <input
                    type="checkbox"
                    checked={draftPrefs.upcomingExam}
                    onChange={(e) => setDraftPrefs({ ...draftPrefs, upcomingExam: e.target.checked })}
                    className="accent-[#16A34A] w-4 h-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-[#A9B8AE]">Nhắc nhiệm vụ bài tập đến hạn / quá hạn</span>
                  <input
                    type="checkbox"
                    checked={draftPrefs.incompleteTask}
                    onChange={(e) => setDraftPrefs({ ...draftPrefs, incompleteTask: e.target.checked })}
                    className="accent-[#16A34A] w-4 h-4 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-[#A9B8AE]">Âm thanh robot Jami khi ứng dụng đang mở</span>
                  <input
                    type="checkbox"
                    checked={draftPrefs.soundEnabled}
                    onChange={(e) => setDraftPrefs({ ...draftPrefs, soundEnabled: e.target.checked })}
                    className="accent-[#16A34A] w-4 h-4 cursor-pointer"
                  />
                </label>
              </div>

              {/* Lead Times */}
              <div className="space-y-3 p-4 bg-[#101A13] rounded-2xl border border-[rgba(34,197,94,0.15)]">
                <h3 className="font-bold text-[#F3FAF5] text-xs">Thời gian nhắc trước (Lead Time)</h3>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-[#A9B8AE]">Nhắc tiết học trước:</span>
                  <select
                    value={draftPrefs.classLeadMinutes}
                    onChange={(e) => setDraftPrefs({ ...draftPrefs, classLeadMinutes: Number(e.target.value) })}
                    className="bg-[#050806] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer [&>option]:bg-[#050806] [&>option]:text-[#F3FAF5]"
                  >
                    <option value={5}>5 phút</option>
                    <option value={10}>10 phút</option>
                    <option value={15}>15 phút</option>
                    <option value={30}>30 phút</option>
                    <option value={45}>45 phút</option>
                  </select>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-[#A9B8AE]">Nhắc phiên học / nhiệm vụ trước:</span>
                  <select
                    value={draftPrefs.taskLeadMinutes}
                    onChange={(e) => setDraftPrefs({ ...draftPrefs, taskLeadMinutes: Number(e.target.value) })}
                    className="bg-[#050806] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer [&>option]:bg-[#050806] [&>option]:text-[#F3FAF5]"
                  >
                    <option value={15}>15 phút</option>
                    <option value={30}>30 phút</option>
                    <option value={45}>45 phút</option>
                    <option value={60}>60 phút</option>
                  </select>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-[#A9B8AE]">Nhắc kỳ thi trước:</span>
                  <select
                    value={draftPrefs.examLeadDays}
                    onChange={(e) => setDraftPrefs({ ...draftPrefs, examLeadDays: Number(e.target.value) })}
                    className="bg-[#050806] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer [&>option]:bg-[#050806] [&>option]:text-[#F3FAF5]"
                  >
                    <option value={1}>1 ngày</option>
                    <option value={3}>3 ngày</option>
                    <option value={7}>7 ngày</option>
                    <option value={14}>14 ngày</option>
                  </select>
                </div>
              </div>

              {/* Web Push & Channels */}
              <div className="space-y-3 p-4 bg-[#101A13] rounded-2xl border border-[rgba(34,197,94,0.15)]">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-[#F3FAF5] text-xs">Web Push Notification</h3>
                  <button
                    type="button"
                    onClick={handleEnableWebPush}
                    className="px-3 py-1 rounded-xl bg-[#14532D] text-[#86EFAC] font-bold text-[11px] hover:bg-[#16A34A] hover:text-[#050806] cursor-pointer"
                  >
                    Bật Web Push
                  </button>
                </div>
                {pushStatus && (
                  <p className="text-[11px] text-[#86EFAC] font-semibold">{pushStatus}</p>
                )}
              </div>

              {/* Quiet Hours */}
              <div className="space-y-3 p-4 bg-[#101A13] rounded-2xl border border-[rgba(34,197,94,0.15)]">
                <div className="flex items-center gap-2">
                  <Moon className="w-4 h-4 text-purple-400" />
                  <h3 className="font-bold text-[#F3FAF5] text-xs">Khung giờ yên tĩnh (Quiet Hours)</h3>
                </div>
                <p className="text-[11px] text-[#A9B8AE]">
                  Thông báo trong khung giờ này sẽ được hoãn đến sáng hôm sau mà không bị thất lạc.
                </p>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] text-[#A9B8AE] mb-1">Bắt đầu:</label>
                    <input
                      type="time"
                      value={draftPrefs.quietHoursStart}
                      onChange={(e) => setDraftPrefs({ ...draftPrefs, quietHoursStart: e.target.value })}
                      className="w-full bg-[#050806] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] rounded-xl px-3 py-1.5 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#A9B8AE] mb-1">Kết thúc:</label>
                    <input
                      type="time"
                      value={draftPrefs.quietHoursEnd}
                      onChange={(e) => setDraftPrefs({ ...draftPrefs, quietHoursEnd: e.target.value })}
                      className="w-full bg-[#050806] border border-[rgba(34,197,94,0.25)] text-[#F3FAF5] rounded-xl px-3 py-1.5 text-xs font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#A9B8AE] font-bold text-xs cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isPreferencesLoading}
                  className="px-5 py-2 rounded-xl bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-black text-xs transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isPreferencesLoading ? 'Đang lưu...' : 'Lưu tùy chọn'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
