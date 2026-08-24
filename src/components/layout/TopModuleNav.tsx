import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, Layers } from 'lucide-react';
import { PRIMARY_NAV_MODULES, SECONDARY_NAV_MODULES } from '../../config/modules';

export const TopModuleNav: React.FC = () => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const isSecondaryActive = SECONDARY_NAV_MODULES.some((item) =>
    location.pathname.startsWith(item.path)
  );

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <nav className="w-full bg-[#080D09] border-t border-b border-[rgba(34,197,94,0.18)] px-4 sm:px-6 z-30 relative">
      <div className="max-w-7xl mx-auto flex items-center justify-between py-1.5 gap-2 overflow-x-auto no-scrollbar">
        {/* Modules 1 to 4 - Direct Navigation */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {PRIMARY_NAV_MODULES.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap group ${
                  isActive
                    ? 'bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/40 shadow-sm shadow-[#16A34A]/20'
                    : 'text-[#A9B8AE] hover:text-[#F3FAF5] hover:bg-[#101A13]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black ${
                      isActive
                        ? 'bg-[#22C55E] text-[#050806]'
                        : 'bg-[#101A13] text-[#A9B8AE] group-hover:text-[#F3FAF5] group-hover:bg-[#142219]'
                    }`}
                  >
                    {item.order}
                  </div>
                  <item.icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-[#86EFAC]' : 'text-[#A9B8AE] group-hover:text-[#22C55E]'
                    }`}
                  />
                  <span className="tracking-wide">{item.name}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Modules 5 to 8 - Dropdown Menu */}
        <div className="relative shrink-0" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            aria-expanded={isDropdownOpen}
            aria-haspopup="true"
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              isSecondaryActive || isDropdownOpen
                ? 'bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/40 shadow-sm shadow-[#16A34A]/20'
                : 'text-[#A9B8AE] hover:text-[#F3FAF5] bg-[#101A13] hover:bg-[#142219] border border-[rgba(34,197,94,0.15)]'
            }`}
          >
            <Layers className="w-4 h-4 text-[#22C55E]" />
            <span>Mục 5–8</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isDropdownOpen ? 'rotate-180 text-[#22C55E]' : 'text-[#A9B8AE]'
              }`}
            />
          </button>

          {/* Dropdown Menu Panel */}
          {isDropdownOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl bg-[#0B120D] border border-[rgba(34,197,94,0.3)] shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
            >
              <div className="px-3 py-1.5 text-[11px] font-bold text-[#86EFAC] uppercase tracking-wider border-b border-[rgba(34,197,94,0.15)] mb-1">
                Các Module Mở Rộng (5–8)
              </div>
              <div className="space-y-1">
                {SECONDARY_NAV_MODULES.map((item) => {
                  const isActive = location.pathname.startsWith(item.path);
                  return (
                    <NavLink
                      key={item.id}
                      to={item.path}
                      role="menuitem"
                      onClick={() => setIsDropdownOpen(false)}
                      className={`flex items-start gap-3 p-2.5 rounded-xl transition-all ${
                        isActive
                          ? 'bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/40'
                          : 'hover:bg-[#101A13] text-[#F3FAF5]'
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${
                          isActive
                            ? 'bg-[#22C55E] text-[#050806]'
                            : 'bg-[#101A13] text-[#A9B8AE] border border-[rgba(34,197,94,0.2)]'
                        }`}
                      >
                        {item.order}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <item.icon
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? 'text-[#86EFAC]' : 'text-[#22C55E]'
                            }`}
                          />
                          <span className="text-xs font-bold truncate">{item.name}</span>
                        </div>
                        <p className="text-[11px] text-[#A9B8AE] truncate mt-0.5">
                          {item.description}
                        </p>
                      </div>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};
