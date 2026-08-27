import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Mic,
  Bell,
  User as UserIcon,
  Menu,
  Sparkles,
  Settings,
  Shield,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { User, StudentProfile } from '../../../shared/types';

import { useVoiceJami } from '../../context/VoiceJamiContext';
import { useNotifications } from '../../context/NotificationContext';
import { Power } from 'lucide-react';

interface TopAppBarProps {
  user?: User;
  profile?: StudentProfile;
  onOpenVoiceModal: () => void;
  onToggleMobileMenu: () => void;
  onLogout: () => void;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({
  user,
  profile,
  onOpenVoiceModal,
  onToggleMobileMenu,
  onLogout,
}) => {
  const navigate = useNavigate();
  const voice = useVoiceJami();
  const { unreadCount } = useNotifications();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayName = user?.preferredName || user?.displayName || 'Học sinh';
  const grade = profile?.gradeLevel || 9;

  return (
    <header className="w-full bg-[#050806] border-b border-[rgba(34,197,94,0.25)] sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand Identity + Tagline */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onToggleMobileMenu}
            className="lg:hidden p-2 rounded-lg text-[#A9B8AE] hover:text-[#F3FAF5] bg-[#101A13] border border-[rgba(34,197,94,0.18)] cursor-pointer"
            aria-label="Mở menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link to="/today" className="flex items-center gap-2.5 group shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#16A34A] to-[#14532D] flex items-center justify-center text-[#F3FAF5] font-black text-base shadow-lg shadow-[#16A34A]/25 border border-[#22C55E]/40 group-hover:scale-105 transition-transform">
              J
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-base tracking-wider text-[#F3FAF5]">JAMI AI</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#14532D] text-[#86EFAC] font-bold border border-[#22C55E]/30 hidden sm:inline-block">
                  LỚP {grade}
                </span>
              </div>
              <span className="text-[10px] text-[#A9B8AE] tracking-tight font-medium hidden md:inline-block truncate max-w-sm">
                TRỢ LÝ AI LẬP KẾ HOẠCH VÀ ĐỒNG HÀNH HỌC TẬP CÁ NHÂN HÓA
              </span>
            </div>
          </Link>
        </div>

        {/* Right: Actions, Voice Goal, Notifications, Profile */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Hands-Free Jami Voice Status / Toggle */}
          {voice.isHandsFreeEnabled ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#14532D]/80 border border-[#22C55E]/40 text-[#86EFAC] text-xs font-bold shadow-md shadow-[#16A34A]/20">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#22C55E]" />
              </span>
              <span className="hidden md:inline font-semibold">Đang nghe "Jami ơi"</span>
              <span className="font-mono text-[11px] text-[#22C55E]">({formatDuration(voice.sessionDuration)})</span>
              <button
                onClick={voice.disableHandsFree}
                className="ml-1 px-2 py-0.5 rounded-md bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[10px] font-extrabold flex items-center gap-1 cursor-pointer transition-colors"
                title="Tắt chế độ rảnh tay và giải phóng micro"
              >
                <Power className="w-3 h-3" />
                <span>Tắt</span>
              </button>
            </div>
          ) : (
            <button
              onClick={voice.enableHandsFree}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#101A13] hover:bg-[#142219] border border-[rgba(34,197,94,0.3)] hover:border-[#22C55E] text-[#86EFAC] font-bold text-xs shadow-sm transition-all hover:scale-[1.02] cursor-pointer"
              title="Bật lắng nghe từ khóa Jami ơi rảnh tay"
            >
              <Mic className="w-3.5 h-3.5 text-[#22C55E]" />
              <span className="hidden sm:inline">Bật Jami rảnh tay</span>
              <span className="sm:hidden">Rảnh tay</span>
            </button>
          )}

          {/* Nói mục tiêu với Jami Button */}
          <button
            onClick={onOpenVoiceModal}
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] font-bold text-xs shadow-md shadow-[#16A34A]/25 transition-all hover:scale-[1.02] cursor-pointer"
            title="Lên lịch học tự động bằng giọng nói"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#050806]" />
            <span className="font-extrabold tracking-wide">Nói mục tiêu</span>
          </button>

          {/* Notifications Bell */}
          <Link
            to="/notifications"
            className="relative p-2 rounded-xl text-[#A9B8AE] hover:text-[#F3FAF5] bg-[#101A13] hover:bg-[#142219] border border-[rgba(34,197,94,0.18)] transition-colors"
            aria-label={`Thông báo (${unreadCount} chưa đọc)`}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#22C55E] text-[#050806] font-black text-[10px] flex items-center justify-center ring-2 ring-[#050806] shadow-sm">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>

          {/* User Profile Dropdown */}
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-[#101A13] hover:bg-[#142219] border border-[rgba(34,197,94,0.2)] text-[#F3FAF5] transition-colors cursor-pointer"
              aria-expanded={isProfileMenuOpen}
              aria-label="Menu tài khoản"
            >
              <div className="w-7 h-7 rounded-lg bg-[#14532D] text-[#86EFAC] flex items-center justify-center font-bold text-xs border border-[#22C55E]/30">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-bold text-[#F3FAF5] leading-tight truncate max-w-[100px]">
                  {displayName}
                </span>
                <span className="text-[10px] text-[#A9B8AE] leading-tight">Học sinh</span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-[#A9B8AE] hidden sm:block" />
            </button>

            {/* Profile Dropdown Menu */}
            {isProfileMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-[#0B120D] border border-[rgba(34,197,94,0.25)] rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="p-2.5 border-b border-[rgba(34,197,94,0.15)]">
                  <div className="text-xs font-bold text-[#F3FAF5]">{user?.displayName || displayName}</div>
                  <div className="text-[11px] text-[#A9B8AE] truncate">{user?.email || 'Học sinh JAMI'}</div>
                </div>

                <div className="py-1 space-y-0.5">
                  <Link
                    to="/settings"
                    onClick={() => setIsProfileMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#101A13] transition-colors"
                  >
                    <Settings className="w-4 h-4 text-[#86EFAC]" />
                    <span>Cài đặt & Hồ sơ</span>
                  </Link>
                  <Link
                    to="/settings"
                    onClick={() => setIsProfileMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#101A13] transition-colors"
                  >
                    <Shield className="w-4 h-4 text-[#86EFAC]" />
                    <span>Quyền riêng tư & Dữ liệu</span>
                  </Link>
                </div>

                <div className="pt-1 border-t border-[rgba(34,197,94,0.15)] mt-1">
                  <button
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition-colors cursor-pointer"
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
