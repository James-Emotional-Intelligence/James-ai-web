import { db } from '../db/mysql';
import {
  ReportOverviewResponse,
  DailyStudyStat,
  SubjectReportStat,
  TopicMasteryStat,
  PeriodComparison,
  ReportRecommendation,
} from '../../shared/types';
import { taskRepo } from './task-repository';
import { focusRepo } from './focus-repository';
import { quizRepo } from './quiz-repository';
import { subjectRepo } from './subject-repository';
import { AiAdapter } from '../services/ai-adapter';

export interface ReportQueryOptions {
  period?: 'week' | 'month' | 'custom';
  from?: string;
  to?: string;
  timezone?: string;
}

function getTimezoneOffsetString(date: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value;
    if (tzPart && tzPart.startsWith('GMT')) {
      const offset = tzPart.slice(3);
      if (offset.length === 6) return offset;
      if (offset.length === 3) return `${offset}:00`;
      if (offset === '') return '+00:00';
    }
  } catch {}
  return '+07:00';
}

export class ReportRepository {
  private static instance: ReportRepository;

  private constructor() {}

  public static getInstance(): ReportRepository {
    if (!ReportRepository.instance) {
      ReportRepository.instance = new ReportRepository();
    }
    return ReportRepository.instance;
  }

  /**
   * Resolves exact start and end Date boundaries for the requested period in user timezone
   */
  public resolvePeriodBoundaries(
    options: ReportQueryOptions,
    timezone = 'Asia/Ho_Chi_Minh'
  ): {
    periodType: 'week' | 'month' | 'custom';
    startDate: Date;
    endDate: Date;
    prevStartDate: Date;
    prevEndDate: Date;
    label: string;
  } {
    const now = new Date();
    const periodType = options.period || 'week';
    const tzOffset = getTimezoneOffsetString(now, timezone);

    if (periodType === 'custom' && options.from && options.to) {
      const fromStr = options.from.split('T')[0];
      const toStr = options.to.split('T')[0];
      const startDate = new Date(`${fromStr}T00:00:00.000${tzOffset}`);
      const endDate = new Date(`${toStr}T23:59:59.999${tzOffset}`);
      const durationMs = Math.max(86400000, endDate.getTime() - startDate.getTime());
      const prevEndDate = new Date(startDate.getTime() - 1);
      const prevStartDate = new Date(prevEndDate.getTime() - durationMs);

      const d1 = startDate.toLocaleDateString('vi-VN', { timeZone: timezone });
      const d2 = endDate.toLocaleDateString('vi-VN', { timeZone: timezone });
      return {
        periodType: 'custom',
        startDate,
        endDate,
        prevStartDate,
        prevEndDate,
        label: `Khoảng: ${d1} - ${d2}`,
      };
    }

    // Get current year, month, day in user's timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const curYear = parseInt(parts.find((p) => p.type === 'year')?.value || '2026', 10);
    const curMonth = parseInt(parts.find((p) => p.type === 'month')?.value || '1', 10);
    const curDay = parseInt(parts.find((p) => p.type === 'day')?.value || '1', 10);

    if (periodType === 'month') {
      const lastDayOfMonth = new Date(Date.UTC(curYear, curMonth, 0)).getUTCDate();
      const mStr = String(curMonth).padStart(2, '0');
      const startIso = `${curYear}-${mStr}-01T00:00:00.000${tzOffset}`;
      const endIso = `${curYear}-${mStr}-${String(lastDayOfMonth).padStart(2, '0')}T23:59:59.999${tzOffset}`;

      const startDate = new Date(startIso);
      const endDate = new Date(endIso);

      const prevYear = curMonth === 1 ? curYear - 1 : curYear;
      const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
      const lastDayOfPrevMonth = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
      const pmStr = String(prevMonth).padStart(2, '0');
      const prevStartIso = `${prevYear}-${pmStr}-01T00:00:00.000${tzOffset}`;
      const prevEndIso = `${prevYear}-${pmStr}-${String(lastDayOfPrevMonth).padStart(2, '0')}T23:59:59.999${tzOffset}`;

      return {
        periodType: 'month',
        startDate,
        endDate,
        prevStartDate: new Date(prevStartIso),
        prevEndDate: new Date(prevEndIso),
        label: `Tháng ${curMonth}/${curYear}`,
      };
    }

    // Default: 'week' (Monday 00:00:00 to Sunday 23:59:59 in user timezone)
    const localDateObj = new Date(`${curYear}-${String(curMonth).padStart(2, '0')}-${String(curDay).padStart(2, '0')}T12:00:00.000Z`);
    const dayOfWeek = localDateObj.getUTCDay(); // 0 is Sun, 1 is Mon
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;

    const mondayLocal = new Date(localDateObj.getTime() + diffToMonday * 86400000);
    const mY = mondayLocal.getUTCFullYear();
    const mM = String(mondayLocal.getUTCMonth() + 1).padStart(2, '0');
    const mD = String(mondayLocal.getUTCDate()).padStart(2, '0');

    const sundayLocal = new Date(mondayLocal.getTime() + 6 * 86400000);
    const sY = sundayLocal.getUTCFullYear();
    const sM = String(sundayLocal.getUTCMonth() + 1).padStart(2, '0');
    const sD = String(sundayLocal.getUTCDate()).padStart(2, '0');

    const startIso = `${mY}-${mM}-${mD}T00:00:00.000${tzOffset}`;
    const endIso = `${sY}-${sM}-${sD}T23:59:59.999${tzOffset}`;

    const startDate = new Date(startIso);
    const endDate = new Date(endIso);

    const prevStartDate = new Date(startDate.getTime() - 7 * 86400000);
    const prevEndDate = new Date(endDate.getTime() - 7 * 86400000);

    return {
      periodType: 'week',
      startDate,
      endDate,
      prevStartDate,
      prevEndDate,
      label: `Tuần (${mD}/${mM} - ${sD}/${sM})`,
    };
  }

  /**
   * Generates comprehensive Study Report computed purely from MySQL
   */
  public async getOverview(
    userId: string,
    options: ReportQueryOptions = {}
  ): Promise<ReportOverviewResponse> {
    const timezone = options.timezone || 'Asia/Ho_Chi_Minh';
    const { periodType, startDate, endDate, prevStartDate, prevEndDate, label } =
      this.resolvePeriodBoundaries(options, timezone);

    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();
    const prevStartIso = prevStartDate.toISOString();
    const prevEndIso = prevEndDate.toISOString();

    if (db.isHealthy()) {
      // 1. Tasks in current period
      const [taskAgg] = await db.query<any>(
        `SELECT 
           COUNT(*) as total_tasks,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
           SUM(estimated_minutes) as planned_minutes,
           SUM(CASE WHEN status = 'completed' AND (due_at IS NULL OR completed_at <= due_at OR updated_at <= due_at) THEN 1 ELSE 0 END) as on_time_tasks,
           SUM(CASE WHEN status = 'completed' AND due_at IS NOT NULL THEN 1 ELSE 0 END) as tasks_with_due
         FROM study_tasks
         WHERE user_id = ?
           AND (
             (scheduled_start_at >= ? AND scheduled_start_at <= ?)
             OR (scheduled_start_at IS NULL AND due_at >= ? AND due_at <= ?)
             OR (scheduled_start_at IS NULL AND due_at IS NULL AND created_at >= ? AND created_at <= ?)
           )`,
        [userId, startIso, endIso, startIso, endIso, startIso, endIso]
      );

      // 2. Focus sessions in current period
      const [focusAgg] = await db.query<any>(
        `SELECT 
           COUNT(*) as total_sessions,
           SUM(CASE WHEN state = 'completed' THEN 1 ELSE 0 END) as completed_sessions,
           SUM(CASE WHEN state = 'abandoned' THEN 1 ELSE 0 END) as abandoned_sessions,
           SUM(CASE 
             WHEN state = 'completed' AND ended_at IS NOT NULL AND started_at IS NOT NULL 
               THEN GREATEST(1, ROUND((TIMESTAMPDIFF(SECOND, started_at, ended_at) - accumulated_pause_seconds) / 60))
             WHEN state = 'completed' THEN planned_minutes
             ELSE 0 
           END) as actual_focus_minutes,
           SUM(accumulated_pause_seconds) as total_pause_seconds
         FROM focus_sessions
         WHERE user_id = ?
           AND started_at >= ? AND started_at <= ?`,
        [userId, startIso, endIso]
      );

      // 3. Quiz attempts in current period
      const [quizAgg] = await db.query<any>(
        `SELECT 
           COUNT(*) as total_attempts,
           AVG(score) as avg_score
         FROM quiz_attempts
         WHERE user_id = ?
           AND status = 'submitted'
           AND submitted_at >= ? AND submitted_at <= ?`,
        [userId, startIso, endIso]
      );

      // 4. Previous period aggregates for comparison
      const [prevFocusAgg] = await db.query<any>(
        `SELECT 
           SUM(CASE 
             WHEN state = 'completed' AND ended_at IS NOT NULL AND started_at IS NOT NULL 
               THEN GREATEST(1, ROUND((TIMESTAMPDIFF(SECOND, started_at, ended_at) - accumulated_pause_seconds) / 60))
             WHEN state = 'completed' THEN planned_minutes
             ELSE 0 
           END) as actual_focus_minutes
         FROM focus_sessions
         WHERE user_id = ?
           AND started_at >= ? AND started_at <= ?`,
        [userId, prevStartIso, prevEndIso]
      );

      const [prevTaskAgg] = await db.query<any>(
        `SELECT SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
         FROM study_tasks
         WHERE user_id = ?
           AND (
             (scheduled_start_at >= ? AND scheduled_start_at <= ?)
             OR (scheduled_start_at IS NULL AND due_at >= ? AND due_at <= ?)
             OR (scheduled_start_at IS NULL AND due_at IS NULL AND created_at >= ? AND created_at <= ?)
           )`,
        [userId, prevStartIso, prevEndIso, prevStartIso, prevEndIso, prevStartIso, prevEndIso]
      );

      const [prevQuizAgg] = await db.query<any>(
        `SELECT AVG(score) as avg_score
         FROM quiz_attempts
         WHERE user_id = ?
           AND status = 'submitted'
           AND submitted_at >= ? AND submitted_at <= ?`,
        [userId, prevStartIso, prevEndIso]
      );

      // 5. Subject Breakdown
      const subjectRows = await db.query<any>(
        `SELECT 
           s.id as subject_id,
           s.name as subject_name,
           s.color as subject_color,
           COALESCE((
             SELECT SUM(t.estimated_minutes)
             FROM study_tasks t
             WHERE t.subject_id = s.id AND t.user_id = ?
               AND (
                 (t.scheduled_start_at >= ? AND t.scheduled_start_at <= ?)
                 OR (t.scheduled_start_at IS NULL AND t.due_at >= ? AND t.due_at <= ?)
                 OR (t.scheduled_start_at IS NULL AND t.due_at IS NULL AND t.created_at >= ? AND t.created_at <= ?)
               )
           ), 0) as planned_minutes,
           COALESCE((
             SELECT SUM(CASE 
               WHEN f.state = 'completed' AND f.ended_at IS NOT NULL AND f.started_at IS NOT NULL 
                 THEN GREATEST(1, ROUND((TIMESTAMPDIFF(SECOND, f.started_at, f.ended_at) - f.accumulated_pause_seconds) / 60))
               WHEN f.state = 'completed' THEN f.planned_minutes
               ELSE 0 
             END)
             FROM focus_sessions f
             JOIN study_tasks ft ON f.task_id = ft.id
             WHERE ft.subject_id = s.id AND f.user_id = ?
               AND f.started_at >= ? AND f.started_at <= ?
           ), 0) as actual_minutes,
           COALESCE((
             SELECT COUNT(*)
             FROM study_tasks t
             WHERE t.subject_id = s.id AND t.user_id = ?
               AND (
                 (t.scheduled_start_at >= ? AND t.scheduled_start_at <= ?)
                 OR (t.scheduled_start_at IS NULL AND t.due_at >= ? AND t.due_at <= ?)
                 OR (t.scheduled_start_at IS NULL AND t.due_at IS NULL AND t.created_at >= ? AND t.created_at <= ?)
               )
           ), 0) as task_count,
           COALESCE((
             SELECT SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END)
             FROM study_tasks t
             WHERE t.subject_id = s.id AND t.user_id = ?
               AND (
                 (t.scheduled_start_at >= ? AND t.scheduled_start_at <= ?)
                 OR (t.scheduled_start_at IS NULL AND t.due_at >= ? AND t.due_at <= ?)
                 OR (t.scheduled_start_at IS NULL AND t.due_at IS NULL AND t.created_at >= ? AND t.created_at <= ?)
               )
           ), 0) as completed_task_count,
           COALESCE((
             SELECT COUNT(*)
             FROM quiz_attempts qa
             JOIN quizzes qz ON qa.quiz_id = qz.id
             WHERE qz.subject_id = s.id AND qa.user_id = ? AND qa.status = 'submitted'
               AND qa.submitted_at >= ? AND qa.submitted_at <= ?
           ), 0) as quiz_count,
           (
             SELECT AVG(qa.score)
             FROM quiz_attempts qa
             JOIN quizzes qz ON qa.quiz_id = qz.id
             WHERE qz.subject_id = s.id AND qa.user_id = ? AND qa.status = 'submitted'
               AND qa.submitted_at >= ? AND qa.submitted_at <= ?
           ) as avg_quiz_score
         FROM subjects s
         WHERE s.user_id = ? AND s.archived_at IS NULL
         ORDER BY planned_minutes DESC, actual_minutes DESC, s.name ASC`,
        [
          userId, startIso, endIso, startIso, endIso, startIso, endIso,
          userId, startIso, endIso,
          userId, startIso, endIso, startIso, endIso, startIso, endIso,
          userId, startIso, endIso, startIso, endIso, startIso, endIso,
          userId, startIso, endIso,
          userId, startIso, endIso,
          userId,
        ]
      );

      // 6. Topic Mastery Rows
      const topicRows = await db.query<any>(
        `SELECT tm.topic_key, tm.mastery_score, tm.confidence, tm.evidence_count,
                tm.last_practiced_at, s.name as subject_name, s.color as subject_color
         FROM topic_mastery tm
         JOIN subjects s ON tm.subject_id = s.id
         WHERE tm.user_id = ?
         ORDER BY tm.mastery_score ASC`,
        [userId]
      );

      // 7. Daily Study aggregation for each day in range
      const daysCount = Math.min(
        90,
        Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000))
      );
      const dailyStudy: DailyStudyStat[] = [];

      for (let i = 0; i < daysCount; i++) {
        const d = new Date(startDate.getTime() + i * 86400000);
        const dayStart = new Date(d);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(d);
        dayEnd.setHours(23, 59, 59, 999);

        const dateStr = d.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
        const dayLabelMap = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
        const dayOfWeek = d.getDay();
        const dayLabel = dayLabelMap[dayOfWeek];

        // Focus minutes on day
        const [dayFocus] = await db.query<any>(
          `SELECT SUM(CASE 
             WHEN state = 'completed' AND ended_at IS NOT NULL AND started_at IS NOT NULL 
               THEN GREATEST(1, ROUND((TIMESTAMPDIFF(SECOND, started_at, ended_at) - accumulated_pause_seconds) / 60))
             WHEN state = 'completed' THEN planned_minutes
             ELSE 0 
           END) as actual_minutes
           FROM focus_sessions
           WHERE user_id = ? AND started_at >= ? AND started_at <= ?`,
          [userId, dayStart.toISOString(), dayEnd.toISOString()]
        );

        // Tasks on day
        const [dayTask] = await db.query<any>(
          `SELECT 
             SUM(estimated_minutes) as planned_minutes,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
           FROM study_tasks
           WHERE user_id = ?
             AND (
               (scheduled_start_at >= ? AND scheduled_start_at <= ?)
               OR (scheduled_start_at IS NULL AND due_at >= ? AND due_at <= ?)
             )`,
          [userId, dayStart.toISOString(), dayEnd.toISOString(), dayStart.toISOString(), dayEnd.toISOString()]
        );

        // Quiz avg on day
        const [dayQuiz] = await db.query<any>(
          `SELECT AVG(score) as avg_score
           FROM quiz_attempts
           WHERE user_id = ? AND status = 'submitted' AND submitted_at >= ? AND submitted_at <= ?`,
          [userId, dayStart.toISOString(), dayEnd.toISOString()]
        );

        dailyStudy.push({
          date: dateStr,
          dayLabel,
          actualMinutes: Number(dayFocus?.actual_minutes) || 0,
          plannedMinutes: Number(dayTask?.planned_minutes) || 0,
          completedTasksCount: Number(dayTask?.completed_tasks) || 0,
          quizScoreAvg: dayQuiz?.avg_score !== null && dayQuiz?.avg_score !== undefined ? Number(Number(dayQuiz.avg_score).toFixed(1)) : null,
        });
      }

      // 8. Streak calculation (consecutive days with at least 1 completed task, focus session, or quiz)
      const streakDays = await this.calculateStreakDays(userId, timezone);

      // Compute summaries
      const totalTasks = Number(taskAgg?.total_tasks) || 0;
      const completedTasks = Number(taskAgg?.completed_tasks) || 0;
      const plannedMinutes = Number(taskAgg?.planned_minutes) || 0;
      const actualFocusMinutes = Number(focusAgg?.actual_focus_minutes) || 0;
      const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      const tasksWithDue = Number(taskAgg?.tasks_with_due) || 0;
      const onTimeTasks = Number(taskAgg?.on_time_tasks) || 0;
      const onTimeRate = tasksWithDue > 0 ? Math.round((onTimeTasks / tasksWithDue) * 100) : null;

      const totalQuizAttempts = Number(quizAgg?.total_attempts) || 0;
      const averageQuizScore = quizAgg?.avg_score !== null && quizAgg?.avg_score !== undefined
        ? Number(Number(quizAgg.avg_score).toFixed(1))
        : null;

      // Focus Quality Score:
      const totalSessions = Number(focusAgg?.total_sessions) || 0;
      const completedSessions = Number(focusAgg?.completed_sessions) || 0;
      const totalPauseSec = Number(focusAgg?.total_pause_seconds) || 0;

      let focusQualityScore = 100;
      if (totalSessions > 0) {
        const completionRatio = completedSessions / totalSessions;
        const avgPauseMinutes = totalPauseSec / (totalSessions * 60);
        const pauseDiscipline = Math.max(0, 100 - avgPauseMinutes * 10);
        const quizPerf = averageQuizScore !== null ? (averageQuizScore / 10) * 100 : 100;

        focusQualityScore = Math.round(completionRatio * 60 + (pauseDiscipline / 100) * 25 + (quizPerf / 100) * 15);
      }

      // Subject breakdown mapping
      const subjectBreakdown: SubjectReportStat[] = subjectRows.map((sr) => {
        const planned = Number(sr.planned_minutes) || 0;
        const actual = Number(sr.actual_minutes) || 0;
        return {
          subjectId: sr.subject_id,
          subjectName: sr.subject_name,
          color: sr.subject_color || '#22C55E',
          plannedMinutes: planned,
          actualMinutes: actual,
          completionPercent: planned > 0 ? Math.min(100, Math.round((actual / planned) * 100)) : (actual > 0 ? 100 : 0),
          taskCount: Number(sr.task_count) || 0,
          completedTaskCount: Number(sr.completed_task_count) || 0,
          quizCount: Number(sr.quiz_count) || 0,
          avgQuizScore: sr.avg_quiz_score !== null ? Number(Number(sr.avg_quiz_score).toFixed(1)) : null,
        };
      });

      // Topic mastery mapping
      const topicMastery: TopicMasteryStat[] = topicRows.map((tr) => {
        const score = Number(tr.mastery_score) || 0;
        let status: TopicMasteryStat['status'] = 'needs_review';
        let statusLabel = 'Cần ôn thêm';
        if (score >= 80) {
          status = 'mastered';
          statusLabel = 'Nắm vững';
        } else if (score >= 65) {
          status = 'good';
          statusLabel = 'Khá tốt';
        }

        return {
          topicKey: tr.topic_key,
          subjectName: tr.subject_name,
          subjectColor: tr.subject_color,
          masteryScore: score,
          confidence: Number(tr.confidence) || 50,
          evidenceCount: Number(tr.evidence_count) || 1,
          status,
          statusLabel,
          lastPracticedAt: tr.last_practiced_at ? tr.last_practiced_at.toISOString?.() || String(tr.last_practiced_at) : undefined,
        };
      });

      const weakTopics = topicMastery.filter((t) => t.status === 'needs_review');
      const strongTopics = topicMastery.filter((t) => t.status === 'mastered');

      // 8. Subject Insights (Môn mạnh & yếu - 7.2)
      const subjectInsights = subjectBreakdown.map((sb) => {
        const hasEnoughData = sb.quizCount >= 1 || sb.taskCount >= 2;
        if (!hasEnoughData) {
          return {
            subjectId: sb.subjectId,
            subjectName: sb.subjectName,
            color: sb.color,
            status: 'insufficient_data' as const,
            headline: 'Cần tích lũy thêm dữ liệu',
            explanation: `Chưa có đủ số lượng bài tập và kiểm tra (${sb.taskCount} nhiệm vụ, ${sb.quizCount} bài test) để kết luận chính xác về năng lực môn này.`,
            avgScore: sb.avgQuizScore,
            completionRate: sb.completionPercent,
          };
        }

        if ((sb.avgQuizScore !== null && sb.avgQuizScore >= 7.5) || sb.completionPercent >= 80) {
          return {
            subjectId: sb.subjectId,
            subjectName: sb.subjectName,
            color: sb.color,
            status: 'improving' as const,
            headline: 'Môn học đang tiến bộ vững chắc',
            explanation: `Dựa trên ${sb.taskCount} nhiệm vụ học tập (hoàn thành ${sb.completedTaskCount}/${sb.taskCount}) và điểm kiểm tra đạt TB ${sb.avgQuizScore ?? 'Tốt'}/10.`,
            avgScore: sb.avgQuizScore,
            completionRate: sb.completionPercent,
          };
        }

        return {
          subjectId: sb.subjectId,
          subjectName: sb.subjectName,
          color: sb.color,
          status: 'needs_attention' as const,
          headline: 'Môn học cần cải thiện & ôn tập thêm',
          explanation: `Tỷ lệ hoàn thành nhiệm vụ đạt ${sb.completionPercent}% và điểm trung bình ${sb.avgQuizScore !== null ? `${sb.avgQuizScore}/10` : 'chưa cao'}. Khuyến nghị tăng thời lượng tập trung.`,
          avgScore: sb.avgQuizScore,
          completionRate: sb.completionPercent,
        };
      });

      // 9. Score Progression Query (7.3)
      let scoreProgression: any[] = [];
      try {
        const rows = await db.query<any>(
          `SELECT qa.id as attempt_id, qz.title as quiz_title, s.name as subject_name,
                  qa.score, qa.max_score, qa.submitted_at
           FROM quiz_attempts qa
           JOIN quizzes qz ON qa.quiz_id = qz.id
           LEFT JOIN subjects s ON qz.subject_id = s.id
           WHERE qa.user_id = ? AND qa.status = 'submitted'
           ORDER BY qa.submitted_at ASC
           LIMIT 15`,
          [userId]
        );
        scoreProgression = rows.map((r) => ({
          attemptId: r.attempt_id,
          quizTitle: r.quiz_title || 'Đề luyện tập',
          subjectName: r.subject_name || 'Môn học',
          score: Number(r.score) || 0,
          maxScore: Number(r.max_score) || 10,
          submittedAt: r.submitted_at ? (r.submitted_at.toISOString?.() || String(r.submitted_at)) : new Date().toISOString(),
        }));
      } catch {}

      // 10. Next Study Action Plan (7.3)
      const nextStudyPlan: string[] = [];
      if (weakTopics.length > 0) {
        nextStudyPlan.push(`Dành 30 phút ôn lại chủ đề "${weakTopics[0].topicKey}" (${weakTopics[0].subjectName}) bằng cách tạo đề luyện tập 5 câu.`);
      }
      if (subjectInsights.some((s) => s.status === 'needs_attention')) {
        const target = subjectInsights.find((s) => s.status === 'needs_attention')!;
        nextStudyPlan.push(`Ưu tiên hoàn thành các bài tập tồn đọng của môn ${target.subjectName} vào khung giờ học tối.`);
      }
      nextStudyPlan.push('Duy trì tối thiểu 2 phiên Pomodoro 25 phút mỗi ngày để giữ vững phong độ tập trung.');

      // Comparison to previous period
      const prevActual = Number(prevFocusAgg?.actual_focus_minutes) || 0;
      const prevCompletedTasks = Number(prevTaskAgg?.completed_tasks) || 0;
      const prevQuizAvg = prevQuizAgg?.avg_score !== null && prevQuizAgg?.avg_score !== undefined ? Number(prevQuizAgg.avg_score) : null;

      const hasPreviousData = prevActual > 0 || prevCompletedTasks > 0;
      const actualMinutesDiffPercent = prevActual > 0
        ? Math.round(((actualFocusMinutes - prevActual) / prevActual) * 100)
        : null;
      const completedTasksDiff = completedTasks - prevCompletedTasks;
      const quizScoreDiff = averageQuizScore !== null && prevQuizAvg !== null
        ? Number((averageQuizScore - prevQuizAvg).toFixed(1))
        : null;

      const comparison: PeriodComparison = {
        actualMinutesDiffPercent,
        completedTasksDiff,
        quizScoreDiff,
        hasPreviousData,
      };

      // Generate Deterministic & AI Recommendations
      const recommendations = this.generateRecommendations({
        actualFocusMinutes,
        plannedMinutes,
        streakDays,
        weakTopics,
        averageQuizScore,
        onTimeRate,
      });

      const hasData = actualFocusMinutes > 0 || totalTasks > 0 || totalQuizAttempts > 0;
      const avgSessionMinutes = completedSessions > 0 ? Math.round(actualFocusMinutes / completedSessions) : 0;

      return {
        period: {
          type: periodType,
          from: startIso,
          to: endIso,
          timezone,
          label,
        },
        summary: {
          plannedMinutes,
          plannedHours: Number((plannedMinutes / 60).toFixed(1)),
          actualFocusMinutes,
          actualFocusHours: Number((actualFocusMinutes / 60).toFixed(1)),
          totalTasks,
          completedTasks,
          completionRate,
          onTimeRate,
          averageQuizScore,
          totalQuizAttempts,
          totalCompletedSessions: completedSessions,
          avgSessionMinutes,
          streakDays,
          focusQualityScore,
        },
        dailyStudy,
        subjectBreakdown,
        topicMastery,
        weakTopics,
        strongTopics,
        subjectInsights,
        scoreProgression,
        nextStudyPlan,
        comparison,
        recommendations,
        hasData,
      };
    }

    // Offline / demo in-memory computation
    return this.getOfflineReport(userId, options);
  }

  /**
   * Calculates current consecutive streak days based on study activity
   */
  private async calculateStreakDays(userId: string, timezone: string): Promise<number> {
    try {
      const rows = await db.query<any>(
        `SELECT DISTINCT DATE(CONVERT_TZ(activity_time, '+00:00', '+07:00')) as active_date
         FROM (
           SELECT started_at as activity_time FROM focus_sessions WHERE user_id = ? AND state = 'completed'
           UNION ALL
           SELECT completed_at as activity_time FROM study_tasks WHERE user_id = ? AND status = 'completed' AND completed_at IS NOT NULL
           UNION ALL
           SELECT submitted_at as activity_time FROM quiz_attempts WHERE user_id = ? AND status = 'submitted'
         ) act
         ORDER BY active_date DESC
         LIMIT 60`,
        [userId, userId, userId]
      );

      if (!rows || rows.length === 0) return 0;

      const activeDates = new Set(rows.map((r: any) => {
        const d = new Date(r.active_date);
        return d.toLocaleDateString('en-CA', { timeZone: timezone });
      }));

      let streak = 0;
      const checkDate = new Date();

      // Check if today is active, if not check yesterday as starting anchor
      const todayStr = checkDate.toLocaleDateString('en-CA', { timeZone: timezone });
      if (!activeDates.has(todayStr)) {
        checkDate.setDate(checkDate.getDate() - 1);
      }

      while (true) {
        const dStr = checkDate.toLocaleDateString('en-CA', { timeZone: timezone });
        if (activeDates.has(dStr)) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }

      return streak;
    } catch {
      return 0;
    }
  }

  /**
   * Generates deterministic and AI recommendations based on real metrics
   */
  private generateRecommendations(data: {
    actualFocusMinutes: number;
    plannedMinutes: number;
    streakDays: number;
    weakTopics: TopicMasteryStat[];
    averageQuizScore: number | null;
    onTimeRate: number | null;
  }): ReportRecommendation[] {
    const recs: ReportRecommendation[] = [];

    if (data.streakDays >= 3) {
      recs.push({
        id: 'rec_streak',
        type: 'habit',
        message: `Em đang duy trì chuỗi ${data.streakDays} ngày học liên tục rất xuất sắc! Hãy tiếp tục duy trì thói quen này.`,
      });
    }

    if (data.weakTopics.length > 0) {
      const topWeak = data.weakTopics[0];
      recs.push({
        id: 'rec_weak_topic',
        type: 'weakness',
        message: `Chủ đề "${topWeak.topicKey}" môn ${topWeak.subjectName} đang cần củng cố thêm (đạt ${topWeak.masteryScore}%).`,
        actionLabel: 'Luyện đề chủ đề này',
        actionUrl: '/exams',
      });
    }

    if (data.plannedMinutes > 0 && data.actualFocusMinutes < data.plannedMinutes * 0.6) {
      recs.push({
        id: 'rec_focus_time',
        type: 'schedule',
        message: 'Thời gian tự học thực tế đang thấp hơn kế hoạch đề ra. Em nên phân bổ thêm các phiên Pomodoro 25 phút.',
        actionLabel: 'Bắt đầu phiên học',
        actionUrl: '/focus',
      });
    } else if (data.actualFocusMinutes >= data.plannedMinutes && data.plannedMinutes > 0) {
      recs.push({
        id: 'rec_focus_success',
        type: 'strength',
        message: 'Em đã hoàn thành xuất sắc mục tiêu thời gian học tập trong kỳ này!',
      });
    }

    if (data.averageQuizScore !== null && data.averageQuizScore < 6.5) {
      recs.push({
        id: 'rec_quiz_score',
        type: 'weakness',
        message: `Điểm thi thử trung bình đạt ${data.averageQuizScore}/10. Hãy đọc lại tóm tắt tài liệu trước khi làm đề mới.`,
        actionLabel: 'Xem kho tài liệu',
        actionUrl: '/materials',
      });
    }

    if (recs.length === 0) {
      recs.push({
        id: 'rec_default',
        type: 'habit',
        message: 'Hãy bắt đầu các phiên tự học và làm bài ôn tập để Jami phân tích biểu đồ tiến độ cho em nhé.',
        actionLabel: 'Xem nhiệm vụ hôm nay',
        actionUrl: '/today',
      });
    }

    return recs;
  }

  /**
   * Offline / in-memory calculation
   */
  private async getOfflineReport(
    userId: string,
    options: ReportQueryOptions
  ): Promise<ReportOverviewResponse> {
    const timezone = options.timezone || 'Asia/Ho_Chi_Minh';
    const { periodType, startDate, endDate, label } = this.resolvePeriodBoundaries(options, timezone);

    const tasks = await taskRepo.getByUserId(userId);
    const sessions = await focusRepo.getSessionsByUserId(userId);
    const attempts = await quizRepo.getAttemptsByUserId(userId);
    const userSubjects = await subjectRepo.getByUserId(userId);
    const subjects = userSubjects.length > 0 ? userSubjects : [
      { id: 'subj-math', userId, name: 'Toán học', color: '#22C55E' },
      { id: 'subj-lit', userId, name: 'Ngữ văn', color: '#EC4899' },
      { id: 'subj-eng', userId, name: 'Tiếng Anh', color: '#3B82F6' },
      { id: 'subj-phy', userId, name: 'Vật lý', color: '#8B5CF6' },
    ];

    const plannedMinutes = tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
    const completedTasks = tasks.filter((t) => t.status === 'completed').length;
    const actualFocusMinutes = sessions
      .filter((s) => s.state === 'completed')
      .reduce((sum, s) => sum + s.plannedMinutes, 0);

    const totalQuizAttempts = attempts.length;
    const averageQuizScore = totalQuizAttempts > 0
      ? Number((attempts.reduce((sum, a) => sum + a.score, 0) / totalQuizAttempts).toFixed(1))
      : null;

    const subjectBreakdown: SubjectReportStat[] = subjects.map((s) => {
      const sTasks = tasks.filter((t) => t.subjectId === s.id);
      const sPlanned = sTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
      const sCompleted = sTasks.filter((t) => t.status === 'completed').length;
      return {
        subjectId: s.id,
        subjectName: s.name,
        color: s.color,
        plannedMinutes: sPlanned,
        actualMinutes: sCompleted > 0 ? sPlanned : 0,
        completionPercent: sPlanned > 0 ? Math.round((sCompleted / sTasks.length) * 100) : 0,
        taskCount: sTasks.length,
        completedTaskCount: sCompleted,
        quizCount: 0,
        avgQuizScore: null,
      };
    });

    const daysCount = Math.min(7, Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000)));
    const dailyStudy: DailyStudyStat[] = [];
    const dayLabelMap = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

    for (let i = 0; i < daysCount; i++) {
      const d = new Date(startDate.getTime() + i * 86400000);
      dailyStudy.push({
        date: d.toLocaleDateString('en-CA', { timeZone: timezone }),
        dayLabel: dayLabelMap[d.getDay()],
        actualMinutes: i === 0 ? actualFocusMinutes : 0,
        plannedMinutes: i === 0 ? plannedMinutes : 0,
        completedTasksCount: i === 0 ? completedTasks : 0,
        quizScoreAvg: i === 0 ? averageQuizScore : null,
      });
    }

    return {
      period: {
        type: periodType,
        from: startDate.toISOString(),
        to: endDate.toISOString(),
        timezone,
        label,
      },
      summary: {
        plannedMinutes,
        plannedHours: Number((plannedMinutes / 60).toFixed(1)),
        actualFocusMinutes,
        actualFocusHours: Number((actualFocusMinutes / 60).toFixed(1)),
        totalTasks: tasks.length,
        completedTasks,
        completionRate: tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0,
        onTimeRate: tasks.length > 0 ? 100 : null,
        averageQuizScore,
        totalQuizAttempts,
        streakDays: (actualFocusMinutes > 0 || completedTasks > 0) ? 1 : 0,
        focusQualityScore: 100,
      },
      dailyStudy,
      subjectBreakdown,
      topicMastery: [],
      weakTopics: [],
      strongTopics: [],
      comparison: {
        actualMinutesDiffPercent: null,
        completedTasksDiff: 0,
        quizScoreDiff: null,
        hasPreviousData: false,
      },
      recommendations: [
        {
          id: 'rec_init',
          type: 'habit',
          message: 'Bắt đầu các phiên tập trung và hoàn thành nhiệm vụ để hệ thống phân tích báo cáo chi tiết.',
          actionLabel: 'Hôm nay',
          actionUrl: '/today',
        },
      ],
      hasData: tasks.length > 0 || sessions.length > 0 || attempts.length > 0,
    };
  }

  /**
   * Generates CSV Export with anti-formula-injection escaping
   */
  public async generateCsvExport(userId: string, options: ReportQueryOptions = {}): Promise<string> {
    const report = await this.getOverview(userId, options);

    const escapeCell = (val: any): string => {
      if (val === null || val === undefined) return '""';
      let str = String(val).replace(/"/g, '""');
      // Anti CSV Formula Injection: prepend ' if starts with =, +, -, @, \t, \r
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      return `"${str}"`;
    };

    const lines: string[] = [];

    // UTF-8 BOM for Microsoft Excel
    lines.push('\uFEFF"BÁO CÁO HỌC TẬP JAMI AI"');
    lines.push(`"Kỳ báo cáo",${escapeCell(report.period.label)}`);
    lines.push(`"Từ ngày",${escapeCell(report.period.from.split('T')[0])}`);
    lines.push(`"Đến ngày",${escapeCell(report.period.to.split('T')[0])}`);
    lines.push('');

    // Summary Section
    lines.push('"TỔNG QUAN HỌC TẬP"');
    lines.push('"Chỉ số","Giá trị"');
    lines.push(`"Thời gian học thực tế (giờ)",${escapeCell(report.summary.actualFocusHours)}`);
    lines.push(`"Kế hoạch đề ra (giờ)",${escapeCell(report.summary.plannedHours)}`);
    lines.push(`"Nhiệm vụ hoàn thành",${escapeCell(`${report.summary.completedTasks}/${report.summary.totalTasks}`)}`);
    lines.push(`"Tỷ lệ hoàn thành (%)",${escapeCell(report.summary.completionRate)}`);
    lines.push(`"Điểm bài tập trung bình",${escapeCell(report.summary.averageQuizScore ?? 'Chưa có')}`);
    lines.push(`"Chuỗi ngày học liên tục",${escapeCell(report.summary.streakDays)}`);
    lines.push(`"Chỉ số chất lượng tập trung",${escapeCell(report.summary.focusQualityScore)}`);
    lines.push('');

    // Subject Breakdown Section
    lines.push('"PHÂN BỔ THEO MÔN HỌC"');
    lines.push('"Môn học","Kế hoạch (phút)","Thực tế (phút)","Tỷ lệ hoàn thành (%)","Số nhiệm vụ","Điểm trung bình"');
    for (const s of report.subjectBreakdown) {
      lines.push(
        [
          escapeCell(s.subjectName),
          escapeCell(s.plannedMinutes),
          escapeCell(s.actualMinutes),
          escapeCell(s.completionPercent),
          escapeCell(`${s.completedTaskCount}/${s.taskCount}`),
          escapeCell(s.avgQuizScore ?? 'N/A'),
        ].join(',')
      );
    }
    lines.push('');

    // Daily Log
    lines.push('"NHẬT KÝ HỌC TẬP THEO NGÀY"');
    lines.push('"Ngày","Thứ","Thời gian học (phút)","Kế hoạch (phút)","Số task xong","Điểm Quiz"');
    for (const d of report.dailyStudy) {
      lines.push(
        [
          escapeCell(d.date),
          escapeCell(d.dayLabel),
          escapeCell(d.actualMinutes),
          escapeCell(d.plannedMinutes),
          escapeCell(d.completedTasksCount),
          escapeCell(d.quizScoreAvg ?? 'N/A'),
        ].join(',')
      );
    }

    return lines.join('\r\n');
  }
}

export const reportRepo = ReportRepository.getInstance();
