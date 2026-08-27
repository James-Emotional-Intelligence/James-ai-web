import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  CalendarDays,
  ListTodo,
  Sparkles,
  Bot,
  GraduationCap,
  BarChart3,
  FolderKanban,
  Bell,
  Settings,
  Flame,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../features/auth/AuthProvider';
import { Shield } from 'lucide-react';

// Strict Module order 1 to 8 as required by prompt
export const SIDEBAR_MODULES = [
  {
    order: 1,
    id: 'timetable',
    name: '1. LỊCH HỌC THÔNG MINH',
    path: '/timetable',
    icon: CalendarDays,
    subItems: ['Thời khóa biểu trường', 'Lịch học thêm', 'Tự động xếp lại'],
  },
  {
    order: 2,
    id: 'tasks',
    name: '2. CHI TIẾT CÔNG VIỆC',
    path: '/tasks/task-math-1',
    icon: ListTodo,
    subItems: ['Chuẩn bị & mục tiêu', 'Thực hiện từng bước', 'Minh chứng kết quả'],
  },
  {
    order: 3,
    id: 'today',
    name: '3. HỌC TẬP HÔM NAY',
    path: '/today',
    icon: Sparkles,
    subItems: ['Việc cần làm', 'Hẹn giờ tập trung', 'Theo dõi tiến độ'],
  },
  {
    order: 4,
    id: 'jami',
    name: '4. TRỢ LÝ AI',
    path: '/jami',
    icon: Bot,
    subItems: ['Hỏi đáp bài học', 'Nhắc lịch', 'Gợi ý ưu tiên'],
  },
  {
    order: 5,
    id: 'exams',
    name: '5. KIỂM TRA & ÔN TẬP',
    path: '/exams',
    icon: GraduationCap,
    subItems: ['Lịch kiểm tra', 'Đề luyện tập AI', 'Chấm điểm & giải thích'],
  },
  {
    order: 6,
    id: 'reports',
    name: '6. BÁO CÁO HỌC TẬP',
    path: '/reports',
    icon: BarChart3,
    subItems: ['Thời gian học', 'Môn mạnh & yếu', 'Kết quả kiểm tra'],
  },
  {
    order: 7,
    id: 'materials',
    name: '7. KHO TÀI LIỆU',
    path: '/materials',
    icon: FolderKanban,
    subItems: ['PDF & hình ảnh', 'Đề cương', 'Tạo câu hỏi từ tài liệu'],
  },
  {
    order: 8,
    id: 'notifications',
    name: '8. THÔNG BÁO',
    path: '/notifications',
    icon: Bell,
    subItems: ['Sắp đến giờ học', 'Sắp kiểm tra', 'Chưa hoàn thành'],
  },
];

export const Sidebar: React.FC = () => {
  const { user } = useAuth();

  return (
    <aside className="hidden lg:flex flex-col w-72 bg-white border-r border-slate-200 min-h-screen p-4 select-none shrink-0">
      {/* Brand Header */}
      <Link to="/today" className="flex items-center gap-3 px-3 py-2.5 mb-4 group">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-cyan-500 to-teal-400 flex items-center justify-center text-white font-extrabold text-xl shadow-lg shadow-cyan-500/25 group-hover:scale-105 transition-transform">
          J
        </div>
        <div>
          <div className="font-black text-xl tracking-tight bg-gradient-to-r from-blue-700 via-cyan-600 to-teal-600 bg-clip-text text-transparent">
            JAMI AI
          </div>
          <div className="text-[10px] font-semibold text-cyan-700 tracking-wider uppercase">
            Trợ lý học tập AI
          </div>
        </div>
      </Link>

      {/* Daily Streak Indicator */}
      <div className="mb-4 mx-2 p-3 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
            <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-800">Chuỗi tập trung</div>
            <div className="text-[11px] text-slate-500">4 ngày liên tiếp</div>
          </div>
        </div>
        <span className="text-xs font-extrabold text-amber-700 bg-amber-200/60 px-2 py-0.5 rounded-full">
          +40 XP
        </span>
      </div>

      {/* Navigation List - Exact 8 Modules */}
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-2">
        Danh mục 8 mô-đun
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
        {SIDEBAR_MODULES.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex items-start gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all duration-200 group',
                isActive
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-600 hover:text-blue-700 hover:bg-cyan-50/70'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    'w-4 h-4 mt-0.5 shrink-0 transition-colors',
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-600'
                  )}
                />
                <div className="flex-1">
                  <div className="tracking-wide text-xs">{item.name}</div>
                  <div
                    className={cn(
                      'text-[10px] font-normal line-clamp-1 mt-0.5',
                      isActive ? 'text-cyan-100' : 'text-slate-400'
                    )}
                  >
                    {item.subItems.join(' • ')}
                  </div>
                </div>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Links */}
      <div className="pt-3 border-t border-slate-200 mt-2 space-y-1">
        {user?.role === 'admin' && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors',
                isActive
                  ? 'bg-purple-100 text-purple-700 border border-purple-200'
                  : 'text-purple-600 hover:bg-purple-50'
              )
            }
          >
            <Shield className="w-4 h-4 text-purple-600" />
            <span>Quản trị Admin</span>
          </NavLink>
        )}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors',
              isActive && 'bg-slate-100 text-blue-700'
            )
          }
        >
          <Settings className="w-4 h-4 text-slate-400" />
          <span>Cài đặt & Quyền riêng tư</span>
        </NavLink>
      </div>
    </aside>
  );
};
