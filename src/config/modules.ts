import React from 'react';
import {
  Calendar,
  CheckSquare,
  Sparkles,
  Bot,
  GraduationCap,
  BarChart3,
  FolderArchive,
  Bell,
} from 'lucide-react';

export interface ModuleDefinition {
  id: string;
  order: number;
  name: string;
  shortName: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  badgeKey?: string;
}

export const MODULES_CONFIG: ModuleDefinition[] = [
  {
    id: 'timetable',
    order: 1,
    name: 'LỊCH HỌC THÔNG MINH',
    shortName: 'Lịch học',
    path: '/timetable',
    icon: Calendar,
    description: 'Thời khóa biểu, lịch bận & tối ưu thời gian học',
  },
  {
    id: 'tasks',
    order: 2,
    name: 'CHI TIẾT CÔNG VIỆC',
    shortName: 'Công việc',
    path: '/tasks',
    icon: CheckSquare,
    description: 'Danh sách nhiệm vụ & hướng dẫn chia nhỏ từng bước',
  },
  {
    id: 'today',
    order: 3,
    name: 'HỌC TẬP HÔM NAY',
    shortName: 'Hôm nay',
    path: '/today',
    icon: Sparkles,
    description: 'Tổng quan tiến độ & Hẹn giờ tập trung',
  },
  {
    id: 'jami',
    order: 4,
    name: 'TRỢ LÝ AI JAMI',
    shortName: 'Trợ lý Jami',
    path: '/jami',
    icon: Bot,
    description: 'Hội thoại thông minh & đồng hành 24/7',
  },
  {
    id: 'exams',
    order: 5,
    name: 'KIỂM TRA & ÔN TẬP',
    shortName: 'Kiểm tra',
    path: '/exams',
    icon: GraduationCap,
    description: 'Lộ trình D-14, D-7 & Đề luyện tập AI',
  },
  {
    id: 'reports',
    order: 6,
    name: 'BÁO CÁO HỌC TẬP',
    shortName: 'Báo cáo',
    path: '/reports',
    icon: BarChart3,
    description: 'Thống kê tổng phút tập trung & phân tích xu hướng',
  },
  {
    id: 'materials',
    order: 7,
    name: 'KHO TÀI LIỆU',
    shortName: 'Tài liệu',
    path: '/materials',
    icon: FolderArchive,
    description: 'Lưu trữ tài liệu học & trích xuất AI',
  },
  {
    id: 'notifications',
    order: 8,
    name: 'THÔNG BÁO',
    shortName: 'Thông báo',
    path: '/notifications',
    icon: Bell,
    description: 'Nhắc nhở học tập & thông báo mốc quan trọng',
    badgeKey: 'unreadNotificationsCount',
  },
];

export const PRIMARY_NAV_MODULES = MODULES_CONFIG.slice(0, 4);
export const SECONDARY_NAV_MODULES = MODULES_CONFIG.slice(4, 8);
