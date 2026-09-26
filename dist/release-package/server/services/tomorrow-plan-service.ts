import { tomorrowPlanRepo } from '../repositories/tomorrow-plan-repository';
import { timetableRepo } from '../repositories/timetable-repository';
import { taskRepo } from '../repositories/task-repository';
import { examRepo } from '../repositories/exam-repository';
import { sessionCheckinRepo } from '../repositories/session-checkin-repository';
import { userRepo } from '../repositories/user-repository';
import { AiAdapter } from './ai-adapter';
import {
  TomorrowPreparationPlan,
  TomorrowPreparationItem,
  TomorrowPlanEnergyLevel,
  TomorrowPlanStatus,
  TomorrowPlanOverviewInfo,
} from '../../shared/types';
import { localDateTimeToUtc } from '../../shared/utils/date-utils';
import { expandBusyEvents } from '../../shared/utils/recurrence-utils';

interface FreeSlot {
  start: string; // "19:30"
  end: string;   // "20:30"
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export class TomorrowPlanService {
  /**
   * Helper to get current and tomorrow dates in user timezone
   */
  public getPlanDates(timezone: string, now = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const map: Record<string, string> = {};
    for (const p of parts) {
      map[p.type] = p.value;
    }

    const planDate = `${map.year}-${map.month}-${map.day}`;
    const currentHour = parseInt(map.hour, 10);
    const currentMinute = parseInt(map.minute, 10);
    const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

    const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    const todayDOW = weekdayMap[map.weekday] || 1;
    const tomorrowDOW = (todayDOW % 7) + 1;

    // Calculate tomorrow date in user timezone
    const tomorrowDateObj = new Date(now.getTime() + 24 * 3600 * 1000);
    const tomorrowParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(tomorrowDateObj);
    const tomMap: Record<string, string> = {};
    for (const p of tomorrowParts) {
      tomMap[p.type] = p.value;
    }
    const targetDate = `${tomMap.year}-${tomMap.month}-${tomMap.day}`;

    // Evening trigger window: 18:00 to 23:59
    const isEvening = currentHour >= 18 || (currentHour >= 17 && currentMinute >= 30);

    return {
      planDate,
      targetDate,
      todayDOW,
      tomorrowDOW,
      currentHour,
      currentMinute,
      currentTimeStr,
      isEvening,
    };
  }

  /**
   * Calculate evening free time slots, avoiding meals, bedtime, busy events, and locked study tasks
   */
  public async calculateEveningFreeSlots(
    userId: string,
    planDate: string,
    timezone: string,
    currentTimeStr: string
  ): Promise<{ freeSlots: FreeSlot[]; availableFreeMinutes: number; eveningStart: string; eveningEnd: string }> {
    const userProfile = await userRepo.getProfile(userId);
    const bedTime = userProfile?.sleepSchedule?.bedTime || '22:30';
    const bedMinutes = timeToMinutes(bedTime);

    // Evening starts at earliest 18:30 or current time rounded up to next 5 minutes
    const currentMinutes = timeToMinutes(currentTimeStr);
    let startMinutes = Math.max(timeToMinutes('18:30'), currentMinutes);
    startMinutes = Math.ceil(startMinutes / 5) * 5;

    if (startMinutes >= bedMinutes - 15) {
      return {
        freeSlots: [],
        availableFreeMinutes: 0,
        eveningStart: minutesToTime(startMinutes),
        eveningEnd: bedTime,
      };
    }

    // Dynamic meal time from profile with 45m duration
    const dinnerTime = userProfile?.mealTimes?.dinner || '18:45';
    const dinnerStartMinutes = timeToMinutes(dinnerTime);
    const dinnerEndMinutes = dinnerStartMinutes + 45;

    const busyIntervals: Array<{ start: number; end: number }> = [];

    // Block dinner time if current start is before dinner ends
    if (startMinutes < dinnerEndMinutes && dinnerStartMinutes < bedMinutes) {
      busyIntervals.push({
        start: dinnerStartMinutes,
        end: dinnerEndMinutes,
      });
    }

    // Fetch user busy events on this day with exceptions applied
    const allBusy = await timetableRepo.getBusyEvents(userId);
    const busyExceptions = await timetableRepo.getBusyEventExceptions(userId, planDate, planDate);
    const expandedOccurrences = expandBusyEvents(allBusy, busyExceptions, planDate, planDate, timezone);

    for (const occ of expandedOccurrences) {
      if (occ.isSkipped) continue; // Nghỉ tạm / Skipped does NOT block evening free time

      const bStart = Math.max(0, timeToMinutes(occ.startTimeStr) - (occ.commuteBeforeMinutes || 0));
      const bEnd = timeToMinutes(occ.endTimeStr) + (occ.commuteAfterMinutes || 0);

      if (bEnd > startMinutes && bStart < bedMinutes) {
        busyIntervals.push({ start: bStart, end: bEnd });
      }
    }

    // Fetch locked / scheduled tasks tonight
    const tasks = await taskRepo.getByUserId(userId);
    for (const t of tasks) {
      if (t.scheduledStartAt && t.status !== 'completed' && t.status !== 'cancelled') {
        const taskStartDate = new Intl.DateTimeFormat('en-CA', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(t.scheduledStartAt));

        if (taskStartDate === planDate) {
          const taskStart = new Intl.DateTimeFormat('en-GB', {
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(new Date(t.scheduledStartAt));
          const tStart = timeToMinutes(taskStart);
          const tEnd = tStart + (t.estimatedMinutes || 30);
          if (tEnd > startMinutes && tStart < bedMinutes) {
            busyIntervals.push({ start: tStart, end: tEnd });
          }
        }
      }
    }

    // Sort and merge intervals
    busyIntervals.sort((a, b) => a.start - b.start);
    const mergedBusy: Array<{ start: number; end: number }> = [];
    for (const int of busyIntervals) {
      if (mergedBusy.length === 0) {
        mergedBusy.push({ ...int });
      } else {
        const last = mergedBusy[mergedBusy.length - 1];
        if (int.start <= last.end) {
          last.end = Math.max(last.end, int.end);
        } else {
          mergedBusy.push({ ...int });
        }
      }
    }

    // Compute free slots
    const freeSlots: FreeSlot[] = [];
    let cursor = startMinutes;

    for (const busy of mergedBusy) {
      if (busy.start > cursor) {
        const slotEnd = Math.min(busy.start, bedMinutes);
        if (slotEnd - cursor >= 10) {
          freeSlots.push({
            start: minutesToTime(cursor),
            end: minutesToTime(slotEnd),
            startMinutes: cursor,
            endMinutes: slotEnd,
            durationMinutes: slotEnd - cursor,
          });
        }
      }
      cursor = Math.max(cursor, busy.end);
    }

    if (cursor < bedMinutes && bedMinutes - cursor >= 10) {
      freeSlots.push({
        start: minutesToTime(cursor),
        end: minutesToTime(bedMinutes),
        startMinutes: cursor,
        endMinutes: bedMinutes,
        durationMinutes: bedMinutes - cursor,
      });
    }

    const availableFreeMinutes = freeSlots.reduce((acc, s) => acc + s.durationMinutes, 0);

    return {
      freeSlots,
      availableFreeMinutes,
      eveningStart: minutesToTime(startMinutes),
      eveningEnd: bedTime,
    };
  }

  /**
   * Get plan overview for Dashboard banner
   */
  /**
   * Get plan overview for Dashboard banner
   */
  public async getPlanOverview(userId: string, timezone = 'Asia/Ho_Chi_Minh', now = new Date()): Promise<TomorrowPlanOverviewInfo> {
    const dates = this.getPlanDates(timezone, now);
    const existingPlan = await tomorrowPlanRepo.getPlanByDate(userId, dates.planDate);

    // Fetch tomorrow's active timetable subjects (excluding exceptions)
    const activeTimetable = await timetableRepo.getActiveTimetable(userId);
    const timetableEntries = activeTimetable?.id
      ? await timetableRepo.getTimetableEntries(userId, activeTimetable.id, dates.targetDate)
      : await timetableRepo.getTimetableEntries(userId, undefined, dates.targetDate);

    const tomorrowEntries = timetableEntries.filter(
      (e) => Number(e.dayOfWeek) === dates.tomorrowDOW && !e.isSkippedThisWeek
    );
    const tomorrowSubjects = Array.from(new Set(tomorrowEntries.map((e) => e.subjectName || e.title)));

    const { availableFreeMinutes } = await this.calculateEveningFreeSlots(
      userId,
      dates.planDate,
      timezone,
      dates.currentTimeStr
    );

    let bannerMessage: string | undefined = undefined;
    if (existingPlan && existingPlan.status !== 'dismissed' && existingPlan.status !== 'expired') {
      bannerMessage = `Bạn còn trống ${availableFreeMinutes} phút tối nay. Ngày mai bạn có ${tomorrowSubjects.length} môn học. Jami đã chuẩn bị một kế hoạch ngắn cho bạn.`;
    } else if (dates.isEvening && tomorrowSubjects.length > 0) {
      bannerMessage = `Bạn còn trống ${availableFreeMinutes} phút tối nay. Ngày mai bạn có ${tomorrowSubjects.length} môn học (${tomorrowSubjects.join(', ')}). Hãy xem kế hoạch chuẩn bị tối nay nhé!`;
    }

    return {
      hasPlan: Boolean(existingPlan && existingPlan.status !== 'dismissed' && existingPlan.status !== 'expired'),
      plan: existingPlan || undefined,
      isEvening: dates.isEvening,
      availableFreeMinutes,
      tomorrowSubjectsCount: tomorrowSubjects.length,
      tomorrowSubjects,
      bannerMessage,
    };
  }

  /**
   * Generate or regenerate tomorrow preparation plan
   */
  public async generatePlan(
    userId: string,
    options?: {
      energyLevel?: TomorrowPlanEnergyLevel;
      customAvailableMinutes?: number;
      timezone?: string;
      now?: Date;
    }
  ): Promise<TomorrowPreparationPlan> {
    const now = options?.now || new Date();
    const timezone = options?.timezone || 'Asia/Ho_Chi_Minh';
    const dates = this.getPlanDates(timezone, now);
    const energyLevel = options?.energyLevel || 'normal';

    // If energy level is 'skip', user opted out of studying tonight
    if (energyLevel === 'skip') {
      return await tomorrowPlanRepo.createOrReplacePlan(
        userId,
        {
          planDate: dates.planDate,
          targetDate: dates.targetDate,
          availableStart: '20:00',
          availableEnd: '22:00',
          energyLevel: 'skip',
          totalMinutes: 0,
          status: 'dismissed',
        },
        []
      );
    }

    const { freeSlots, availableFreeMinutes, eveningStart, eveningEnd } = await this.calculateEveningFreeSlots(
      userId,
      dates.planDate,
      timezone,
      dates.currentTimeStr
    );

    const effectiveFreeMinutes = options?.customAvailableMinutes || (availableFreeMinutes > 0 ? availableFreeMinutes : 60);
    const effectiveSlots = freeSlots.length > 0
      ? freeSlots
      : [{
          start: '20:00',
          end: '22:00',
          startMinutes: 1200,
          endMinutes: 1320,
          durationMinutes: 120,
        }];

    // Energy max minutes capacity
    let energyCapMinutes = 50;
    if (energyLevel === 'high') energyCapMinutes = 80;
    else if (energyLevel === 'normal') energyCapMinutes = 50;
    else if (energyLevel === 'low') energyCapMinutes = 25;
    else if (energyLevel === 'due_only') energyCapMinutes = 40;

    const targetMaxMinutes = options?.customAvailableMinutes
      ? Math.min(options.customAvailableMinutes, effectiveFreeMinutes || 60)
      : Math.min(energyCapMinutes, effectiveFreeMinutes > 0 ? effectiveFreeMinutes : energyCapMinutes);

    // 1. Fetch Tomorrow's Timetable (Active timetable, not skipped)
    const activeTimetable = await timetableRepo.getActiveTimetable(userId);
    const timetableEntries = activeTimetable?.id
      ? await timetableRepo.getTimetableEntries(userId, activeTimetable.id, dates.targetDate)
      : await timetableRepo.getTimetableEntries(userId, undefined, dates.targetDate);

    const tomorrowEntries = timetableEntries.filter(
      (e) => Number(e.dayOfWeek) === dates.tomorrowDOW && !e.isSkippedThisWeek
    );
    const tomorrowSubjects = tomorrowEntries.map((e) => ({
      id: e.subjectId || e.id,
      title: e.title,
      subjectName: e.subjectName || e.title,
    }));

    // 2. Fetch Tasks due tomorrow or overdue
    const allTasks = await taskRepo.getByUserId(userId);
    const dueTasks = allTasks.filter((t) => {
      if (t.status === 'completed' || t.status === 'cancelled') return false;
      const isDueTomorrow = t.dueAt && t.dueAt.startsWith(dates.targetDate);
      const isOverdue = t.dueAt && t.dueAt < `${dates.planDate}T00:00:00.000Z`;
      return isDueTomorrow || (isOverdue && t.priority === 'high');
    });

    // 3. Fetch Upcoming Exams in next 14 days
    const allExams = await examRepo.getByUserId(userId);
    const upcomingExams = allExams.filter((e) => {
      if (e.status !== 'upcoming') return false;
      const days = (new Date(e.examAt).getTime() - now.getTime()) / 86400000;
      return days >= 0 && days <= 14;
    });

    // 4. Fetch Today's Check-ins & Reflections
    const todayCheckins = await sessionCheckinRepo.getCheckins(userId, dates.planDate, dates.planDate);

    // 5. Build prioritized candidate items (Deterministic Engine)
    interface CandidateItem {
      subjectId?: string;
      subjectName?: string;
      title: string;
      description?: string;
      reason?: string;
      sourceType: TomorrowPreparationItem['sourceType'];
      sourceId?: string;
      priority: 'high' | 'medium' | 'low';
      plannedMinutes: number;
    }

    const candidateItems: CandidateItem[] = [];

    // Priority 1: Due tasks tomorrow
    for (const t of dueTasks) {
      candidateItems.push({
        subjectId: t.subjectId,
        subjectName: t.subjectName,
        title: `Làm bài tập: ${t.title}`,
        description: t.objective || `Hoàn thành bài tập môn ${t.subjectName || ''} cần nộp vào ngày mai.`,
        reason: `Bài tập có hạn nộp vào ngày mai (${dates.targetDate}).`,
        sourceType: 'due_task',
        sourceId: t.id,
        priority: 'high',
        plannedMinutes: Math.min(25, Math.max(15, t.estimatedMinutes || 20)),
      });
    }

    // Priority 2: Upcoming exam review
    if (energyLevel !== 'due_only') {
      for (const ex of upcomingExams.slice(0, 1)) {
        candidateItems.push({
          subjectId: ex.subjectId,
          subjectName: ex.subjectName,
          title: `Ôn tập chuẩn bị thi: ${ex.title}`,
          description: `Ôn lại các dạng bài trọng tâm môn ${ex.subjectName || ''}.`,
          reason: `Kỳ kiểm tra ${ex.title} đang đến gần.`,
          sourceType: 'exam_review',
          sourceId: ex.id,
          priority: 'high',
          plannedMinutes: 20,
        });
      }
    }

    // Priority 3: Today's checkin content marked not understood / hard
    if (energyLevel !== 'due_only') {
      for (const ch of todayCheckins) {
        if (ch.understandingLevel === 'not_understood' || ch.understandingLevel === 'hard' || ch.reflection) {
          candidateItems.push({
            subjectId: ch.timetableEntryId,
            title: `Ôn lại nội dung chưa hiểu: ${ch.learnedContent || 'Kiến thức hôm nay'}`,
            description: ch.reflection ? `Điểm chưa hiểu ghi nhận: "${ch.reflection}"` : 'Đọc lại lý thuyết và làm bài tập mẫu.',
            reason: `Ghi chú check-in hôm nay cho thấy bạn cảm thấy phần này còn khó hoặc chưa hiểu rõ.`,
            sourceType: 'class_checkin_reflection',
            sourceId: ch.id,
            priority: 'high',
            plannedMinutes: 15,
          });
        }
      }
    }

    // Priority 4: Today's checkin homework (if not already in due tasks)
    for (const ch of todayCheckins) {
      if (ch.homework && ch.homework.trim() && ch.attendanceStatus === 'attended') {
        const alreadyInDue = candidateItems.some((c) => c.title.includes(ch.homework!));
        if (!alreadyInDue) {
          candidateItems.push({
            subjectId: ch.timetableEntryId,
            title: `Bài tập về nhà: ${ch.homework.slice(0, 60)}`,
            description: `Hoàn thành BTVN: ${ch.homework}`,
            reason: `Giáo viên đã giao bài tập trong buổi học hôm nay.`,
            sourceType: 'class_checkin_homework',
            sourceId: ch.id,
            priority: 'medium',
            plannedMinutes: 20,
          });
        }
      }
    }

    // Priority 5: Preview tomorrow's subjects (1-2 subjects)
    if (energyLevel !== 'due_only' && tomorrowSubjects.length > 0) {
      for (const subj of tomorrowSubjects.slice(0, 2)) {
        const alreadyCovered = candidateItems.some(
          (c) => c.subjectId === subj.id || (subj.subjectName && c.title.includes(subj.subjectName))
        );
        if (!alreadyCovered) {
          candidateItems.push({
            subjectId: subj.id,
            subjectName: subj.subjectName,
            title: `Xem trước bài ngày mai môn ${subj.subjectName}`,
            description: `Đọc lướt mục lục và phần lý thuyết chính của bài học tiếp theo môn ${subj.subjectName}.`,
            reason: `Ngày mai có tiết ${subj.title}. Xem trước 10-15 phút giúp tiếp thu bài nhanh hơn gấp đôi.`,
            sourceType: 'tomorrow_subject_preview',
            sourceId: subj.id,
            priority: 'medium',
            plannedMinutes: 15,
          });
        }
      }
    }

    // Priority 6: Pack bag & prepare supplies for tomorrow
    if (tomorrowSubjects.length > 0) {
      const subjectNamesList = Array.from(new Set(tomorrowSubjects.map((s) => s.subjectName))).join(', ');
      candidateItems.push({
        title: 'Chuẩn bị sách vở & đồ dùng ngày mai',
        description: `Soạn sách vở các môn: ${subjectNamesList}. Kiểm tra bút, thước và đồ dùng học tập cần thiết.`,
        reason: `Tránh quên sách vở và dụng cụ học tập cho các tiết học ngày mai.`,
        sourceType: 'pack_bag',
        priority: 'low',
        plannedMinutes: 5,
      });
    }

    // Optional AI Enrichment
    try {
      const aiSuggestions = await AiAdapter.generateTomorrowPlanSuggestions({
        tomorrowSubjects,
        todayCheckins: todayCheckins.map((c) => ({
          id: c.id,
          learnedContent: c.learnedContent,
          homework: c.homework,
          reflection: c.reflection,
          understandingLevel: c.understandingLevel,
        })),
        dueTasks: dueTasks.map((t) => ({ id: t.id, title: t.title, subjectName: t.subjectName, priority: t.priority })),
        upcomingExams: upcomingExams.map((e) => ({ id: e.id, title: e.title, subjectName: e.subjectName, examAt: e.examAt })),
        energyLevel,
        maxMinutes: targetMaxMinutes,
      }, userId);

      if (aiSuggestions.length > 0) {
        for (const sugg of aiSuggestions) {
          const match = candidateItems.find(
            (c) => (sugg.sourceId && c.sourceId === sugg.sourceId) || (sugg.subjectId && c.subjectId === sugg.subjectId)
          );
          if (match) {
            match.title = sugg.title;
            if (sugg.description) match.description = sugg.description;
            if (sugg.reason) match.reason = sugg.reason;
          }
        }
      }
    } catch {
      // Rule-based candidate items remain active
    }

    // Select items fitting into targetMaxMinutes
    const selectedCandidates: CandidateItem[] = [];
    let accumulatedMinutes = 0;

    for (const item of candidateItems) {
      if (accumulatedMinutes + item.plannedMinutes <= targetMaxMinutes || selectedCandidates.length === 0) {
        selectedCandidates.push(item);
        accumulatedMinutes += item.plannedMinutes;
      }
    }

    // If still empty (e.g. tomorrow has no classes & no due tasks), create a gentle rest/reading item
    if (selectedCandidates.length === 0) {
      selectedCandidates.push({
        title: 'Nghỉ ngơi hoặc đọc sách thư giãn',
        description: 'Ngày mai bạn không có tiết học và không có bài tập gấp. Hãy nghỉ ngơi để nạp lại năng lượng nhé!',
        reason: 'Không có bài tập đến hạn hoặc lịch học ngày mai.',
        sourceType: 'general_review',
        priority: 'low',
        plannedMinutes: 20,
      });
      accumulatedMinutes = 20;
    }

    // Place selected candidates into timeline slots with 5m breaks
    let currentSlotIndex = 0;
    const currentNowMinutes = dates.currentHour * 60 + dates.currentMinute;
    let slotCursor = effectiveSlots.length > 0 ? effectiveSlots[0].startMinutes : Math.max(currentNowMinutes, timeToMinutes('19:30'));
    slotCursor = Math.ceil(slotCursor / 5) * 5;

    const finalItems: Array<Omit<TomorrowPreparationItem, 'id' | 'planId' | 'createdAt' | 'updatedAt'>> = [];

    for (let i = 0; i < selectedCandidates.length; i++) {
      const c = selectedCandidates[i];

      // Check if current slot has enough room
      if (effectiveSlots.length > 0) {
        const currentSlot = effectiveSlots[currentSlotIndex];
        if (currentSlot && slotCursor + c.plannedMinutes > currentSlot.endMinutes) {
          // Move to next free slot if available
          if (currentSlotIndex < effectiveSlots.length - 1) {
            currentSlotIndex++;
            slotCursor = effectiveSlots[currentSlotIndex].startMinutes;
          }
        }
      }

      const itemStart = minutesToTime(slotCursor);
      const itemEnd = minutesToTime(slotCursor + c.plannedMinutes);
      slotCursor += c.plannedMinutes + 5; // 5 min break

      finalItems.push({
        subjectId: c.subjectId,
        subjectName: c.subjectName,
        title: c.title,
        description: c.description,
        reason: c.reason,
        sourceType: c.sourceType,
        sourceId: c.sourceId,
        priority: c.priority,
        plannedMinutes: c.plannedMinutes,
        startAt: itemStart,
        endAt: itemEnd,
        status: 'pending',
        sortOrder: i + 1,
      });
    }

    const plan = await tomorrowPlanRepo.createOrReplacePlan(
      userId,
      {
        planDate: dates.planDate,
        targetDate: dates.targetDate,
        availableStart: eveningStart,
        availableEnd: eveningEnd,
        energyLevel,
        totalMinutes: accumulatedMinutes,
        status: 'draft',
      },
      finalItems
    );

    return plan;
  }

  /**
   * Accept plan: Mark accepted and convert actionable items to tasks / schedule
   */
  public async acceptPlan(userId: string, planId: string, timezone = 'Asia/Ho_Chi_Minh'): Promise<TomorrowPreparationPlan> {
    const plan = await tomorrowPlanRepo.getPlanById(userId, planId);
    if (!plan) throw new Error('Không tìm thấy kế hoạch chuẩn bị ngày mai.');

    if (plan.status === 'accepted') {
      return plan;
    }

    await tomorrowPlanRepo.updatePlanStatus(userId, planId, 'accepted', new Date().toISOString());

    // Link/schedule tasks for items if not already linked
    for (const item of plan.items) {
      if (item.sourceType === 'due_task' && item.sourceId) {
        // Schedule start time for this task in exact UTC
        const scheduledStartAt = localDateTimeToUtc(plan.planDate, item.startAt, timezone);
        await taskRepo.update(userId, item.sourceId, {
          scheduledStartAt,
        }).catch(() => {});
        await tomorrowPlanRepo.updateItem(userId, planId, item.id, { taskId: item.sourceId });
      }
    }

    const updated = await tomorrowPlanRepo.getPlanById(userId, planId);
    return updated!;
  }

  /**
   * Dismiss plan
   */
  public async dismissPlan(userId: string, planId: string): Promise<boolean> {
    return await tomorrowPlanRepo.updatePlanStatus(userId, planId, 'dismissed');
  }

  /**
   * Update plan energy level and regenerate items
   */
  public async updateEnergyAndRegenerate(
    userId: string,
    planId: string,
    energyLevel: TomorrowPlanEnergyLevel,
    timezone = 'Asia/Ho_Chi_Minh'
  ): Promise<TomorrowPreparationPlan> {
    const plan = await tomorrowPlanRepo.getPlanById(userId, planId);
    if (!plan) throw new Error('Không tìm thấy kế hoạch');

    await tomorrowPlanRepo.updatePlanEnergyLevel(userId, planId, energyLevel);
    return await this.generatePlan(userId, { energyLevel, timezone });
  }

  /**
   * Update individual plan item
   */
  public async updateItem(
    userId: string,
    planId: string,
    itemId: string,
    data: Partial<TomorrowPreparationItem>
  ): Promise<TomorrowPreparationItem> {
    const item = await tomorrowPlanRepo.updateItem(userId, planId, itemId, data);
    if (!item) throw new Error('Không tìm thấy mục trong kế hoạch');
    return item;
  }

  /**
   * Delete item
   */
  public async deleteItem(userId: string, planId: string, itemId: string): Promise<boolean> {
    return await tomorrowPlanRepo.deleteItem(userId, planId, itemId);
  }

  /**
   * Mark item completed
   */
  public async completeItem(userId: string, planId: string, itemId: string): Promise<TomorrowPreparationItem> {
    const item = await tomorrowPlanRepo.updateItem(userId, planId, itemId, { status: 'completed' });
    if (!item) throw new Error('Không tìm thấy mục trong kế hoạch');

    // Check if all items are completed
    const plan = await tomorrowPlanRepo.getPlanById(userId, planId);
    if (plan && plan.items.every((i) => i.status === 'completed' || i.status === 'skipped')) {
      await tomorrowPlanRepo.updatePlanStatus(userId, planId, 'completed', undefined, new Date().toISOString());
    }

    return item;
  }
}

export const tomorrowPlanService = new TomorrowPlanService();
