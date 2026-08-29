import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MODULES_CONFIG } from '../../config/modules';
import { Layers, Shield, ChevronRight } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthProvider';

export const TopModuleNav: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();
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

  return (
    <nav className="w-full bg-[#080D09] border-t border-b border-[rgba(34,197,94,0.18)] px-4 sm:px-6 lg:px-8 z-30 relative shadow-inner">
      <div className="max-w-[1750px] mx-auto flex items-center justify-between gap-4 py-1.5 overflow-x-auto no-scrollbar scroll-smooth">
        {/* Danh sách các Module theo nhóm được chọn ở bên trái */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar flex-1 min-w-0">
          {visibleModules.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap group shrink-0 ${
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

        {/* Khối bên phải thẳng hàng với nhóm nút TopAppBar (Nút Chuyển mục đặt thẳng hàng dưới nút 'Bật Jami') */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="h-5 w-px bg-[rgba(34,197,94,0.2)] shrink-0 hidden sm:block" />
          
          {/* Nút Chuyển Đổi Nhóm Mục 1-4 <-> 5-8 đặt thẳng hàng dưới nút Bật Jami */}
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

          {/* Spacers đối xứng cân chỉnh thẳng hàng theo các nút còn lại của Header (Nói mục tiêu, Bell, Profile) */}
          <div className="hidden lg:flex items-center gap-2 sm:gap-3 invisible pointer-events-none select-none" aria-hidden="true">
            <div className="px-3 py-1.5 text-xs font-bold w-[116px]">Nói mục tiêu</div>
            <div className="p-2 w-8 h-8" />
            <div className="p-1.5 sm:px-3 sm:py-1.5 w-32" />
          </div>
        </div>
      </div>
    </nav>
  );
};
