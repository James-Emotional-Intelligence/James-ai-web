import crypto from 'crypto';
import {
  StudyTask,
  BusyEvent,
  TimetableEntry,
  StudentProfile,
  ScheduleProposal,
  AvailabilityRule,
} from '../../shared/types';

export interface TimeInterval {
  start: Date;
  end: Date;
}

export interface FreeSlot {
  start: Date;
  end: Date;
  durationMinutes: number;
  dayKey: string; // YYYY-MM-DD in user timezone
}

export interface SlotScoreDetails {
  slot: FreeSlot;
  score: number;
  reasons: string[];
}

/**
 * Pure timezone helper extracting local date/time parts for a given timezone
 */
export function getLocalParts(
  date: Date,
  timezone = 'Asia/Ho_Chi_Minh'
): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number; // 1 = Monday, ..., 7 = Sunday
  hour: number;
  minute: number;
  dateKey: string; // "YYYY-MM-DD"
} {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'narrow',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const partMap: Record<string, string> = {};
    for (const p of parts) {
      partMap[p.type] = p.value;
    }

    const year = parseInt(partMap.year, 10);
    const month = parseInt(partMap.month, 10);
    const day = parseInt(partMap.day, 10);
    let hour = parseInt(partMap.hour, 10);
    if (hour === 24) hour = 0;
    const minute = parseInt(partMap.minute, 10);

    // Calculate dayOfWeek using UTC calculation of local date
    const localUtc = new Date(Date.UTC(year, month - 1, day));
    const jsDay = localUtc.getUTCDay(); // 0 = Sunday
    const dayOfWeek = jsDay === 0 ? 7 : jsDay; // 1 = Mon, ..., 7 = Sun

    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    return { year, month, day, dayOfWeek, hour, minute, dateKey };
  } catch {
    // Fallback if timezone string is invalid
    const jsDay = date.getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { year, month, day, dayOfWeek, hour, minute, dateKey };
  }
}

/**
 * Creates a UTC Date representing a specific local time in a given timezone
 */
export function createLocalDate(
  dateKey: string, // "YYYY-MM-DD"
  localTime: string, // "HH:mm"
  timezone = 'Asia/Ho_Chi_Minh'
): Date {
  const [yearStr, monthStr, dayStr] = dateKey.split('-');
  const [hourStr, minStr] = localTime.split(':');

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);

  // Approximate timezone offset in minutes for Asia/Ho_Chi_Minh (+07:00 = -420 min from UTC)
  // We use UTC calculation with timezone offset correction
  let offsetMinutes = -420; // Default +07:00 (Vietnam)
  try {
    const d = new Date(Date.UTC(year, month - 1, day, hour, minute));
    const local = getLocalParts(d, timezone);
    const diffHours = local.hour - hour;
    const diffMins = local.minute - minute;
    offsetMinutes -= (diffHours * 60 + diffMins);
  } catch {}

  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - 7 * 3600 * 1000;
  return new Date(utcMs);
}

export class DeterministicScheduler {
  /**
   * Merges overlapping or contiguous busy intervals
   */
  public static mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
    if (intervals.length === 0) return [];
    // Filter invalid intervals
    const valid = intervals.filter((i) => i.start.getTime() < i.end.getTime());
    if (valid.length === 0) return [];

    const sorted = [...valid].sort((a, b) => a.start.getTime() - b.start.getTime());
    const merged: TimeInterval[] = [{ start: new Date(sorted[0].start), end: new Date(sorted[0].end) }];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const last = merged[merged.length - 1];

      if (current.start.getTime() <= last.end.getTime()) {
        if (current.end.getTime() > last.end.getTime()) {
          last.end = new Date(current.end);
        }
      } else {
        merged.push({ start: new Date(current.start), end: new Date(current.end) });
      }
    }
    return merged;
  }

  /**
   * Expands recurrence rules for busy events across the evaluation window
   */
  public static expandRecurrence(
    event: BusyEvent,
    rangeStart: Date,
    rangeEnd: Date,
    timezone = 'Asia/Ho_Chi_Minh'
  ): TimeInterval[] {
    const eventStart = new Date(event.startsAt);
    const eventEnd = new Date(event.endsAt);
    const durationMs = eventEnd.getTime() - eventStart.getTime();

    if (!event.recurrenceRule) {
      if (eventEnd > rangeStart && eventStart < rangeEnd) {
        return [{ start: eventStart, end: eventEnd }];
      }
      return [];
    }

    const rrule = event.recurrenceRule.toUpperCase();
    const intervals: TimeInterval[] = [];

    // Base start local parts
    const baseLocal = getLocalParts(eventStart, timezone);
    const startTimeStr = `${String(baseLocal.hour).padStart(2, '0')}:${String(baseLocal.minute).padStart(2, '0')}`;

    // Calculate days count
    const daysDiff = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (86400 * 1000)) + 1;

    for (let d = -1; d <= daysDiff; d++) {
      const currentDayDate = new Date(rangeStart.getTime() + d * 86400 * 1000);
      const currentLocal = getLocalParts(currentDayDate, timezone);
      const dayOfWeek = currentLocal.dayOfWeek; // 1=Mon, ..., 7=Sun

      let matches = false;
      if (rrule.includes('FREQ=DAILY')) {
        matches = true;
      } else if (rrule.includes('FREQ=WEEKLY')) {
        if (rrule.includes('BYDAY=')) {
          const byDayStr = rrule.split('BYDAY=')[1].split(';')[0];
          const dayMap: Record<string, number> = {
            MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7,
            '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
          };
          const targetDays = byDayStr.split(',').map((code) => dayMap[code.trim()]).filter(Boolean);
          if (targetDays.includes(dayOfWeek)) {
            matches = true;
          }
        } else {
          // If no BYDAY, matches on same dayOfWeek as the original event
          if (dayOfWeek === baseLocal.dayOfWeek) {
            matches = true;
          }
        }
      }

      if (matches) {
        const instanceStart = createLocalDate(currentLocal.dateKey, startTimeStr, timezone);
        const instanceEnd = new Date(instanceStart.getTime() + durationMs);

        if (instanceEnd > rangeStart && instanceStart < rangeEnd) {
          intervals.push({ start: instanceStart, end: instanceEnd });
        }
      }
    }

    return intervals;
  }

  /**
   * Subtracts merged busy intervals from a day's availability window to find free study slots
   */
  public static computeFreeSlots(
    availabilityWindow: TimeInterval,
    busyIntervals: TimeInterval[],
    minSlotMinutes = 20,
    dayKey = ''
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
            dayKey,
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
          dayKey,
        });
      }
    }

    return freeSlots;
  }

  /**
   * Calculate deterministic constraint and preference score for placing a task in a slot
   */
  public static scoreSlot(
    task: StudyTask,
    slot: FreeSlot,
    profile?: StudentProfile,
    preferredWindows: string[] = [],
    timezone = 'Asia/Ho_Chi_Minh'
  ): { score: number; reasons: string[] } {
    let score = 100;
    const reasons: string[] = [];

    const slotLocal = getLocalParts(slot.start, timezone);
    const slotHour = slotLocal.hour;

    // 1. Urgency / Due Date Proximity
    if (task.dueAt) {
      const dueMs = new Date(task.dueAt).getTime();
      const hoursToDue = (dueMs - slot.start.getTime()) / (1000 * 3600);

      if (hoursToDue < 0) {
        // Slot is after due date -> completely invalid
        return { score: -9999, reasons: ['Đã quá hạn chót'] };
      }
      if (hoursToDue <= 24) {
        score += 80;
        reasons.push('Sắp đến hạn (trong vòng 24h)');
      } else if (hoursToDue <= 48) {
        score += 50;
        reasons.push('Hạn chót trong 48h');
      } else if (hoursToDue <= 72) {
        score += 25;
      }
    }

    // 2. Priority Boost
    if (task.priority === 'high') {
      score += 40;
      reasons.push('Độ ưu tiên cao');
    } else if (task.priority === 'medium') {
      score += 20;
    }

    // 3. Energy Preference Matching
    const isMorning = slotHour >= 7 && slotHour < 12;
    const isAfternoon = slotHour >= 13 && slotHour < 18;
    const isEvening = slotHour >= 18 && slotHour <= 22;

    const energy = profile?.energyPreferences;
    if (energy) {
      if (task.difficulty === 'hard') {
        if (isMorning && energy.morning === 'high') {
          score += 35;
          reasons.push('Phù hợp năng lượng cao buổi sáng');
        } else if (isEvening && energy.evening === 'high') {
          score += 35;
          reasons.push('Phù hợp năng lượng cao buổi tối');
        } else if (isAfternoon && energy.afternoon === 'low') {
          score -= 25;
        }
      } else if (task.difficulty === 'easy') {
        if (isAfternoon && energy.afternoon === 'low') {
          score += 20;
          reasons.push('Nhiệm vụ nhẹ phù hợp buổi chiều');
        }
      }
    }

    // 4. Preferred Windows match
    if (preferredWindows && preferredWindows.length > 0) {
      for (const w of preferredWindows) {
        const lower = w.toLowerCase();
        if ((lower.includes('tối') || lower.includes('evening')) && isEvening) {
          score += 40;
          reasons.push('Khung giờ tối yêu thích');
        }
        if ((lower.includes('sáng') || lower.includes('morning')) && isMorning) {
          score += 40;
          reasons.push('Khung giờ sáng yêu thích');
        }
        if ((lower.includes('chiều') || lower.includes('afternoon')) && isAfternoon) {
          score += 40;
          reasons.push('Khung giờ chiều yêu thích');
        }
      }
    }

    // 5. Earlier dates preferred over late dates
    const dayIndex = Math.max(0, Math.floor((slot.start.getTime() - Date.now()) / (86400 * 1000)));
    score -= dayIndex * 5;

    return { score, reasons };
  }

  /**
   * Generates a complete schedule proposal with multi-constraint satisfaction
   */
  public static generateScheduleProposal(
    tasks: StudyTask[],
    existingTasks: StudyTask[],
    busyEvents: BusyEvent[],
    timetables: TimetableEntry[],
    profile: StudentProfile,
    startDate: Date = new Date(),
    daysCount = 7,
    reason = 'Tối ưu hóa thời gian tự học dựa trên lịch học trường và mục tiêu cá nhân',
    availabilityRules: AvailabilityRule[] = [],
    timezone = 'Asia/Ho_Chi_Minh',
    preferredWindows: string[] = []
  ): ScheduleProposal {
    const proposalId = 'prop_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const tasksToSchedule: ScheduleProposal['tasksToSchedule'] = [];
    const unscheduledItems: ScheduleProposal['unscheduledItems'] = [];

    const now = new Date();
    const maxDailyMinutes = profile.maxDailyStudyMinutes || 180;
    const restBufferMinutes = 10; // Minimum 10 min break between study sessions

    // Range calculation
    const rangeStart = new Date(startDate.getTime());
    const rangeEnd = new Date(startDate.getTime() + daysCount * 24 * 3600 * 1000);

    // Build all busy intervals
    const allBusyIntervals: TimeInterval[] = [];

    // 1. Expand Busy Events (with Recurrence)
    for (const b of busyEvents) {
      const expanded = this.expandRecurrence(b, rangeStart, rangeEnd, timezone);
      allBusyIntervals.push(...expanded);
    }

    // 2. Add existing locked tasks
    for (const t of existingTasks) {
      if (t.locked && t.scheduledStartAt && t.scheduledEndAt) {
        const start = new Date(t.scheduledStartAt);
        const end = new Date(t.scheduledEndAt);
        if (end > rangeStart && start < rangeEnd) {
          allBusyIntervals.push({ start, end });
        }
      }
    }

    // Track daily assigned study minutes to enforce maxDailyStudyMinutes
    const dailyStudyMinutesMap = new Map<string, number>();

    // Compute free slots for each day
    const availableSlots: FreeSlot[] = [];

    for (let dayOffset = 0; dayOffset < daysCount; dayOffset++) {
      const currentDayMs = rangeStart.getTime() + dayOffset * 24 * 3600 * 1000;
      const currentDayDate = new Date(currentDayMs);
      const local = getLocalParts(currentDayDate, timezone);
      const dateKey = local.dateKey;
      const dayOfWeek = local.dayOfWeek;

      // Initialize daily study load from existing locked tasks
      let initialDailyMinutes = 0;
      for (const t of existingTasks) {
        if (t.locked && t.scheduledStartAt) {
          const tLocal = getLocalParts(new Date(t.scheduledStartAt), timezone);
          if (tLocal.dateKey === dateKey) {
            initialDailyMinutes += t.estimatedMinutes || 45;
          }
        }
      }
      dailyStudyMinutesMap.set(dateKey, initialDailyMinutes);

      // Determine day's availability window
      let windowStartLocal = '07:00';
      let windowEndLocal = '22:00';

      const dayAvailRule = availabilityRules.find(
        (r) => r.dayOfWeek === dayOfWeek && r.isEnabled && r.type === 'available'
      );
      if (dayAvailRule) {
        windowStartLocal = dayAvailRule.startLocalTime;
        windowEndLocal = dayAvailRule.endLocalTime;
      }

      const dayAvailStart = createLocalDate(dateKey, windowStartLocal, timezone);
      const dayAvailEnd = createLocalDate(dateKey, windowEndLocal, timezone);

      // School Timetable for this dayOfWeek
      const daySchoolEntries = timetables.filter((e) => e.dayOfWeek === dayOfWeek);
      const daySpecificBusy: TimeInterval[] = [];

      for (const entry of daySchoolEntries) {
        const schoolStart = createLocalDate(dateKey, entry.startLocalTime, timezone);
        const commuteBeforeMs = (entry.commuteBeforeMinutes ?? 15) * 60 * 1000;
        const entryStart = new Date(schoolStart.getTime() - commuteBeforeMs);

        const schoolEnd = createLocalDate(dateKey, entry.endLocalTime, timezone);
        const commuteAfterMs = (entry.commuteAfterMinutes ?? 15) * 60 * 1000;
        const entryEnd = new Date(schoolEnd.getTime() + commuteAfterMs);

        daySpecificBusy.push({ start: entryStart, end: entryEnd });
      }

      // Meal times from profile
      const lunchTime = profile.mealTimes?.lunch || '12:00';
      const lunchStart = createLocalDate(dateKey, lunchTime, timezone);
      const lunchEnd = new Date(lunchStart.getTime() + 45 * 60 * 1000);
      daySpecificBusy.push({ start: lunchStart, end: lunchEnd });

      const dinnerTime = profile.mealTimes?.dinner || '18:30';
      const dinnerStart = createLocalDate(dateKey, dinnerTime, timezone);
      const dinnerEnd = new Date(dinnerStart.getTime() + 45 * 60 * 1000);
      daySpecificBusy.push({ start: dinnerStart, end: dinnerEnd });

      // Sleep schedule from profile
      const bedTime = profile.sleepSchedule?.bedTime || '22:30';
      const sleepStart = createLocalDate(dateKey, bedTime, timezone);
      const wakeTime = profile.sleepSchedule?.wakeTime || '06:00';
      // Sleep goes into next day morning
      const nextDayLocal = getLocalParts(new Date(currentDayMs + 24 * 3600 * 1000), timezone);
      const sleepEnd = createLocalDate(nextDayLocal.dateKey, wakeTime, timezone);
      daySpecificBusy.push({ start: sleepStart, end: sleepEnd });

      // Blocked availability rules
      const blockedRules = availabilityRules.filter(
        (r) => r.dayOfWeek === dayOfWeek && r.isEnabled && r.type === 'blocked'
      );
      for (const bRule of blockedRules) {
        const bStart = createLocalDate(dateKey, bRule.startLocalTime, timezone);
        const bEnd = createLocalDate(dateKey, bRule.endLocalTime, timezone);
        daySpecificBusy.push({ start: bStart, end: bEnd });
      }

      // Filter all global busy intervals that overlap this day
      const overlappingGlobalBusy = allBusyIntervals.filter(
        (b) => b.start < dayAvailEnd && b.end > dayAvailStart
      );

      const combinedDayBusy = [...overlappingGlobalBusy, ...daySpecificBusy];

      // If day is today, don't schedule slots in the past
      if (dayAvailStart < now) {
        combinedDayBusy.push({ start: dayAvailStart, end: now });
      }

      const freeSlots = this.computeFreeSlots(
        { start: dayAvailStart, end: dayAvailEnd },
        combinedDayBusy,
        20,
        dateKey
      );

      availableSlots.push(...freeSlots);
    }

    // Filter tasks that need scheduling (exclude already locked tasks unless explicitly requested)
    const tasksToProcess = tasks.filter((t) => !t.locked || !t.scheduledStartAt);

    // Sort tasks by priority & due date urgency
    const sortedTasks = [...tasksToProcess].sort((a, b) => {
      const prioScore = { high: 300, medium: 200, low: 100 };
      let scoreA = prioScore[a.priority || 'medium'];
      let scoreB = prioScore[b.priority || 'medium'];

      if (a.dueAt) scoreA += 1000000000000 / (new Date(a.dueAt).getTime() || 1);
      if (b.dueAt) scoreB += 1000000000000 / (new Date(b.dueAt).getTime() || 1);

      return scoreB - scoreA;
    });

    for (const task of sortedTasks) {
      const taskMinutes = task.estimatedMinutes || 45;
      const minSession = task.minSessionMinutes || 20;
      const maxSession = task.maxSessionMinutes || 60;
      const isSplittable = task.splittable || taskMinutes > maxSession;

      // Find all valid candidate slots for this task
      const candidates: { slotIndex: number; score: number; reasons: string[] }[] = [];

      for (let i = 0; i < availableSlots.length; i++) {
        const slot = availableSlots[i];
        const dayMinutes = dailyStudyMinutesMap.get(slot.dayKey) || 0;

        // Check daily study limit
        if (dayMinutes >= maxDailyMinutes) {
          continue;
        }

        // Check if slot has enough duration
        const requiredMinutes = isSplittable ? Math.min(taskMinutes, maxSession) : taskMinutes;
        if (slot.durationMinutes < requiredMinutes && slot.durationMinutes < minSession) {
          continue;
        }

        // Check deadline constraint
        if (task.dueAt && slot.start >= new Date(task.dueAt)) {
          continue;
        }

        // Score this candidate slot
        const { score, reasons } = this.scoreSlot(task, slot, profile, preferredWindows, timezone);
        if (score > 0) {
          candidates.push({ slotIndex: i, score, reasons });
        }
      }

      // Sort candidates by score descending
      candidates.sort((a, b) => b.score - a.score);

      if (candidates.length === 0) {
        let failureReason = 'Không tìm thấy khung giờ trống liên tục đủ ' + taskMinutes + ' phút.';
        if (task.dueAt && new Date(task.dueAt) < now) {
          failureReason = 'Nhiệm vụ đã quá hạn chót (' + task.dueAt + ').';
        }
        unscheduledItems.push({
          title: task.title,
          reason: failureReason,
        });
        continue;
      }

      // Allocate task (or sub-task if split)
      let remainingTaskMinutes = taskMinutes;
      let partIndex = 1;
      const totalParts = isSplittable && taskMinutes > maxSession ? Math.ceil(taskMinutes / maxSession) : 1;

      while (remainingTaskMinutes > 0 && candidates.length > 0) {
        const best = candidates.shift()!;
        const slot = availableSlots[best.slotIndex];
        if (!slot) continue;

        const dayMinutes = dailyStudyMinutesMap.get(slot.dayKey) || 0;
        const availableDailyCapacity = Math.max(0, maxDailyMinutes - dayMinutes);
        if (availableDailyCapacity < minSession) {
          continue;
        }

        const allocMinutes = Math.min(
          remainingTaskMinutes,
          slot.durationMinutes,
          maxSession,
          availableDailyCapacity
        );

        if (allocMinutes < minSession && remainingTaskMinutes >= minSession) {
          continue;
        }

        const proposedStart = new Date(slot.start);
        const proposedEnd = new Date(slot.start.getTime() + allocMinutes * 60 * 1000);

        const subTitle = totalParts > 1 ? `${task.title} (Phần ${partIndex}/${totalParts})` : task.title;

        tasksToSchedule.push({
          taskId: totalParts > 1 ? `${task.id}_p${partIndex}` : task.id,
          title: subTitle,
          subjectId: task.subjectId,
          subjectName: task.subjectName,
          estimatedMinutes: allocMinutes,
          proposedStart: proposedStart.toISOString(),
          proposedEnd: proposedEnd.toISOString(),
          reason: best.reasons.length > 0 ? best.reasons.join(', ') : 'Xếp vào khung giờ rảnh tối ưu',
        });

        // Update daily study load
        dailyStudyMinutesMap.set(slot.dayKey, dayMinutes + allocMinutes);

        // Update free slot with rest buffer
        const bufferMs = restBufferMinutes * 60 * 1000;
        const newStart = new Date(proposedEnd.getTime() + bufferMs);
        slot.start = newStart;
        slot.durationMinutes = Math.floor((slot.end.getTime() - newStart.getTime()) / (60 * 1000));

        if (slot.durationMinutes < minSession) {
          availableSlots.splice(best.slotIndex, 1);
        }

        remainingTaskMinutes -= allocMinutes;
        partIndex++;
      }

      if (remainingTaskMinutes > 0) {
        unscheduledItems.push({
          title: task.title,
          reason: `Đã xếp được một phần, còn lại ${remainingTaskMinutes} phút chưa tìm được khung giờ phù hợp.`,
        });
      }
    }

    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    return {
      id: proposalId,
      userId: profile.userId,
      basePlanVersion: 1,
      status: 'pending',
      reason,
      tasksToSchedule,
      unscheduledItems,
      expiresAt,
    };
  }
}

export const Scheduler = DeterministicScheduler;

