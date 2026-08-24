import React, { useState, useEffect } from 'react';
import {
  Bell,
  Clock,
  GraduationCap,
  AlertTriangle,
  Check,
  RefreshCw,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { NotificationItem } from '../../../shared/types';
import { useNavigate } from 'react-router-dom';

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await api.getNotifications();
      setNotifications(res.notifications);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const markAllAsRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(notifications.map((n) => ({ ...n, status: 'read' })));
    } catch {}
  };

  const handleNotificationClick = async (n: NotificationItem) => {
    if (n.status === 'unread') {
      try {
        await api.markNotificationRead(n.id);
        setNotifications(notifications.map((item) => (item.id === n.id ? { ...item, status: 'read' } : item)));
      } catch {}
    }
    if (n.actionUrl) {
      navigate(n.actionUrl);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'session_upcoming':
      case 'upcoming_class':
        return <Clock className="w-4 h-4 text-[#22C55E]" />;
      case 'exam_countdown':
      case 'upcoming_exam':
        return <GraduationCap className="w-4 h-4 text-purple-400" />;
      case 'task_missed':
      case 'incomplete_task':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      default:
        return <Bell className="w-4 h-4 text-[#86EFAC]" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-[#F3FAF5] flex items-center gap-2">
            <Bell className="w-6 h-6 text-[#22C55E]" />
            <span>Trung Tâm Thông Báo & Nhắc Nhở</span>
          </h1>
          <p className="text-xs text-[#A9B8AE] mt-0.5">
            Nhắc lịch học sắp tới, kỳ thi quan trọng và nhiệm vụ cần hoàn thành
          </p>
        </div>

        <button
          onClick={markAllAsRead}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#101A13] hover:bg-[#142219] text-[#F3FAF5] border border-[rgba(34,197,94,0.2)] font-bold text-xs transition-colors cursor-pointer"
        >
          <Check className="w-4 h-4 text-[#22C55E]" />
          <span>Đánh dấu đã đọc tất cả</span>
        </button>
      </div>

      {/* Notification Items List */}
      {loading ? (
        <div className="p-12 text-center text-xs text-[#A9B8AE] flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[#22C55E]" />
          <span>Đang tải thông báo...</span>
        </div>
      ) : notifications.length === 0 ? (
        <div className="p-12 text-center bg-[#0B120D] rounded-3xl border border-[rgba(34,197,94,0.2)] text-xs text-[#A9B8AE]">
          Không có thông báo mới nào.
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={`p-5 rounded-3xl border transition-all cursor-pointer flex items-start gap-4 ${
                n.status === 'unread'
                  ? 'bg-[#101A13] border-[#22C55E]/40 hover:border-[#22C55E] shadow-xl'
                  : 'bg-[#0B120D] border-[rgba(34,197,94,0.18)] hover:border-[rgba(34,197,94,0.35)]'
              }`}
            >
              <div className="w-10 h-10 rounded-2xl bg-[#050806] border border-[rgba(34,197,94,0.2)] flex items-center justify-center shrink-0 shadow-sm">
                {getIcon(n.type)}
              </div>

              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#F3FAF5]">{n.title}</h3>
                  <span className="text-[11px] text-[#A9B8AE]">
                    {n.deliveredAt ? new Date(n.deliveredAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'Hôm nay'}
                  </span>
                </div>
                <p className="text-xs text-[#A9B8AE] leading-relaxed">{n.body}</p>
              </div>

              {n.status === 'unread' && (
                <div className="w-2.5 h-2.5 rounded-full bg-[#22C55E] shrink-0 mt-2 ring-4 ring-[#22C55E]/20" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
