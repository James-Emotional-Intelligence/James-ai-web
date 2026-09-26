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

    // Propose moving missed item to tonight 19:30 or tomorrow
    const suggestedSlot = {
      plannedDate: todayStr,
      startAt: '19:45',
      endAt: minutesToTime(timeToMinutes('19:45') + missedItem.plannedMinutes),
    };

    return {
      planId: plan.id,
      examTitle: plan.examTitle || 'Kỳ kiểm tra',
      missedSession: missedItem,
      suggestedSlot,
      explanation: `Bạn đã bỏ lỡ buổi ôn "${missedItem.title}" vào ngày ${missedItem.plannedDate}. Jami đề xuất chuyển nội dung này sang tối nay và điều chỉnh các buổi còn lại để không ảnh hưởng đến điểm thi.`,
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

    // 1. Snapshot previous version before making changes
    await examStudyPlanRepo.createPlanVersionSnapshot(userId, planId, `Sắp xếp lại sau buổi bỏ lỡ (${action})`);

    const now = new Date();
    const todayStr = formatDateVN(now, timezone);

    if (action === 'accept' || action === 'custom_slot') {
      const targetSlot = action === 'custom_slot' && customSlot
        ? customSlot
        : {
            plannedDate: todayStr,
            startAt: '19:45',
            endAt: '20:30',
          };

      const missed = plan.items.find((i) => i.status === 'pending' && i.plannedDate <= todayStr);
      if (missed) {
        await examStudyPlanRepo.updatePlanItem(userId, planId, missed.id, {
          plannedDate: targetSlot.plannedDate,
          startAt: targetSlot.startAt,
          endAt: targetSlot.endAt,
          status: 'pending',
        });
      }
    } else if (action === 'skip_session') {
      const missed = plan.items.find((i) => i.status === 'pending' && i.plannedDate <= todayStr);
      if (missed) {
        await examStudyPlanRepo.updatePlanItem(userId, planId, missed.id, { status: 'skipped' });
      }
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

    await examStudyPlanRepo.updatePlanStatus(userId, planId, 'accepted', new Date().toISOString());

    // Link/create StudyTasks for items
    for (const item of plan.items) {
      if (!item.taskId) {
        const scheduledStartAt = localDateTimeToUtc(item.plannedDate, item.startAt, timezone);
        const dueAt = localDateTimeToUtc(item.plannedDate, '23:59', timezone);
        const task = await taskRepo.create(userId, {
          subjectId: item.subjectId,
          title: item.title,
          objective: item.description,
          dueAt,
          scheduledStartAt,
          estimatedMinutes: item.plannedMinutes,
          priority: item.priority === 'high' ? 'high' : 'medium',
        }).catch(() => null);

        if (task) {
          await examStudyPlanRepo.updatePlanItem(userId, planId, item.id, { taskId: task.id });
        }
      }
    }

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
