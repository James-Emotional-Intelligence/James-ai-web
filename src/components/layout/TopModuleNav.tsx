import React from 'react';
import { NavLink } from 'react-router-dom';
import { MODULES_CONFIG } from '../../config/modules';

export const TopModuleNav: React.FC = () => {
  return (
    <nav className="w-full bg-[#080D09] border-t border-b border-[rgba(34,197,94,0.18)] px-2 sm:px-4 z-30 relative shadow-inner">
      <div className="max-w-7xl mx-auto flex items-center gap-1.5 sm:gap-2 py-1.5 overflow-x-auto no-scrollbar scroll-smooth">
        {MODULES_CONFIG.map((item) => (
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
      </div>
    </nav>
  );
};
