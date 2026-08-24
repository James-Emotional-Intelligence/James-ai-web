import React from 'react';
import { NavLink } from 'react-router-dom';
import { Sparkles, CalendarDays, Bot, GraduationCap, Menu } from 'lucide-react';
import { cn } from '../../lib/utils';

export const MobileNav: React.FC<{ onOpenMenuDrawer: () => void }> = ({ onOpenMenuDrawer }) => {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 py-2 flex items-center justify-around shadow-lg">
      <NavLink
        to="/today"
        className={({ isActive }) =>
          cn(
            'flex flex-col items-center gap-1 text-[11px] font-semibold py-1 px-2 rounded-xl transition-colors',
            isActive ? 'text-blue-600' : 'text-slate-500 hover:text-slate-900'
          )
        }
      >
        <Sparkles className="w-5 h-5" />
        <span>Hôm nay</span>
      </NavLink>

      <NavLink
        to="/timetable"
        className={({ isActive }) =>
          cn(
            'flex flex-col items-center gap-1 text-[11px] font-semibold py-1 px-2 rounded-xl transition-colors',
            isActive ? 'text-blue-600' : 'text-slate-500 hover:text-slate-900'
          )
        }
      >
        <CalendarDays className="w-5 h-5" />
        <span>Lịch học</span>
      </NavLink>

      {/* Floating Center Jami AI Button */}
      <NavLink
        to="/jami"
        className={({ isActive }) =>
          cn(
            'flex flex-col items-center -mt-5 p-2 rounded-full shadow-lg transition-transform active:scale-95',
            isActive
              ? 'bg-gradient-to-tr from-blue-600 to-cyan-500 text-white ring-4 ring-cyan-100'
              : 'bg-gradient-to-tr from-blue-600 to-cyan-500 text-white'
          )
        }
      >
        <Bot className="w-6 h-6" />
      </NavLink>

      <NavLink
        to="/exams"
        className={({ isActive }) =>
          cn(
            'flex flex-col items-center gap-1 text-[11px] font-semibold py-1 px-2 rounded-xl transition-colors',
            isActive ? 'text-blue-600' : 'text-slate-500 hover:text-slate-900'
          )
        }
      >
        <GraduationCap className="w-5 h-5" />
        <span>Ôn tập</span>
      </NavLink>

      <button
        onClick={onOpenMenuDrawer}
        className="flex flex-col items-center gap-1 text-[11px] font-semibold py-1 px-2 text-slate-500 hover:text-slate-900 transition-colors"
      >
        <Menu className="w-5 h-5" />
        <span>Thêm</span>
      </button>
    </nav>
  );
};
