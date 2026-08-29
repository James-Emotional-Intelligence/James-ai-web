import React, { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Mic,
  Bell,
  Menu,
  Sparkles,
  Settings,
  Shield,
  LogOut,
  ChevronDown,
  Layers,
  ChevronRight,
  Power,
} from 'lucide-react';
import { User, StudentProfile } from '../../../shared/types';
import { MODULES_CONFIG } from '../../config/modules';
import { useVoiceJami } from '../../context/VoiceJamiContext';
import { useNotifications } from '../../context/NotificationContext';

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
  const location = useLocation();
  const voice = useVoiceJami();
  const { unreadCount } = useNotifications();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const [selectedGroup, setSelectedGroup] = useState<'1-4' | '5-8' | 'admin'>('1-4');

  // Auto-switch group if user navigates to a route in 5-8, 1-4, or admin
  useEffect(() => {
    if (location.pathname.startsWith('/admin')) {
      setSelectedGroup('admin');
      return;
    }
    const currentModule = MODULES_CONFIG.find(
      (m) => location.pathname === m.path || location.pathname.startsWith(m.path + '/')
    );
    if (currentModule) {
      if (currentModule.order >= 5) {
        setSelectedGroup('5-8');
      } else {
        setSelectedGroup('1-4');
      }
    }
  }, [location.pathname]);

  const toggleGroup = () => {
    setSelectedGroup((prev) => (prev === '5-8' ? '1-4' : '5-8'));
  };

  const isGroup58 = selectedGroup === '5-8';
  const visibleModules = MODULES_CONFIG.filter((m) =>
    isGroup58 ? m.order >= 5 : m.order <= 4
  );

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
    <header className="w-full bg-[#050806] border-b border-[rgba(34,197,94,0.25)] sticky top-0 z-40 shadow-xl">
      <div className="max-w-[1750px] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-[1fr_auto] items-center">
        {/* ROW 1 - LEFT: Brand Identity + Tagline */}
        <div className="h-16 flex items-center gap-3 min-w-0 pr-4">
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

        {/* ROW 1 - RIGHT: Actions (Bật Jami, Nói mục tiêu, Notifications, Profile) */}
        <div className="h-16 flex items-center gap-2 sm:gap-3 shrink-0">
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

          {/* Admin Panel Quick Access Button */}
          {user?.role === 'admin' && (
            <Link
              to="/admin"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-500/40 text-purple-200 text-xs font-bold shadow-md shadow-purple-950/40 transition-colors"
              title="Mở Bảng Quản Trị Hệ Thống"
            >
              <Shield className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Quản trị Admin</span>
            </Link>
          )}

          {/* User Profile Dropdown */}
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-[#101A13] hover:bg-[#142219] border border-[rgba(34,197,94,0.2)] text-[#F3FAF5] transition-colors cursor-pointer"
              aria-expanded={isProfileMenuOpen}
              aria-label="Menu tài khoản"
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs border ${
                  user?.role === 'admin'
                    ? 'bg-purple-950 text-purple-300 border-purple-500/40'
                    : 'bg-[#14532D] text-[#86EFAC] border-[#22C55E]/30'
                }`}
              >
                {user?.role === 'admin' ? <Shield className="w-4 h-4 text-purple-400" /> : displayName.charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-bold text-[#F3FAF5] leading-tight truncate max-w-[100px]">
                  {displayName}
                </span>
                <span className="text-[10px] text-[#A9B8AE] leading-tight">
                  {user?.role === 'admin' ? 'Quản trị viên' : 'Học sinh'}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-[#A9B8AE] hidden sm:block" />
            </button>

            {/* Profile Dropdown Menu */}
            {isProfileMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-[#0B120D] border border-[rgba(34,197,94,0.25)] rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="p-2.5 border-b border-[rgba(34,197,94,0.15)]">
                  <div className="text-xs font-bold text-[#F3FAF5] flex items-center justify-between">
                    <span>{user?.displayName || displayName}</span>
                    {user?.role === 'admin' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-500/30 font-bold">
                        ADMIN
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#A9B8AE] truncate">{user?.email || 'Học sinh JAMI'}</div>
                </div>

                <div className="py-1 space-y-0.5">
                  {user?.role === 'admin' && (
                    <Link
                      to="/admin"
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-purple-300 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-500/30 transition-colors"
                    >
                      <Shield className="w-4 h-4 text-purple-400" />
                      <span>Bảng điều khiển Admin</span>
                    </Link>
                  )}
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

        {/* HORIZONTAL DIVIDER ACROSS BOTH COLUMNS */}
        <div className="col-span-2 border-t border-[rgba(34,197,94,0.18)]" />

        {/* ROW 2 - LEFT: 8 Strict Modules Horizontal Navigation */}
        <div className="py-1.5 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar min-w-0 pr-4">
          {visibleModules.map((item, index) => (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-1.5 sm:gap-2 ${index === 0 ? 'pl-0 pr-3' : 'px-2.5 sm:px-3'} py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap group shrink-0 ${
                  isActive
                    ? 'bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/40 shadow-sm shadow-[#16A34A]/20'
                    : 'text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#101A13] border border-transparent'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${
                      isActive
                        ? 'bg-[#22C55E] text-[#050806]'
                        : 'bg-[#101A13] text-[#A9B8AE] group-hover:text-[#F3FAF5] group-hover:bg-[#142219]'
                    }`}
                  >
                    {item.order}
                  </div>
                  <item.icon
                    className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-colors ${
                      isActive ? 'text-[#86EFAC]' : 'text-[#A9B8AE] group-hover:text-[#22C55E]'
                    }`}
                  />
                  <span className="tracking-wide text-[11px] sm:text-xs">{item.name}</span>
                </>
              )}
            </NavLink>
          ))}

          {/* Exclusive Admin Quick Access Tab */}
          {user?.role === 'admin' && (
            <>
              <div className="h-5 w-px bg-purple-500/40 shrink-0" />
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap group shrink-0 ${
                    isActive
                      ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white border border-purple-300 shadow-lg shadow-purple-600/40 ring-2 ring-purple-400'
                      : 'bg-purple-950/80 hover:bg-purple-900 border border-purple-500/50 text-purple-200 shadow-md'
                  }`
                }
              >
                <Shield className="w-4 h-4 text-purple-300 animate-pulse shrink-0" />
                <span className="tracking-wide uppercase font-extrabold">👑 QUẢN TRỊ ADMIN (BAN / XÓA TK)</span>
              </NavLink>
            </>
          )}
        </div>

        {/* ROW 2 - RIGHT: Switcher Button -> STARTS AT COLUMN 2, EXACTLY UNDER BẬT JAMI BUTTON! */}
        <div className="py-1.5 flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={toggleGroup}
            className="flex items-center gap-2 shrink-0 bg-[#101A13] hover:bg-[#14532D] active:scale-95 border border-[rgba(34,197,94,0.3)] hover:border-[#22C55E]/60 rounded-xl px-3 py-1.5 shadow-md text-xs font-black text-[#86EFAC] transition-all cursor-pointer group"
            title={isGroup58 ? 'Bấm để chuyển sang Mục 1 - 4' : 'Bấm để chuyển sang Mục 5 - 8'}
          >
            <Layers className="w-3.5 h-3.5 text-[#22C55E]" />
            <span>{isGroup58 ? 'Mục 1 - 4' : 'Mục 5 - 8'}</span>
            <div className="flex items-center text-[#86EFAC] bg-[#0B120D] px-1.5 py-0.5 rounded-md border border-[rgba(34,197,94,0.2)] group-hover:border-[#22C55E]/50 group-hover:text-white transition-colors">
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};

