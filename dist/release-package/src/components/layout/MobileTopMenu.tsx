import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X, Mic, Settings, LogOut, Shield } from 'lucide-react';
import { MODULES_CONFIG } from '../../config/modules';
import { User, StudentProfile } from '../../../shared/types';

interface MobileTopMenuProps {
  isOpen: boolean;
  onClose: () => void;
  user?: User;
  profile?: StudentProfile;
  onOpenVoiceModal: () => void;
  onLogout: () => void;
}

export const MobileTopMenu: React.FC<MobileTopMenuProps> = ({
  isOpen,
  onClose,
  user,
  profile,
  onOpenVoiceModal,
  onLogout,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#050806]/80 backdrop-blur-md flex flex-col justify-start">
      <div
        ref={menuRef}
        className="w-full bg-[#0B120D] border-b border-[rgba(34,197,94,0.25)] shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between p-4 border-b border-[rgba(34,197,94,0.18)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#16A34A] to-[#14532D] flex items-center justify-center text-[#F3FAF5] font-extrabold text-sm shadow-md shadow-[#16A34A]/20">
              J
            </div>
            <div>
              <div className="font-extrabold text-sm text-[#F3FAF5] tracking-wide">JAMI AI</div>
              <div className="text-[10px] text-[#A9B8AE]">Lớp {profile?.gradeLevel || 9} • {user?.preferredName || user?.displayName || 'Học sinh'}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng menu"
            className="p-2 text-[#A9B8AE] hover:text-[#F3FAF5] rounded-lg bg-[#101A13] border border-[rgba(34,197,94,0.15)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action button */}
        <div className="p-4 border-b border-[rgba(34,197,94,0.12)]">
          <button
            onClick={() => {
              onClose();
              onOpenVoiceModal();
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#16A34A] to-[#15803D] hover:from-[#22C55E] hover:to-[#16A34A] text-[#050806] font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#16A34A]/25 cursor-pointer"
          >
            <Mic className="w-4 h-4 text-[#050806]" />
            <span>Nói mục tiêu với Jami</span>
          </button>
        </div>

        {/* 8 Modules Navigation in Single Source of Truth Order */}
        <div className="p-4 space-y-1.5 flex-1">
          <div className="text-[11px] font-bold text-[#86EFAC] uppercase tracking-wider mb-2">
            8 Mô-đun Học Tập Cá Nhân Hóa
          </div>
          {MODULES_CONFIG.map((item) => (
            <Link
              key={item.id}
              to={item.path}
              onClick={onClose}
              className="flex items-center gap-3 p-3 rounded-xl bg-[#101A13] hover:bg-[#142219] border border-[rgba(34,197,94,0.15)] text-[#F3FAF5] transition-all"
            >
              <div className="w-6 h-6 rounded-md bg-[#14532D] text-[#86EFAC] flex items-center justify-center text-xs font-bold shrink-0">
                {item.order}
              </div>
              <item.icon className="w-5 h-5 text-[#22C55E] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-[#F3FAF5] truncate">{item.name}</div>
                <div className="text-[10px] text-[#A9B8AE] truncate">{item.description}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Profile & Settings Bottom Section */}
        <div className="p-4 bg-[#080D09] border-t border-[rgba(34,197,94,0.18)] flex flex-wrap items-center justify-between gap-2">
          {user?.role === 'admin' && (
            <Link
              to="/admin"
              onClick={onClose}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-purple-300 bg-purple-950/60 border border-purple-500/40 hover:bg-purple-900/80"
            >
              <Shield className="w-4 h-4 text-purple-400" />
              <span>Quản trị Admin</span>
            </Link>
          )}
          <Link
            to="/settings"
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#101A13]"
          >
            <Settings className="w-4 h-4 text-[#86EFAC]" />
            <span>Cài đặt & Bảo mật</span>
          </Link>
          <button
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-rose-400 hover:bg-rose-950/40 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>
    </div>
  );
};
