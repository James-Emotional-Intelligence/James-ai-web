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
import { Link } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { ReportOverviewResponse } from '../../../shared/types';

export const ReportsPage: React.FC = () => {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [report, setReport] = useState<ReportOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const [isExporting, setIsExporting] = useState(false);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#0B120D] p-5 sm:p-6 rounded-3xl border border-[rgba(34,197,94,0.25)] shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-black text-[#F3FAF5] flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-[#22C55E]" />
            <span>Báo Cáo & Phân Tích Học Tập</span>
          </h1>
          <p className="text-xs text-[#A9B8AE] mt-1">
            Tổng hợp thời gian tự học, môn học trọng tâm và đánh giá mức độ nắm vững kiến thức từ dữ liệu thật
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <div className="flex items-center bg-[#101A13] p-1 rounded-2xl border border-[rgba(34,197,94,0.2)]">
            <button
              onClick={() => setPeriod('week')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                period === 'week'
                  ? 'bg-[#16A34A] text-[#050806] shadow-sm'
                  : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
              }`}
            >
              Tuần này
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                period === 'month'
                  ? 'bg-[#16A34A] text-[#050806] shadow-sm'
                  : 'text-[#A9B8AE] hover:text-[#F3FAF5]'
              }`}
            >
              Tháng này
            </button>
          </div>

          {/* Export CSV */}
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
          <span>Đang tính toán số liệu phân tích từ cơ sở dữ liệu...</span>
        </div>
      ) : report ? (
        <>
          {/* Period Title Badge */}
          <div className="flex items-center gap-2 text-xs font-bold text-[#86EFAC]">
            <Calendar className="w-4 h-4 text-[#22C55E]" />
            <span>{report.period.label}</span>
          </div>

          {/* 4-Card Overview Metric Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Focus Hours */}
            <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl flex flex-col justify-between space-y-3">
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

            {/* Quiz Average */}
            <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#A9B8AE] uppercase tracking-wider">
                  Điểm luyện tập TB
                </span>
                <Award className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <div className="text-2xl font-black text-[#F3FAF5]">
                  {report.summary.averageQuizScore !== null ? (
                    <>
                      {report.summary.averageQuizScore} <span className="text-sm font-normal text-[#A9B8AE]">/ 10</span>
                    </>
                  ) : (
                    <span className="text-base text-[#A9B8AE] font-normal">Chưa có bài làm</span>
                  )}
                </div>
                <div className="text-[11px] text-[#A9B8AE] mt-1">
                  {report.summary.totalQuizAttempts > 0
                    ? `Dựa trên ${report.summary.totalQuizAttempts} lượt làm bài`
                    : 'Hãy luyện đề để ghi nhận điểm'}
                </div>
              </div>
            </div>

            {/* Task Completion Rate */}
            <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl flex flex-col justify-between space-y-3">
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

            {/* Streak & Focus Quality */}
            <div className="bg-[#0B120D] p-5 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#A9B8AE] uppercase tracking-wider">
                  Chuỗi học & Chất lượng
                </span>
                <Flame className="w-4 h-4 text-orange-400" />
              </div>
              <div>
                <div className="text-2xl font-black text-[#F3FAF5] flex items-center gap-1.5">
                  <span>{report.summary.streakDays}</span>
                  <span className="text-sm font-normal text-[#A9B8AE]">ngày liên tiếp</span>
                </div>
                <div className="text-[11px] text-[#86EFAC] font-semibold mt-1">
                  Chỉ số tập trung: {report.summary.focusQualityScore}/100
                </div>
              </div>
            </div>
          </div>

          {/* Charts 2-Column: Daily Minutes & Subject Pie */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Daily Minutes Bar Chart (2 cols) */}
            <div className="lg:col-span-2 bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider">
                  Thời gian học từng ngày (Phút)
                </h2>
                <div className="flex items-center gap-3 text-[11px] text-[#A9B8AE]">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#16A34A] inline-block" /> Thực tế
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#101A13] border border-[rgba(34,197,94,0.2)] inline-block" /> Kế hoạch
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
                  <p className="font-bold text-[#F3FAF5]">Chưa có dữ liệu học tập trong kỳ này</p>
                  <p className="text-[11px]">Hãy bấm bắt đầu phiên Pomodoro hoặc hoàn thành nhiệm vụ để biểu đồ xuất hiện.</p>
                </div>
              )}
            </div>

            {/* Subject Ratio Pie */}
            <div className="bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4">
              <h2 className="text-xs font-bold text-[#86EFAC] uppercase tracking-wider">
                Phân bổ thời gian theo môn
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
                          <span className="font-mono text-[#F3FAF5] shrink-0">{item.actualMinutes}p</span>
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

          {/* Topic Mastery Section */}
          <div className="bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#F3FAF5] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#22C55E]" />
                <span>Mức độ làm chủ chủ đề & Đề xuất trọng tâm</span>
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

          {/* Recommendations from Jami */}
          {report.recommendations.length > 0 && (
            <div className="bg-[#0B120D] p-6 rounded-3xl border border-[rgba(34,197,94,0.2)] shadow-xl space-y-4">
              <h2 className="text-sm font-bold text-[#86EFAC] flex items-center gap-2 uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-[#22C55E]" />
                <span>Khuyến nghị học tập thông minh từ Jami AI</span>
              </h2>

              <div className="space-y-3">
                {report.recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-4 rounded-2xl bg-[#101A13] border border-[rgba(34,197,94,0.2)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <p className="text-[#F3FAF5] leading-relaxed">{rec.message}</p>
                    {rec.actionUrl && (
                      <Link
                        to={rec.actionUrl}
                        className="inline-flex items-center gap-1 font-bold text-[#86EFAC] hover:text-[#22C55E] shrink-0"
                      >
                        <span>{rec.actionLabel || 'Xem ngay'}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};
