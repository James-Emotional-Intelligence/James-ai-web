import React, { useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  Award,
  Clock,
  CheckCircle2,
  Sparkles,
  Calendar,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

export const ReportsPage: React.FC = () => {
  const [reportData] = useState<any>({
    weeklyStudyMinutes: [
      { day: 'T2', minutes: 75, target: 60 },
      { day: 'T3', minutes: 45, target: 60 },
      { day: 'T4', minutes: 90, target: 60 },
      { day: 'T5', minutes: 60, target: 60 },
      { day: 'T6', minutes: 50, target: 60 },
      { day: 'T7', minutes: 110, target: 90 },
      { day: 'CN', minutes: 40, target: 60 },
    ],
    subjectBreakdown: [
      { name: 'Toán học', value: 40, color: '#16A34A' },
      { name: 'Tiếng Anh', value: 30, color: '#22C55E' },
      { name: 'Ngữ văn', value: 20, color: '#4ADE80' },
      { name: 'Vật lý', value: 10, color: '#F59E0B' },
    ],
    topicMastery: [
      { topic: 'Đồ thị hàm số bậc nhất y = ax + b', subject: 'Toán', mastery: 65, status: 'Cần ôn thêm' },
      { topic: 'Từ vựng City Life & Thành thị', subject: 'Tiếng Anh', mastery: 88, status: 'Nắm vững' },
      { topic: 'Phân tích nhân vật Vũ Nương', subject: 'Ngữ văn', mastery: 80, status: 'Khá' },
      { topic: 'Định luật Ôm cho đoạn mạch', subject: 'Vật lý', mastery: 72, status: 'Khá' },
    ],
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-[#F3FAF5] flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[#22C55E]" />
            <span>Báo Cáo & Phân Tích Học Tập</span>
          </h1>
          <p className="text-xs text-[#A9B8AE] mt-0.5">
            Tổng hợp thời gian học, phân tích môn mạnh - yếu và kết quả làm bài ôn tập
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-[#86EFAC] bg-[#101A13] px-3.5 py-2 rounded-xl border border-[rgba(34,197,94,0.2)]">
          <Calendar className="w-4 h-4 text-[#22C55E]" />
          <span>Báo cáo tuần 3 - Tháng 8/2026</span>
        </div>
      </div>

      {/* Highlights 3-Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0B120D] p-5 rounded-2xl border border-[rgba(34,197,94,0.2)] shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#A9B8AE] uppercase tracking-wider">Tổng giờ tự học tuần</span>
            <Clock className="w-4 h-4 text-[#22C55E]" />
          </div>
          <div className="my-3">
            <div className="text-2xl font-black text-[#F3FAF5]">7.8 Giờ</div>
            <div className="text-xs text-[#86EFAC] font-semibold flex items-center gap-1 mt-1">
              <TrendingUp className="w-3.5 h-3.5 text-[#22C55E]" />
              <span>Vượt 15% so với mục tiêu đề ra</span>
            </div>
          </div>
        </div>

        <div className="bg-[#0B120D] p-5 rounded-2xl border border-[rgba(34,197,94,0.2)] shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#A9B8AE] uppercase tracking-wider">Điểm kiểm tra trung bình</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
          <div className="my-3">
            <div className="text-2xl font-black text-[#F3FAF5]">8.4 / 10</div>
            <div className="text-xs text-[#A9B8AE] mt-1">Dựa trên 6 bài thi thử gần nhất</div>
          </div>
        </div>

        <div className="bg-[#0B120D] p-5 rounded-2xl border border-[rgba(34,197,94,0.2)] shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#A9B8AE] uppercase tracking-wider">Tỷ lệ hoàn thành nhiệm vụ</span>
            <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
          </div>
          <div className="my-3">
            <div className="text-2xl font-black text-[#F3FAF5]">92%</div>
            <div className="text-xs text-[#86EFAC] font-semibold mt-1">12/13 nhiệm vụ đạt đúng hạn</div>
          </div>
        </div>
      </div>

      {/* Charts 2-Column: Weekly Bar Chart & Subject Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Minutes Bar Chart (2 cols) */}
        <div className="lg:col-span-2 bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider">
              Thời gian học từng ngày trong tuần (Phút)
            </h2>
            <div className="flex items-center gap-3 text-[11px] text-[#A9B8AE]">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#16A34A] inline-block" /> Thực tế
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#101A13] border border-[rgba(34,197,94,0.2)] inline-block" /> Mục tiêu
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reportData.weeklyStudyMinutes} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" tickLine={false} tick={{ fontSize: 12, fill: '#A9B8AE' }} />
                <YAxis tickLine={false} tick={{ fontSize: 12, fill: '#A9B8AE' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0B120D',
                    borderRadius: 12,
                    border: '1px solid rgba(34,197,94,0.3)',
                    color: '#F3FAF5',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="minutes" fill="#16A34A" radius={[6, 6, 0, 0]} name="Thực tế (phút)" />
                <Bar dataKey="target" fill="#101A13" stroke="rgba(34,197,94,0.3)" radius={[6, 6, 0, 0]} name="Mục tiêu (phút)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Subject Ratio Pie */}
        <div className="bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4">
          <h2 className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider">
            Phân bổ thời gian theo môn
          </h2>

          <div className="h-48 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={reportData.subjectBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {reportData.subjectBreakdown.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0B120D',
                    borderRadius: 12,
                    border: '1px solid rgba(34,197,94,0.3)',
                    color: '#F3FAF5',
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {reportData.subjectBreakdown.map((item: any) => (
              <div key={item.name} className="flex items-center gap-1.5 text-[#A9B8AE]">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="truncate">{item.name} ({item.value}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Topic Mastery & Weakness Detector */}
      <div className="bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#F3FAF5] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#22C55E]" />
            <span>Mức độ làm chủ chủ đề & Khuyến nghị ôn tập từ Jami</span>
          </h2>
        </div>

        <div className="space-y-3">
          {reportData.topicMastery.map((item: any, idx: number) => (
            <div
              key={idx}
              className="p-4 rounded-2xl border border-[rgba(34,197,94,0.2)] bg-[#101A13] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30">
                    {item.subject}
                  </span>
                  <span className="font-bold text-xs sm:text-sm text-[#F3FAF5]">{item.topic}</span>
                </div>
                <div className="text-xs text-[#A9B8AE]">
                  Đánh giá: <strong className={item.mastery < 70 ? 'text-amber-400' : 'text-[#86EFAC]'}>{item.status}</strong>
                </div>
              </div>

              <div className="flex items-center gap-4 min-w-[200px]">
                <div className="flex-1 bg-[#050806] h-2 rounded-full overflow-hidden border border-[rgba(34,197,94,0.15)]">
                  <div
                    className={`h-full rounded-full ${
                      item.mastery < 70 ? 'bg-amber-400' : 'bg-[#16A34A]'
                    }`}
                    style={{ width: `${item.mastery}%` }}
                  />
                </div>
                <span className="text-xs font-black text-[#F3FAF5] w-10 text-right">
                  {item.mastery}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
