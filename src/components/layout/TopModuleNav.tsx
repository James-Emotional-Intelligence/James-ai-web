import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MODULES_CONFIG } from '../../config/modules';
import { Layers, Shield } from 'lucide-react';
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

  const visibleModules = MODULES_CONFIG.filter((m) =>
    selectedGroup === '1-4' ? m.order <= 4 : m.order >= 5
  );

  return (
    <nav className="w-full bg-[#080D09] border-t border-b border-[rgba(34,197,94,0.18)] px-2 sm:px-4 lg:px-8 z-30 relative shadow-inner">
      <div className="max-w-[1750px] mx-auto flex items-center gap-2 sm:gap-3 py-1.5 overflow-x-auto no-scrollbar scroll-smooth">
        {/* Combobox Chọn Nhóm Mục 1-4 / 5-8 */}
        <div className="flex items-center gap-1.5 shrink-0 bg-[#101A13] border border-[rgba(34,197,94,0.28)] rounded-xl px-2.5 py-1 shadow-sm">
          <Layers className="w-3.5 h-3.5 text-[#22C55E]" />
          <select
            value={selectedGroup === 'admin' ? '1-4' : selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value as '1-4' | '5-8')}
            className="bg-transparent text-xs font-black text-[#86EFAC] focus:outline-none cursor-pointer [&>option]:bg-[#0B120D] [&>option]:text-[#F3FAF5] [&>option]:font-bold"
            title="Chọn nhóm hiển thị: Mục 1 - 4 hoặc Mục 5 - 8"
          >
            <option value="1-4">Mục 1 - 4</option>
            <option value="5-8">Mục 5 - 8</option>
          </select>
        </div>

        <div className="h-5 w-px bg-[rgba(34,197,94,0.2)] shrink-0 hidden sm:block" />

        {/* Danh sách các Module theo nhóm được chọn */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
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
      </div>
    </nav>
  );
};
