import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  Award,
  Clock,
  CheckCircle2,
  Sparkles,
  Calendar,
  Download,
  RefreshCw,
  AlertCircle,
  Flame,
  ChevronRight,
  BookOpen,
  Printer,
  HelpCircle,
  Target,
  LineChart as LineChartIcon,
  ShieldCheck,
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
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { ReportOverviewResponse } from '../../../shared/types';

export const ReportsPage: React.FC = () => {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [report, setReport] = useState<ReportOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getReportsOverview({ period });
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Không thể tải dữ liệu báo cáo học tập.');
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      await api.downloadReportsCsv({ period });
    } catch (err: any) {
      alert(err.message || 'Không thể xuất file CSV báo cáo');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="space-y-6 print:p-0 print:m-0 print:bg-white print:text-black">
      {/* Header */}
      <div className="bg-[#0B120D] p-5 sm:p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:border-none print:shadow-none print:bg-transparent">
        <div>
          <h1 className="text-lg sm:text-xl font-black text-[#F3FAF5] print:text-black flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-[#22C55E]" />
            <span>Báo Cáo & Phân Tích Năng Lực Học Tập</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {/* Period selector */}
          <div className="flex items-center bg-[#101A13] p-1 rounded-2xl border border-[rgba(34,197,94,0.2)]">
            <button
              onClick={() => setPeriod('week')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                period === 'week'
                  ? 'bg-[#16A34A] text-[#050806] shadow-sm'
                  : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
              }`}
            >
              Tuần này
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                period === 'month'
                  ? 'bg-[#16A34A] text-[#050806] shadow-sm'
                  : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
              }`}
            >
              Tháng này
            </button>
          </div>

          {/* Export Buttons */}
          <button
            type="button"
            onClick={handlePrintPdf}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-[#101A13] hover:bg-[#142219] text-[#86EFAC] border border-[rgba(34,197,94,0.2)] text-xs font-bold transition-all cursor-pointer"
            title="In hoặc lưu báo cáo dạng PDF"
          >
            <Printer className="w-3.5 h-3.5 text-[#22C55E]" />
            <span>Xuất PDF</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-[#101A13] hover:bg-[#142219] text-[#86EFAC] border border-[rgba(34,197,94,0.2)] text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            title="Xuất file CSV báo cáo"
          >
            <Download className={`w-3.5 h-3.5 text-[#22C55E] ${isExporting ? 'animate-bounce' : ''}`} />
            <span>{isExporting ? 'Đang xuất CSV...' : 'Xuất CSV'}</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 rounded-2xl text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchReport}
            className="px-3 py-1 bg-rose-900 text-white font-bold rounded-lg cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="p-16 text-center text-xs text-[#A9B8AE] flex items-center justify-center gap-2.5">
          <RefreshCw className="w-5 h-5 animate-spin text-[#22C55E]" />
          <span>Đang tổng hợp dữ liệu học tập...</span>
        </div>
      ) : report ? (
        <>
          {/* Period Title Badge */}
          <div className="flex items-center justify-between text-xs font-bold text-[#86EFAC]">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#22C55E]" />
              <span>{report.period.label}</span>
            </div>
            <div className="text-[11px] text-[#A9B8AE] print:hidden">
              Mục tiêu học tập: <span className="text-[#F3FAF5] font-bold">{report.summary.plannedHours} giờ</span>
            </div>
          </div>

          {/* 7.1 Overview Metric Cards (4 Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 jami-card-grid">
            {/* Focus Hours vs Goal */}
            <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl flex flex-col justify-between space-y-3 print:border-gray-300 jami-card-interactive">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#A9B8AE] uppercase tracking-wider">
                  Thời gian học thực tế
                </span>
                <Clock className="w-4 h-4 text-[#22C55E]" />
              </div>
              <div>
                <div className="text-2xl font-black text-[#F3FAF5]">
                  {report.summary.actualFocusHours} <span className="text-sm font-normal text-[#A9B8AE]">Giờ</span>
                </div>
                <div className="text-[11px] mt-1">
                  {report.comparison.actualMinutesDiffPercent !== null ? (
                    <span
                      className={`flex items-center gap-1 font-semibold ${
                        report.comparison.actualMinutesDiffPercent >= 0 ? 'text-[#86EFAC]' : 'text-amber-400'
                      }`}
                    >
                      <TrendingUp className="w-3 h-3 text-[#22C55E]" />
                      <span>
                        {report.comparison.actualMinutesDiffPercent >= 0 ? '+' : ''}
                        {report.comparison.actualMinutesDiffPercent}% so với kỳ trước
                      </span>
                    </span>
                  ) : (
                    <span className="text-[#A9B8AE]">Mục tiêu: {report.summary.plannedHours} giờ</span>
                  )}
                </div>
              </div>
            </div>

            {/* Focus Sessions & Avg Duration */}
            <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl flex flex-col justify-between space-y-3 print:border-gray-300 jami-card-interactive">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#A9B8AE] uppercase tracking-wider">
                  Phiên học hoàn thành
                </span>
                <Target className="w-4 h-4 text-[#22C55E]" />
              </div>
              <div>
                <div className="text-2xl font-black text-[#F3FAF5]">
                  {report.summary.totalCompletedSessions || 0} <span className="text-sm font-normal text-[#A9B8AE]">Phiên</span>
                </div>
                <div className="text-[11px] text-[#86EFAC] font-semibold mt-1">
                  Trung bình: {report.summary.avgSessionMinutes || 25} phút / phiên
                </div>
              </div>
            </div>

            {/* Task Completion Rate */}
            <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl flex flex-col justify-between space-y-3 print:border-gray-300 jami-card-interactive">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#A9B8AE] uppercase tracking-wider">
                  Nhiệm vụ hoàn thành
                </span>
                <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
              </div>
              <div>
                <div className="text-2xl font-black text-[#F3FAF5]">{report.summary.completionRate}%</div>
                <div className="text-[11px] text-[#86EFAC] font-semibold mt-1">
                  {report.summary.completedTasks} / {report.summary.totalTasks} nhiệm vụ
                  {report.summary.onTimeRate !== null ? ` (${report.summary.onTimeRate}% đúng hạn)` : ''}
                </div>
              </div>
            </div>

            {/* Quiz Average & Streak */}
            <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl flex flex-col justify-between space-y-3 print:border-gray-300 jami-card-interactive">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#A9B8AE] uppercase tracking-wider">
                  Điểm kiểm tra TB & Chuỗi
                </span>
                <Award className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <div className="text-2xl font-black text-[#F3FAF5]">
                  {report.summary.averageQuizScore !== null ? `${report.summary.averageQuizScore} / 10` : 'Chưa có điểm'}
                </div>
                <div className="text-[11px] text-orange-300 font-semibold mt-1 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  <span>Chuỗi {report.summary.streakDays} ngày học liên tiếp</span>
                </div>
              </div>
            </div>
          </div>

          {/* 7.1 Charts: Daily Minutes vs Subject Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Daily Study Minutes Bar Chart */}
            <div className="lg:col-span-2 bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4 print:border-gray-300">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider">
                  Thời gian học từng ngày (Phút thực tế vs Kế hoạch)
                </h2>
                <div className="flex items-center gap-3 text-[11px] text-[#A9B8AE]">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#16A34A] inline-block" /> Thực tế
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#101A13] border border-[rgba(34,197,94,0.3)] inline-block" /> Kế hoạch
                  </span>
                </div>
              </div>

              {report.dailyStudy.length > 0 &&
              report.dailyStudy.some((d) => d.actualMinutes > 0 || d.plannedMinutes > 0) ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.dailyStudy} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <XAxis dataKey="dayLabel" tickLine={false} tick={{ fontSize: 12, fill: '#A9B8AE' }} />
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
                      <Bar dataKey="actualMinutes" fill="#16A34A" radius={[6, 6, 0, 0]} name="Thực tế (phút)" />
                      <Bar
                        dataKey="plannedMinutes"
                        fill="#101A13"
                        stroke="rgba(34,197,94,0.3)"
                        radius={[6, 6, 0, 0]}
                        name="Kế hoạch (phút)"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-xs text-[#A9B8AE] space-y-2 border border-dashed border-[rgba(34,197,94,0.15)] rounded-2xl">
                  <Clock className="w-8 h-8 text-[#22C55E] opacity-50" />
                  <p className="font-bold text-[#F3FAF5]">Chưa có phiên học nào trong kỳ này</p>
                  <p className="text-[11px]">Bật đồng hồ tập trung Pomodoro để ghi nhận thời gian học thực tế.</p>
                </div>
              )}
            </div>

            {/* Subject Breakdown Pie Chart */}
            <div className="bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4 print:border-gray-300">
              <h2 className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider">
                Thời gian học theo từng môn
              </h2>

              {report.subjectBreakdown.some((s) => s.actualMinutes > 0 || s.plannedMinutes > 0) ? (
                <>
                  <div className="h-44 w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={report.subjectBreakdown.filter((s) => s.actualMinutes > 0 || s.plannedMinutes > 0)}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={65}
                          paddingAngle={4}
                          dataKey="actualMinutes"
                          nameKey="subjectName"
                        >
                          {report.subjectBreakdown.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color || '#22C55E'} />
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

                  <div className="space-y-1.5 text-xs">
                    {report.subjectBreakdown
                      .filter((s) => s.actualMinutes > 0 || s.plannedMinutes > 0)
                      .map((item) => (
                        <div key={item.subjectId} className="flex items-center justify-between text-[#A9B8AE]">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                            <span className="truncate">{item.subjectName}</span>
                          </div>
                          <span className="font-mono text-[#F3FAF5] shrink-0 font-bold">{item.actualMinutes}p</span>
                        </div>
                      ))}
                  </div>
                </>
              ) : (
                <div className="h-56 flex flex-col items-center justify-center text-center p-4 text-xs text-[#A9B8AE] space-y-2 border border-dashed border-[rgba(34,197,94,0.15)] rounded-2xl">
                  <BookOpen className="w-8 h-8 text-[#22C55E] opacity-50" />
                  <p className="font-bold text-[#F3FAF5]">Chưa có phân bổ môn học</p>
                </div>
              )}
            </div>
          </div>

          {/* 7.2 Môn mạnh và Môn yếu có giải thích căn cứ */}
          <div className="bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4 print:border-gray-300">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-[#F3FAF5] flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#22C55E]" />
                <span>Đánh Giá Môn Mạnh & Môn Cần Cải Thiện (Phân tích có căn cứ)</span>
              </h2>
            </div>

            {report.subjectInsights && report.subjectInsights.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {report.subjectInsights.map((insight) => (
                  <div
                    key={insight.subjectId}
                    className={`p-4 rounded-2xl border flex flex-col justify-between space-y-2.5 ${
                      insight.status === 'improving'
                        ? 'bg-[#101A13] border-[#22C55E]/40'
                        : insight.status === 'needs_attention'
                        ? 'bg-[#181206] border-amber-800/40'
                        : 'bg-[#0B120D] border-[rgba(34,197,94,0.15)] opacity-80'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-[#F3FAF5]">{insight.subjectName}</span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                            insight.status === 'improving'
                              ? 'bg-[#14532D] text-[#86EFAC]'
                              : insight.status === 'needs_attention'
                              ? 'bg-amber-950 text-amber-300'
                              : 'bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          {insight.headline}
                        </span>
                      </div>
                      <p className="text-xs text-[#A9B8AE] leading-relaxed">
                        {insight.explanation}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-[rgba(34,197,94,0.1)] flex items-center justify-between text-[11px] text-[#A9B8AE]">
                      <span>Điểm TB: <strong className="text-[#F3FAF5]">{insight.avgScore !== null ? `${insight.avgScore}/10` : 'Chưa có'}</strong></span>
                      <span>Hoàn thành bài tập: <strong className="text-[#86EFAC]">{insight.completionRate}%</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#A9B8AE]">Đang cập nhật các chỉ số môn học...</p>
            )}
          </div>

          {/* 7.3 Tiến trình Điểm Số Kiểm Tra & Đề xuất Kế Hoạch Ôn Tập */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Score Progression Trend */}
            <div className="bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4 print:border-gray-300">
              <h2 className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider flex items-center gap-2">
                <LineChartIcon className="w-4 h-4 text-[#22C55E]" />
                <span>Biểu đồ thay đổi điểm số kiểm tra</span>
              </h2>

              {report.scoreProgression && report.scoreProgression.length > 0 ? (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={report.scoreProgression} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(34,197,94,0.1)" />
                      <XAxis dataKey="subjectName" tick={{ fontSize: 11, fill: '#A9B8AE' }} />
                      <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#A9B8AE' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0B120D',
                          borderRadius: 12,
                          border: '1px solid rgba(34,197,94,0.3)',
                          color: '#F3FAF5',
                          fontSize: 12,
                        }}
                      />
                      <Line type="monotone" dataKey="score" stroke="#22C55E" strokeWidth={3} dot={{ r: 4, fill: '#22C55E' }} name="Điểm số (/10)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 flex flex-col items-center justify-center text-center p-4 text-xs text-[#A9B8AE] space-y-2 border border-dashed border-[rgba(34,197,94,0.15)] rounded-2xl">
                  <Award className="w-8 h-8 text-[#22C55E] opacity-50" />
                  <p className="font-bold text-[#F3FAF5]">Chưa có dữ liệu bài kiểm tra</p>
                  <p className="text-[11px]">Làm các đề ôn tập để theo dõi biểu đồ tăng trưởng điểm số.</p>
                </div>
              )}
            </div>

            {/* Actionable Next Study Plan */}
            <div className="bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4 print:border-gray-300">
              <h2 className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#22C55E]" />
                <span>Kế hoạch hành động đề xuất tiếp theo</span>
              </h2>

              <div className="space-y-3">
                {(report.nextStudyPlan || [
                  'Dành 25 phút giải đề luyện tập Toán 9 để củng cố các câu hay nhầm lẫn.',
                  'Hoàn thành bài tập Tiếng Anh trước 20:00 tối nay.',
                  'Xem lại đề cương Vật lý trước kỳ thi 3 ngày.',
                ]).map((step, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] text-xs text-[#F3FAF5] flex items-start gap-2.5 leading-relaxed"
                  >
                    <span className="w-5 h-5 rounded-full bg-[#14532D] text-[#86EFAC] text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Topic Mastery Section */}
          <div className="bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4 print:border-gray-300">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#F3FAF5] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#22C55E]" />
                <span>Chủ đề kiến thức & Tỷ lệ làm chủ</span>
              </h2>
            </div>

            {report.topicMastery.length > 0 ? (
              <div className="space-y-3">
                {report.topicMastery.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl border border-[rgba(34,197,94,0.2)] bg-[#101A13] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-[#14532D] text-[#86EFAC] border border-[#22C55E]/30">
                          {item.subjectName}
                        </span>
                        <span className="font-bold text-xs sm:text-sm text-[#F3FAF5]">{item.topicKey}</span>
                      </div>
                      <div className="text-xs text-[#A9B8AE]">
                        Trạng thái:{' '}
                        <strong
                          className={
                            item.status === 'needs_review'
                              ? 'text-amber-400'
                              : item.status === 'mastered'
                              ? 'text-[#86EFAC]'
                              : 'text-sky-300'
                          }
                        >
                          {item.statusLabel}
                        </strong>{' '}
                        • Độ tin cậy: {item.confidence}% ({item.evidenceCount} bài làm)
                      </div>
                    </div>

                    <div className="flex items-center gap-4 min-w-[180px]">
                      <div className="flex-1 bg-[#050806] h-2 rounded-full overflow-hidden border border-[rgba(34,197,94,0.15)]">
                        <div
                          className={`h-full rounded-full ${
                            item.masteryScore < 65
                              ? 'bg-amber-400'
                              : item.masteryScore >= 80
                              ? 'bg-[#16A34A]'
                              : 'bg-sky-400'
                          }`}
                          style={{ width: `${item.masteryScore}%` }}
                        />
                      </div>
                      <span className="text-xs font-black text-[#F3FAF5] w-10 text-right">
                        {item.masteryScore}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-[#101A13] rounded-2xl text-xs text-[#A9B8AE] space-y-2">
                <p className="font-bold text-[#F3FAF5]">Chưa có dữ liệu làm chủ chủ đề</p>
                <p className="text-[11px]">Luyện tập các đề trắc nghiệm trong mục "Kỳ thi & Luyện đề" để ghi nhận điểm số chủ đề.</p>
                <Link
                  to="/exams"
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#22C55E] hover:underline mt-2"
                >
                  <span>Đi tới Luyện đề</span>
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};
