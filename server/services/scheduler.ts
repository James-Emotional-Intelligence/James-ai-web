import { StudyTask, BusyEvent, TimetableEntry, StudentProfile, ScheduleProposal } from '../../shared/types';

export interface TimeInterval {
  start: Date;
  end: Date;
}

export interface FreeSlot {
  start: Date;
  end: Date;
  durationMinutes: number;
}

export class DeterministicScheduler {
  /**
   * Merges overlapping or contiguous busy intervals
   */
  public static mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
    if (intervals.length === 0) return [];
    const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
    const merged: TimeInterval[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const last = merged[merged.length - 1];

      if (current.start.getTime() <= last.end.getTime()) {
        if (current.end.getTime() > last.end.getTime()) {
          last.end = current.end;
        }
      } else {
        merged.push({ start: current.start, end: current.end });
      }
    }
    return merged;
  }

  /**
   * Subtracts merged busy intervals from a day's availability window to find free study slots
   */
  public static computeFreeSlots(
    availabilityWindow: TimeInterval,
    busyIntervals: TimeInterval[],
    minSlotMinutes = 20
  ): FreeSlot[] {
    const mergedBusy = this.mergeIntervals(busyIntervals);
    const freeSlots: FreeSlot[] = [];
    let currentPointer = new Date(availabilityWindow.start);

    for (const busy of mergedBusy) {
      if (busy.end.getTime() <= currentPointer.getTime()) {
        continue;
      }
      if (busy.start.getTime() > currentPointer.getTime()) {
        const slotEnd = busy.start.getTime() < availabilityWindow.end.getTime() ? busy.start : availabilityWindow.end;
        const durationMinutes = Math.floor((slotEnd.getTime() - currentPointer.getTime()) / (60 * 1000));
        if (durationMinutes >= minSlotMinutes) {
          freeSlots.push({
            start: new Date(currentPointer),
            end: new Date(slotEnd),
            durationMinutes,
          });
        }
      }
      if (busy.end.getTime() > currentPointer.getTime()) {
        currentPointer = new Date(busy.end);
      }
      if (currentPointer.getTime() >= availabilityWindow.end.getTime()) {
        break;
      }
    }

    if (currentPointer.getTime() < availabilityWindow.end.getTime()) {
      const durationMinutes = Math.floor((availabilityWindow.end.getTime() - currentPointer.getTime()) / (60 * 1000));
      if (durationMinutes >= minSlotMinutes) {
        freeSlots.push({
          start: new Date(currentPointer),
          end: new Date(availabilityWindow.end),
          durationMinutes,
        });
      }
    }

    return freeSlots;
  }

  /**
   * Calculate soft scoring for placing a task in a specific slot
   */
  public static scoreSlot(
    task: StudyTask,
    slot: FreeSlot,
    profile?: StudentProfile,
    preferredWindows?: string[]
  ): number {
    let score = 100;

    // Urgency score
    if (task.dueAt) {
      const hoursToDue = (new Date(task.dueAt).getTime() - slot.start.getTime()) / (1000 * 3600);
      if (hoursToDue < 24 && hoursToDue > 0) score += 50;
      else if (hoursToDue < 48 && hoursToDue > 0) score += 30;
      else if (hoursToDue <= 0) score -= 100; // Past due
    }

    // Priority boost
    if (task.priority === 'high') score += 30;
    if (task.priority === 'medium') score += 15;

    // Energy preference matching
    const slotHour = slot.start.getHours(); // Local hour
    const isEvening = slotHour >= 18 && slotHour <= 22;
    const isMorning = slotHour >= 8 && slotHour <= 11;
    const isAfternoon = slotHour >= 14 && slotHour <= 17;

    if (profile?.energyPreferences) {
      if (task.difficulty === 'hard') {
        if (isEvening && profile.energyPreferences.evening === 'high') score += 25;
        if (isMorning && profile.energyPreferences.morning === 'high') score += 25;
        if (isAfternoon && profile.energyPreferences.afternoon === 'low') score -= 20;
      }
    }

    // Preferred windows match
    if (preferredWindows && preferredWindows.length > 0) {
      const match = preferredWindows.some((w) => {
        if (w.includes('tối') && isEvening) return true;
        if (w.includes('sáng') && isMorning) return true;
        if (w.includes('chiều') && isAfternoon) return true;
        return false;
      });
      if (match) score += 40;
    }

    return score;
  }

  /**
   * Schedules a list of tasks into available slots with multi-constraint validation
   */
  public static generateProposal(
    userId: string,
    profile: StudentProfile,
    tasks: StudyTask[],
    existingTasks: StudyTask[],
    busyEvents: BusyEvent[],
    timetables: TimetableEntry[],
    startDate: Date = new Date(),
    daysCount = 7,
    reason = 'Tối ưu hóa thời gian tự học'
  ): ScheduleProposal {
    return this.generateScheduleProposal(
      tasks,
      existingTasks,
      busyEvents,
      timetables,
      profile,
      startDate,
      daysCount,
      reason
    );
  }

  public static generateScheduleProposal(
    tasks: StudyTask[],
    existingTasks: StudyTask[],
    busyEvents: BusyEvent[],
    timetables: TimetableEntry[],
    profile: StudentProfile,
    startDate: Date,
    daysCount = 7,
    reason = 'Tối ưu hóa thời gian tự học dựa trên lịch học trường và mục tiêu cá nhân'
  ): ScheduleProposal {
    const proposalId = 'prop-' + Math.random().toString(36).substring(2, 9);
    const tasksToSchedule: ScheduleProposal['tasksToSchedule'] = [];
    const unscheduledItems: ScheduleProposal['unscheduledItems'] = [];

    // Collect all existing fixed and locked busy intervals
    const allBusyIntervals: TimeInterval[] = [];

    // 1. Add busy events
    for (const b of busyEvents) {
      allBusyIntervals.push({
        start: new Date(b.startsAt),
        end: new Date(b.endsAt),
      });
    }

    // 2. Add existing locked tasks
    for (const t of existingTasks) {
      if (t.locked && t.scheduledStartAt && t.scheduledEndAt) {
        allBusyIntervals.push({
          start: new Date(t.scheduledStartAt),
          end: new Date(t.scheduledEndAt),
        });
      }
    }

    // Iterate day by day
    for (let dayOffset = 0; dayOffset < daysCount; dayOffset++) {
      const currentDay = new Date(startDate.getTime() + dayOffset * 24 * 3600 * 1000);
      const dayOfWeek = currentDay.getDay() === 0 ? 7 : currentDay.getDay(); // 1=Mon, 7=Sun

      // School timetable for this day
      const daySchoolEntries = timetables.filter((e) => e.dayOfWeek === dayOfWeek);
      for (const entry of daySchoolEntries) {
        const [startH, startM] = entry.startLocalTime.split(':').map(Number);
        const [endH, endM] = entry.endLocalTime.split(':').map(Number);

        const schoolStart = new Date(currentDay);
        schoolStart.setHours(startH, startM - (entry.commuteBeforeMinutes || 15), 0, 0);

        const schoolEnd = new Date(currentDay);
        schoolEnd.setHours(endH, endM + (entry.commuteAfterMinutes || 15), 0, 0);

        allBusyIntervals.push({ start: schoolStart, end: schoolEnd });
      }

      // Meal times
      const [dinnerH, dinnerM] = (profile.mealTimes?.dinner || '18:30').split(':').map(Number);
      const dinnerStart = new Date(currentDay);
      dinnerStart.setHours(dinnerH, dinnerM, 0, 0);
      const dinnerEnd = new Date(currentDay);
      dinnerEnd.setHours(dinnerH, dinnerM + 45, 0, 0);
      allBusyIntervals.push({ start: dinnerStart, end: dinnerEnd });

      // Sleep time
      const [bedH, bedM] = (profile.sleepSchedule?.bedTime || '22:30').split(':').map(Number);
      const sleepStart = new Date(currentDay);
      sleepStart.setHours(bedH, bedM, 0, 0);
      const nextDay = new Date(currentDay.getTime() + 24 * 3600 * 1000);
      const [wakeH, wakeM] = (profile.sleepSchedule?.wakeTime || '06:00').split(':').map(Number);
      const sleepEnd = new Date(nextDay);
      sleepEnd.setHours(wakeH, wakeM, 0, 0);
      allBusyIntervals.push({ start: sleepStart, end: sleepEnd });
    }

    // Availability Window for each day: 07:00 to 22:00
    const availableSlots: FreeSlot[] = [];
    for (let dayOffset = 0; dayOffset < daysCount; dayOffset++) {
      const currentDay = new Date(startDate.getTime() + dayOffset * 24 * 3600 * 1000);
      const dayAvailStart = new Date(currentDay);
      dayAvailStart.setHours(7, 0, 0, 0);
      const dayAvailEnd = new Date(currentDay);
      dayAvailEnd.setHours(22, 0, 0, 0);

      const dayBusy = allBusyIntervals.filter(
        (b) => b.start < dayAvailEnd && b.end > dayAvailStart
      );

      const free = this.computeFreeSlots({ start: dayAvailStart, end: dayAvailEnd }, dayBusy);
      availableSlots.push(...free);
    }

    // Sort tasks by priority & urgency
    const sortedTasks = [...tasks].sort((a, b) => {
      const prioOrder = { high: 3, medium: 2, low: 1 };
      return prioOrder[b.priority] - prioOrder[a.priority];
    });

    for (const task of sortedTasks) {
      if (task.locked && task.scheduledStartAt) {
        continue;
      }

      let placed = false;
      // Search for best candidate slot
      for (let i = 0; i < availableSlots.length; i++) {
        const slot = availableSlots[i];
        if (slot.durationMinutes >= task.estimatedMinutes) {
          const proposedStart = new Date(slot.start);
          const proposedEnd = new Date(slot.start.getTime() + task.estimatedMinutes * 60 * 1000);

          tasksToSchedule.push({
            taskId: task.id,
            title: task.title,
            subjectId: task.subjectId,
            estimatedMinutes: task.estimatedMinutes,
            proposedStart: proposedStart.toISOString(),
            proposedEnd: proposedEnd.toISOString(),
            reason: `Xếp vào khung giờ rảnh tối ưu (${task.estimatedMinutes} phút)`,
          });

          // Adjust free slot
          slot.start = proposedEnd;
          slot.durationMinutes = Math.floor((slot.end.getTime() - slot.start.getTime()) / (60 * 1000));
          if (slot.durationMinutes < 20) {
            availableSlots.splice(i, 1);
          }

          placed = true;
          break;
        }
      }

      if (!placed) {
        unscheduledItems.push({
          title: task.title,
          reason: 'Không tìm thấy khung giờ trống liên tục đủ ' + task.estimatedMinutes + ' phút mà không trùng giờ học/ăn/ngủ.',
        });
      }
    }

    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    return {
      id: proposalId,
      userId: profile.userId,
      reason,
      tasksToSchedule,
      unscheduledItems,
      expiresAt,
    };
  }
}
