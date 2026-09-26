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
  BookX,
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
    id: 'today',
    order: 2,
    name: 'HỌC TẬP HÔM NAY',
    shortName: 'Hôm nay',
    path: '/today',
    icon: Sparkles,
    description: 'Tổng quan tiến độ & Hẹn giờ tập trung',
  },
  {
    id: 'tasks',
    order: 3,
    name: 'CHI TIẾT CÔNG VIỆC',
    shortName: 'Công việc',
    path: '/tasks',
    icon: CheckSquare,
    description: 'Danh sách nhiệm vụ & hướng dẫn chia nhỏ từng bước',
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
    description: 'Lộ trình ôn tập & đề thi kiểm tra AI',
  },
  {
    id: 'materials',
    order: 6,
    name: 'KHO TÀI LIỆU',
    shortName: 'Tài liệu',
    path: '/materials',
    icon: FolderArchive,
    description: 'Lưu trữ tài liệu học & trích xuất AI',
  },
  {
    id: 'reports',
    order: 7,
    name: 'BÁO CÁO HỌC TẬP',
    shortName: 'Báo cáo',
    path: '/reports',
    icon: BarChart3,
    description: 'Thống kê tổng phút tập trung & phân tích xu hướng',
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

export const MISTAKE_MODULE: ModuleDefinition = {
  id: 'mistakes',
  order: 9,
  name: 'SỔ LỖI SAI CÁ NHÂN',
  shortName: 'Sổ lỗi sai',
  path: '/mistakes',
  icon: BookX,
  description: 'Lưu trữ câu sai & ôn tập ngắt quãng 1-3-7-14-30 ngày',
};

export const PRIMARY_NAV_MODULES = MODULES_CONFIG;
export const SECONDARY_NAV_MODULES = MODULES_CONFIG.slice(4, 8);
