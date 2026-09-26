import React, { useState, useEffect, useRef } from 'react';
import { Bell, Mic, ShieldCheck, Sparkles, LogOut, Settings, ExternalLink } from 'lucide-react';
import { formatDateVN } from '../../lib/utils';
import { api } from '../../lib/api-client';
import { NotificationItem } from '../../../shared/types';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';

interface HeaderProps {
  onOpenVoiceModal?: () => void;
  onOpenJamiDrawer?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenVoiceModal,
}) => {
  const navigate = useNavigate();
  const { user, profile, isDemo, logout } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getNotifications().then((res) => setNotifications(res.notifications)).catch(() => {});
  }, []);

  // Handle outside click & Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNotifMenu(false);
        setShowProfileMenu(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifMenu(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    setShowProfileMenu(false);
    await logout();
    navigate('/', { replace: true });
  };

  const unreadCount = notifications.filter((n) => n.status === 'unread').length;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Mobile branding / Date display */}
        <div className="flex items-center gap-3">
          <Link to="/today" className="flex items-center gap-2 lg:hidden">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white font-bold shadow-md shadow-cyan-500/20">
              J
            </div>
            <span className="font-extrabold text-lg tracking-tight text-slate-900">
              JAMI<span className="text-blue-600 ml-0.5">AI</span>
            </span>
          </Link>
          <div className="hidden lg:block text-xs font-semibold text-slate-500">
            <span className="capitalize">{formatDateVN(new Date())}</span>
          </div>
        </div>

        {/* Center: Primary Voice Action Button */}
        <button
          type="button"
          onClick={onOpenVoiceModal}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-blue-500/25 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
        >
          <Mic className="w-4 h-4 animate-pulse text-cyan-300" />
          <span className="hidden sm:inline">Nói mục tiêu với Jami</span>
          <span className="sm:hidden">Nói với Jami</span>
        </button>

        {/* Right: Status Badge, Notification & Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Demo Mode Badge */}
          {isDemo && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Chế độ Demo</span>
            </div>
          )}

          {/* Notifications Dropdown */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => {
                setShowNotifMenu(!showNotifMenu);
                setShowProfileMenu(false);
              }}
              className="relative p-2 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition-colors"
              title="Thông báo"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifMenu && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 p-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="font-bold text-sm text-slate-800">Thông báo học tập</span>
                  <Link
                    to="/notifications"
                    onClick={() => setShowNotifMenu(false)}
                    className="text-xs text-blue-600 hover:underline font-bold"
                  >
                    Xem tất cả
                  </Link>
                </div>
                <div className="mt-2 space-y-2 max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">Không có thông báo mới</div>
                  ) : (
                    notifications.slice(0, 4).map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => {
                          setShowNotifMenu(false);
                          if (notif.actionUrl) navigate(notif.actionUrl);
                        }}
                        className={`p-2.5 rounded-xl cursor-pointer transition-colors ${
                          notif.status === 'unread' ? 'bg-blue-50/70 hover:bg-blue-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="font-bold text-xs text-slate-800">{notif.title}</div>
                        <div className="text-xs text-slate-600 line-clamp-2 mt-0.5">{notif.body}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile Avatar / Menu */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => {
                setShowProfileMenu(!showProfileMenu);
                setShowNotifMenu(false);
              }}
              className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-sm">
                {user?.preferredName?.[0] || user?.displayName?.[0] || 'M'}
              </div>
              <span className="hidden md:inline text-xs font-bold text-slate-700">
                {user?.preferredName || 'Học sinh'} (Lớp {profile?.gradeLevel || 9})
              </span>
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-60 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 p-2 text-xs">
                <div className="p-2.5 border-b border-slate-100">
                  <div className="font-bold text-slate-800">{user?.displayName || 'Học sinh'}</div>
                  <div className="text-slate-500 text-[11px] truncate">{user?.email || 'email@hocsinh.edu.vn'}</div>
                </div>
                <div className="py-1">
                  <Link
                    to="/settings"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 rounded-lg font-medium"
                  >
                    <Settings className="w-4 h-4 text-slate-500" />
                    <span>Cài đặt & Quyền riêng tư</span>
                  </Link>
                  <Link
                    to="/onboarding"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 rounded-lg font-medium"
                  >
                    <Sparkles className="w-4 h-4 text-cyan-600" />
                    <span>Khảo sát lại mục tiêu học sinh</span>
                  </Link>
                  <Link
                    to="/"
                    target="_blank"
                    className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 rounded-lg font-medium"
                  >
                    <ExternalLink className="w-4 h-4 text-slate-400" />
                    <span>Xem Trang giới thiệu</span>
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-lg font-bold"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
