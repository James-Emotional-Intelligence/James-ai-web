import { examStudyPlanRepo } from '../repositories/exam-study-plan-repository';
import { examRepo } from '../repositories/exam-repository';
import { mistakeRepo } from '../repositories/mistake-repository';
import { timetableRepo } from '../repositories/timetable-repository';
import { taskRepo } from '../repositories/task-repository';
import { userRepo } from '../repositories/user-repository';
import {
  ExamStudyPlan,
  ExamStudyPlanItem,
  ExamStudyPlanReplanProposal,
  ExamPlanActivityType,
} from '../../shared/types';
import { localDateTimeToUtc } from '../../shared/utils/date-utils';
import { DeterministicScheduler, getLocalParts } from './scheduler';
import { BusyEvent, StudyTask } from '../../shared/types';
import { db } from '../db/mysql';

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function formatDateVN(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

export class ExamStudyPlanService {
  private async proposeMissedSlot(userId: string, item: ExamStudyPlanItem, examAt: string, timezone: string,
    exactSlot?: { plannedDate: string; startAt: string; endAt: string }) {
    const profile = await userRepo.getProfile(userId);
    if (!profile) throw new Error('Chưa có hồ sơ để kiểm tra lịch trống.');
    const [existing, busy, timetable, rules] = await Promise.all([
      taskRepo.getByUserId(userId), timetableRepo.getBusyEvents(userId),
      timetableRepo.getTimetableEntries(userId), timetableRepo.getAvailabilityRules(userId),
    ]);
    const source: StudyTask = {
      id: `missed-${item.id}`, userId, subjectId: item.subjectId || '', subjectName: item.subjectName,
      title: item.title, status: 'pending', priority: 'high', difficulty: 'medium',
      dueAt: examAt, estimatedMinutes: item.plannedMinutes,
      minSessionMinutes: item.plannedMinutes, maxSessionMinutes: item.plannedMinutes,
      splittable: false, locked: false, completionPercent: 0,
    };
    const exactRule = exactSlot ? [{ id: `requested-${item.id}`, userId,
      dayOfWeek: getLocalParts(new Date(localDateTimeToUtc(exactSlot.plannedDate, exactSlot.startAt, timezone)), timezone).dayOfWeek,
      startLocalTime: exactSlot.startAt, endLocalTime: exactSlot.endAt,
      type: 'available' as const, isEnabled: true }] : [];
    const start = exactSlot ? new Date(localDateTimeToUtc(exactSlot.plannedDate, exactSlot.startAt, timezone)) : new Date();
    const proposal = DeterministicScheduler.generateScheduleProposal(
      [source], existing.filter((task) => task.id !== item.taskId), busy, timetable, profile,
      start, exactSlot ? 1 : 7, 'Dời phiên ôn bị bỏ lỡ vào giờ trống', [...exactRule, ...rules], timezone,
    );
    const scheduled = proposal.tasksToSchedule[0];
    if (!scheduled) return { slot: null, reason: proposal.unscheduledItems[0]?.reason || 'Không còn giờ trống trước kỳ kiểm tra.' };
    const localStart = getLocalParts(new Date(scheduled.proposedStart), timezone);
    const localEnd = getLocalParts(new Date(scheduled.proposedEnd), timezone);
    const slot = { plannedDate: localStart.dateKey,
      startAt: minutesToTime(localStart.hour * 60 + localStart.minute),
      endAt: minutesToTime(localEnd.hour * 60 + localEnd.minute) };
    if (exactSlot && (slot.plannedDate !== exactSlot.plannedDate || slot.startAt !== exactSlot.startAt || slot.endAt !== exactSlot.endAt)) {
      return { slot: null, reason: 'Khung giờ tự chọn trùng lịch bận hoặc không đủ thời lượng.' };
    }
    return { slot, reason: undefined };
  }

  /**
   * Generates a multi-day adaptive exam study plan based on exam syllabus and mistake notebook
   */
  public async generatePlanForExam(
    userId: string,
    examId: string,
    options?: {
      startDate?: string;
      dailyMinutes?: number;
      blackoutDates?: string[];
      timezone?: string;
    }
  ): Promise<ExamStudyPlan> {
    const exam = await examRepo.getById(userId, examId);
    if (!exam) {
      throw new Error('Không tìm thấy kỳ kiểm tra.');
    }

    const timezone = options?.timezone || 'Asia/Ho_Chi_Minh';
    const now = new Date();
    const todayStr = formatDateVN(now, timezone);
    const startDateStr = options?.startDate || todayStr;
    const examDateStr = formatDateVN(new Date(exam.examAt), timezone);

    const startObj = new Date(`${startDateStr}T00:00:00.000Z`);
    const examObj = new Date(`${examDateStr}T00:00:00.000Z`);
    const totalDays = Math.max(1, Math.ceil((examObj.getTime() - startObj.getTime()) / (24 * 3600 * 1000)));

    const dailyMinutes = options?.dailyMinutes || 45;
    const blackoutSet = new Set(options?.blackoutDates || []);

    // 1. Fetch relevant mistakes from Mistake Notebook
    const allMistakes = await mistakeRepo.getByUserId(userId, { subjectId: exam.subjectId });
    // Prioritize unmastered and matching topics
    const relevantMistakes = allMistakes.filter((m) => m.status !== 'mastered');

    // 2. Extract topics from Exam
    const examTopics = exam.topics && exam.topics.length > 0 ? exam.topics : [{ name: exam.scopeText || exam.title, weight: 3 }];

    // 3. Adaptive Schedule Generation Strategy based on remaining days
    // Day by day timeline planning
    const planItems: Array<Omit<ExamStudyPlanItem, 'id' | 'planId' | 'createdAt' | 'updatedAt'>> = [];
    const currentDayCursor = new Date(startObj);

    const daysCount = Math.min(totalDays, 90); // Multi-week / multi-month window up to 90 days

    for (let dayIdx = 0; dayIdx < daysCount; dayIdx++) {
      const dayDateStr = formatDateVN(currentDayCursor, timezone);

      // Skip blackout dates or days after exam
      if (blackoutSet.has(dayDateStr) || dayDateStr > examDateStr) {
        currentDayCursor.setDate(currentDayCursor.getDate() + 1);
        continue;
      }

      // Calculate free slots on this specific day
      const isExamDay = dayDateStr === examDateStr;
      const daysUntilExam = daysCount - dayIdx;

      // Find free slot for this day (default to evening 19:30 or afternoon)
      const slotStart = '19:30';
      const slotEnd = minutesToTime(timeToMinutes(slotStart) + dailyMinutes);

      if (isExamDay) {
        // Exam Day: Light recap & mental preparation only
        planItems.push({
          subjectId: exam.subjectId,
          subjectName: exam.subjectName,
          title: `Tổng kết nhanh trước giờ thi ${exam.title}`,
          description: 'Xem lại tóm tắt công thức, ghi nhớ lỗi sai thường gặp và chuẩn bị dụng cụ phòng thi.',
          activityType: 'light_revision',
          sourceType: 'exam_scope',
          priority: 'high',
          plannedDate: dayDateStr,
          startAt: '06:30',
          endAt: '07:00',
          plannedMinutes: 30,
          status: 'pending',
          sortOrder: planItems.length + 1,
        });
        break;
      }

      // Schedule strategy by duration window
      if (daysCount <= 3) {
        // Urgent 1-3 days strategy
        if (daysUntilExam === 3) {
          planItems.push({
            subjectId: exam.subjectId,
            subjectName: exam.subjectName,
            title: `Ôn tập lý thuyết cốt lõi & công thức (${examTopics.map((t) => t.name).slice(0, 2).join(', ')})`,
            description: 'Tập trung các định lý, công thức quan trọng nhất trong phạm vi thi.',
            activityType: 'theory_review',
            sourceType: 'exam_scope',
            priority: 'high',
            plannedDate: dayDateStr,
            startAt: slotStart,
            endAt: slotEnd,
            plannedMinutes: dailyMinutes,
            status: 'pending',
            sortOrder: planItems.length + 1,
          });
        } else if (daysUntilExam === 2) {
          const mistakeCount = Math.min(relevantMistakes.length, 5);
          planItems.push({
            subjectId: exam.subjectId,
            subjectName: exam.subjectName,
            title: `Luyện đề thi thử & Rà soát ${mistakeCount > 0 ? mistakeCount + ' lỗi sai' : 'dạng bài trọng tâm'}`,
            description: 'Bấm giờ làm đề thi thử chuẩn cấu trúc và đối chiếu đáp án chi tiết.',
            activityType: 'mock_test',
            sourceType: mistakeCount > 0 ? 'mistake_notebook' : 'mock_test',
            priority: 'high',
            plannedDate: dayDateStr,
            startAt: slotStart,
            endAt: slotEnd,
            plannedMinutes: dailyMinutes,
            status: 'pending',
            sortOrder: planItems.length + 1,
          });
        } else {
          // Day 1 before exam
          planItems.push({
            subjectId: exam.subjectId,
            subjectName: exam.subjectName,
            title: 'Rà soát lỗi sai & Ôn nhẹ nhàng trước ngày thi',
            description: 'Xem lại các câu hỏi từng làm sai, tránh học dồn quá khuya.',
            activityType: 'light_revision',
            sourceType: 'mistake_notebook',
            priority: 'medium',
            plannedDate: dayDateStr,
            startAt: slotStart,
            endAt: slotEnd,
            plannedMinutes: Math.min(30, dailyMinutes),
            status: 'pending',
            sortOrder: planItems.length + 1,
          });
        }
      } else if (daysCount <= 7) {
        // Standard 4-7 days phased review
        const phaseRatio = dayIdx / (daysCount - 1);
        if (phaseRatio <= 0.3) {
          const topic = examTopics[dayIdx % examTopics.length];
          planItems.push({
            subjectId: exam.subjectId,
            subjectName: exam.subjectName,
            title: `Ôn lý thuyết & bài tập cơ bản: ${topic?.name || 'Phần 1'}`,
            description: 'Hệ thống hóa sơ đồ tư duy lý thuyết và làm bài tập nhận biết, thông hiểu.',
            activityType: 'theory_review',
            sourceType: 'exam_scope',
            priority: 'high',
            plannedDate: dayDateStr,
            startAt: slotStart,
            endAt: slotEnd,
            plannedMinutes: dailyMinutes,
            status: 'pending',
            sortOrder: planItems.length + 1,
          });
        } else if (phaseRatio <= 0.6) {
          const topic = examTopics[(dayIdx + 1) % examTopics.length];
          planItems.push({
            subjectId: exam.subjectId,
            subjectName: exam.subjectName,
            title: `Luyện tập bài tập nâng cao & Vận dụng: ${topic?.name || 'Phần 2'}`,
            description: 'Luyện các dạng bài vận dụng, biến đổi công thức và dạng bài phân loại điểm cao.',
            activityType: 'advanced_practice',
            sourceType: 'exam_scope',
            priority: 'medium',
            plannedDate: dayDateStr,
            startAt: slotStart,
            endAt: slotEnd,
            plannedMinutes: dailyMinutes,
            status: 'pending',
            sortOrder: planItems.length + 1,
          });
        } else if (phaseRatio <= 0.85) {
          const mistakeCount = relevantMistakes.length;
          planItems.push({
            subjectId: exam.subjectId,
            subjectName: exam.subjectName,
            title: `Làm đề thi thử & Ôn ${mistakeCount > 0 ? mistakeCount + ' lỗi sai trong Sổ tay' : 'phần còn yếu'}`,
            description: 'Thi thử bấm giờ và giải lại các câu hỏi từng sai trong Sổ lỗi sai cá nhân.',
            activityType: 'mock_test',
            sourceType: 'mistake_notebook',
            priority: 'high',
            plannedDate: dayDateStr,
            startAt: slotStart,
            endAt: slotEnd,
            plannedMinutes: dailyMinutes,
            status: 'pending',
            sortOrder: planItems.length + 1,
          });
        } else {
          // Final day before exam
          planItems.push({
            subjectId: exam.subjectId,
            subjectName: exam.subjectName,
            title: 'Ôn nhẹ, đọc lại lưu ý quan trọng & Nghỉ ngơi sớm',
            description: 'Giữ tinh thần thoải mái, ngủ đủ giấc để có năng lượng tốt nhất cho buổi thi.',
            activityType: 'light_revision',
            sourceType: 'exam_scope',
            priority: 'low',
            plannedDate: dayDateStr,
            startAt: slotStart,
            endAt: slotEnd,
            plannedMinutes: Math.min(30, dailyMinutes),
            status: 'pending',
            sortOrder: planItems.length + 1,
          });
        }
      } else {
        // Extended >7 days strategy: distribute with dedicated rest & mistake review days
        const isRestDay = (dayIdx + 1) % 4 === 0 && daysUntilExam > 2;
        if (isRestDay) {
          // Buffer / rest day (light mistake recap 15m)
          planItems.push({
            subjectId: exam.subjectId,
            subjectName: exam.subjectName,
            title: 'Rà soát 3–5 câu lỗi sai ngắn & Thư giãn',
            description: 'Ngày ôn nhẹ nhàng giúp củng cố phản xạ không gây quá tải não bộ.',
            activityType: 'mistake_review',
            sourceType: 'mistake_notebook',
            priority: 'low',
            plannedDate: dayDateStr,
            startAt: slotStart,
            endAt: minutesToTime(timeToMinutes(slotStart) + 20),
            plannedMinutes: 20,
            status: 'pending',
            sortOrder: planItems.length + 1,
          });
        } else {
          const topic = examTopics[dayIdx % examTopics.length];
          const isMockDay = daysUntilExam === 3 || daysUntilExam === 7;

          if (isMockDay) {
            planItems.push({
              subjectId: exam.subjectId,
              subjectName: exam.subjectName,
              title: `Thi thử bấm giờ môn ${exam.subjectName || exam.title}`,
              description: 'Luyện đề tổng hợp theo ma trận kiểm tra chuẩn.',
              activityType: 'mock_test',
              sourceType: 'mock_test',
              priority: 'high',
              plannedDate: dayDateStr,
              startAt: slotStart,
              endAt: slotEnd,
              plannedMinutes: dailyMinutes,
              status: 'pending',
              sortOrder: planItems.length + 1,
            });
          } else {
            planItems.push({
              subjectId: exam.subjectId,
              subjectName: exam.subjectName,
              title: `Ôn tập chuyên đề: ${topic?.name || 'Kiến thức trọng tâm'}`,
              description: `Học lý thuyết và giải các bài tập chuyên sâu chuyên đề ${topic?.name || ''}.`,
              activityType: 'medium_practice',
              sourceType: 'exam_scope',
              priority: 'medium',
              plannedDate: dayDateStr,
              startAt: slotStart,
              endAt: slotEnd,
              plannedMinutes: dailyMinutes,
              status: 'pending',
              sortOrder: planItems.length + 1,
            });
          }
        }
      }

      currentDayCursor.setDate(currentDayCursor.getDate() + 1);
    }

    const profile = await userRepo.getProfile(userId);
    if (!profile) throw new Error('Cần có hồ sơ học sinh trước khi lập lịch ôn.');
    const [existingTasks, busyEvents, timetableEntries, availabilityRules] = await Promise.all([
      taskRepo.getByUserId(userId), timetableRepo.getBusyEvents(userId),
      timetableRepo.getTimetableEntries(userId), timetableRepo.getAvailabilityRules(userId),
    ]);
    const blackoutEvents: BusyEvent[] = [...blackoutSet].map((date) => ({
      id: `blackout-${date}`, userId, type: 'personal', title: 'Ngày không học',
      startsAt: localDateTimeToUtc(date, '00:00', timezone),
      endsAt: new Date(new Date(localDateTimeToUtc(date, '00:00', timezone)).getTime() + 86_400_000).toISOString(),
      timezone, isFixed: true,
    }));
    const sourceTasks: StudyTask[] = planItems.map((item, index) => ({
      id: `exam-plan-${index}`, userId, subjectId: item.subjectId || exam.subjectId,
      subjectName: item.subjectName, title: item.title, objective: item.description,
      status: 'pending', priority: item.priority, difficulty: 'medium',
      dueAt: new Date(Math.min(
        new Date(exam.examAt).getTime(),
        new Date(localDateTimeToUtc(item.plannedDate, '23:59', timezone)).getTime(),
      )).toISOString(), estimatedMinutes: item.plannedMinutes,
      minSessionMinutes: item.plannedMinutes, maxSessionMinutes: item.plannedMinutes,
      splittable: false, locked: false, completionPercent: 0,
    }));
    // The chosen minutes limit each new review session; existing homework still
    // counts toward the student's separate total daily study limit.
    const schedulerProfile = { ...profile, maxDailyStudyMinutes: profile.maxDailyStudyMinutes || 180 };
    const proposal = DeterministicScheduler.generateScheduleProposal(
      sourceTasks, existingTasks, [...busyEvents, ...blackoutEvents], timetableEntries,
      schedulerProfile, new Date(localDateTimeToUtc(startDateStr, '07:00', timezone)),
      Math.min(daysCount + 1, 91), 'Ôn thi vào các khoảng trống thật', availabilityRules, timezone,
    );
    if (proposal.unscheduledItems.length > 0 || proposal.tasksToSchedule.length !== planItems.length) {
      const reason = proposal.unscheduledItems[0]?.reason || 'Không đủ thời gian trống trước giờ thi.';
      throw new Error(`Chưa xếp được toàn bộ lịch ôn: ${reason} Hãy chọn ít phút ôn hơn hoặc điều chỉnh lịch bận.`);
    }
    for (const scheduled of proposal.tasksToSchedule) {
      const index = Number(scheduled.taskId.replace('exam-plan-', ''));
      const item = planItems[index];
      if (!item) throw new Error('Lỗi đối chiếu mục ôn với lịch đề xuất.');
      const localStart = getLocalParts(new Date(scheduled.proposedStart), timezone);
      const localEnd = getLocalParts(new Date(scheduled.proposedEnd), timezone);
      item.plannedDate = localStart.dateKey;
      item.startAt = minutesToTime(localStart.hour * 60 + localStart.minute);
      item.endAt = minutesToTime(localEnd.hour * 60 + localEnd.minute);
    }

    const createdPlan = await examStudyPlanRepo.createOrReplacePlan(
      userId,
      {
        examId,
        examTitle: exam.title,
        subjectId: exam.subjectId,
        startDate: startDateStr,
        targetDate: examDateStr,
        dailyMinutes,
        status: 'draft',
      },
      planItems
    );

    return createdPlan;
  }

  /**
   * Detects missed study sessions and proposes a smart reschedule plan
   */
  public async detectMissedSessions(
    userId: string,
    examId: string,
    timezone = 'Asia/Ho_Chi_Minh'
  ): Promise<ExamStudyPlanReplanProposal | null> {
    const plan = await examStudyPlanRepo.getPlanByExamId(userId, examId);
    if (!plan || plan.status !== 'accepted') return null;

    const now = new Date();
    const todayStr = formatDateVN(now, timezone);
    const currentHourFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const currentTimeStr = currentHourFormatter.format(now);

    const missedItem = plan.items.find((item) => {
      if (item.status !== 'pending') return false;
      if (item.plannedDate < todayStr) return true;
      if (item.plannedDate === todayStr && item.endAt < currentTimeStr) return true;
      return false;
    });

    if (!missedItem) return null;

    const exam = await examRepo.getById(userId, examId);
    if (!exam) return null;
    const { slot: suggestedSlot, reason: unscheduledReason } = await this.proposeMissedSlot(userId, missedItem, exam.examAt, timezone);

    return {
      planId: plan.id,
      examTitle: plan.examTitle || 'Kỳ kiểm tra',
      missedSession: missedItem,
      suggestedSlot,
      unscheduledReason,
      explanation: suggestedSlot
        ? `Em đã bỏ lỡ buổi ôn "${missedItem.title}". Jami tìm thấy giờ trống mới, không trùng lịch bận. Hãy xác nhận trước khi đổi.`
        : `Em đã bỏ lỡ buổi ôn "${missedItem.title}". ${unscheduledReason} Hãy chọn giờ khác hoặc giảm thời lượng.`,
    };
  }

  /**
   * Confirms replan proposal with version snapshot preservation
   */
  public async confirmReplan(
    userId: string,
    planId: string,
    action: 'accept' | 'custom_slot' | 'skip_session' | 'keep_as_is',
    customSlot?: { plannedDate: string; startAt: string; endAt: string },
    timezone = 'Asia/Ho_Chi_Minh'
  ): Promise<ExamStudyPlan> {
    const plan = await examStudyPlanRepo.getPlanById(userId, planId);
    if (!plan) throw new Error('Không tìm thấy kế hoạch');

    const now = new Date();
    const todayStr = formatDateVN(now, timezone);
    const missed = plan.items.find((i) => i.status === 'pending' && i.plannedDate <= todayStr);
    if (!missed || action === 'keep_as_is') return plan;

    if (action === 'accept' || action === 'custom_slot') {
      if (action === 'custom_slot' && !customSlot) throw new Error('Cần chọn khung giờ cụ thể.');
      const exam = await examRepo.getById(userId, plan.examId);
      if (!exam) throw new Error('Không tìm thấy kỳ kiểm tra.');
      const proposed = await this.proposeMissedSlot(userId, missed, exam.examAt, timezone,
        action === 'custom_slot' ? customSlot : undefined);
      const targetSlot = proposed.slot;
      if (!targetSlot) throw new Error(proposed.reason || 'Không có giờ trống hợp lệ.');
      await examStudyPlanRepo.createPlanVersionSnapshot(userId, planId, `Sắp xếp lại sau buổi bỏ lỡ (${action})`);
      await examStudyPlanRepo.updatePlanItem(userId, planId, missed.id, {
        plannedDate: targetSlot.plannedDate,
        startAt: targetSlot.startAt,
        endAt: targetSlot.endAt,
        status: 'pending',
      });
      if (missed.taskId) {
        const updatedTask = await taskRepo.update(userId, missed.taskId, {
          scheduledStartAt: localDateTimeToUtc(targetSlot.plannedDate, targetSlot.startAt, timezone),
          scheduledEndAt: localDateTimeToUtc(targetSlot.plannedDate, targetSlot.endAt, timezone),
        });
        if (!updatedTask) throw new Error('Không cập nhật được nhiệm vụ ôn liên kết.');
      }
    } else if (action === 'skip_session') {
      await examStudyPlanRepo.createPlanVersionSnapshot(userId, planId, 'Bỏ qua buổi ôn bị lỡ');
      await examStudyPlanRepo.updatePlanItem(userId, planId, missed.id, { status: 'skipped' });
      if (missed.taskId) await taskRepo.update(userId, missed.taskId, { status: 'cancelled' });
    }

    const updated = await examStudyPlanRepo.getPlanById(userId, planId);
    return updated!;
  }

  /**
   * Accept plan: saves tasks in DB & activates schedule
   */
  public async acceptPlan(userId: string, planId: string, timezone = 'Asia/Ho_Chi_Minh'): Promise<ExamStudyPlan> {
    const plan = await examStudyPlanRepo.getPlanById(userId, planId);
    if (!plan) throw new Error('Không tìm thấy kế hoạch');

    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        const [rows] = await conn.execute<any[]>(
          'SELECT status FROM exam_study_plans WHERE id = ? AND user_id = ? FOR UPDATE', [planId, userId]
        );
        if (!rows.length) throw new Error('Không tìm thấy kế hoạch');
        if (rows[0].status === 'accepted') return;
        if (rows[0].status !== 'draft') throw new Error('Chỉ có thể chấp nhận kế hoạch đang xem trước.');
        const [items] = await conn.execute<any[]>(
          'SELECT id, subject_id, title, description, planned_date, start_at, planned_minutes, priority, task_id FROM exam_study_plan_items WHERE plan_id = ? ORDER BY sort_order FOR UPDATE',
          [planId]
        );
        for (const item of items) {
          if (item.task_id) continue;
          const task = await taskRepo.create(userId, {
            id: `task_${item.id}`, planId, examId: plan.examId,
            subjectId: item.subject_id, title: item.title, objective: item.description,
            dueAt: localDateTimeToUtc(item.planned_date, '23:59', timezone),
            scheduledStartAt: localDateTimeToUtc(item.planned_date, item.start_at, timezone),
            estimatedMinutes: item.planned_minutes,
            priority: item.priority === 'high' ? 'high' : 'medium', source: 'exam_study_plan',
          }, conn);
          await conn.execute(
            'UPDATE exam_study_plan_items SET task_id = ?, updated_at = NOW(3) WHERE id = ? AND plan_id = ? AND task_id IS NULL',
            [task.id, item.id, planId]
          );
        }
        await conn.execute(
          `UPDATE exam_study_plans SET status = 'accepted', accepted_at = NOW(3), updated_at = NOW(3)
           WHERE id = ? AND user_id = ?`, [planId, userId]
        );
      });
      return (await examStudyPlanRepo.getPlanById(userId, planId))!;
    }
    if (plan.status === 'accepted') return plan;

    // Link/create StudyTasks for items
    for (const item of plan.items) {
      if (!item.taskId) {
        const scheduledStartAt = localDateTimeToUtc(item.plannedDate, item.startAt, timezone);
        const dueAt = localDateTimeToUtc(item.plannedDate, '23:59', timezone);
        const task = await taskRepo.create(userId, {
          subjectId: item.subjectId,
          subjectName: item.subjectName,
          title: item.title,
          objective: item.description,
          dueAt,
          scheduledStartAt,
          estimatedMinutes: item.plannedMinutes,
          priority: item.priority === 'high' ? 'high' : 'medium',
        });
        await examStudyPlanRepo.updatePlanItem(userId, planId, item.id, { taskId: task.id });
      }
    }

    await examStudyPlanRepo.updatePlanStatus(userId, planId, 'accepted', new Date().toISOString());

    const updated = await examStudyPlanRepo.getPlanById(userId, planId);
    return updated!;
  }

  /**
   * Dismiss plan
   */
  public async dismissPlan(userId: string, planId: string): Promise<boolean> {
    return await examStudyPlanRepo.updatePlanStatus(userId, planId, 'dismissed');
  }

  /**
   * Undo/restore version
   */
  public async undoPlanVersion(userId: string, planId: string): Promise<ExamStudyPlan | null> {
    const plan = await examStudyPlanRepo.getPlanById(userId, planId);
    if (!plan || plan.currentVersion <= 1) return plan;

    const previousVersion = plan.currentVersion - 1;
    return await examStudyPlanRepo.restorePlanVersion(userId, planId, previousVersion);
  }

  /**
   * Complete item
   */
  public async completePlanItem(userId: string, planId: string, itemId: string): Promise<ExamStudyPlanItem> {
    const item = await examStudyPlanRepo.updatePlanItem(userId, planId, itemId, { status: 'completed' });
    if (!item) throw new Error('Không tìm thấy mục ôn tập');

    // If item was linked to a task, complete the task too
    if (item.taskId) {
      await taskRepo.update(userId, item.taskId, { status: 'completed' }).catch(() => {});
    }

    // If all items are completed, mark plan completed
    const plan = await examStudyPlanRepo.getPlanById(userId, planId);
    if (plan && plan.items.every((i) => i.status === 'completed' || i.status === 'skipped')) {
      await examStudyPlanRepo.updatePlanStatus(userId, planId, 'completed', undefined, new Date().toISOString());
    }

    return item;
  }
}

export const examStudyPlanService = new ExamStudyPlanService();
