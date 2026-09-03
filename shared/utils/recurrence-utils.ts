import { BusyEvent, BusyEventException } from '../types';
import { formatDateInTimezone, formatTimeInTimezone } from './date-utils';

export interface ExpandedBusyEventOccurrence {
  occurrenceId: string;
  busyEventId: string;
  title: string;
  eventType: BusyEvent['eventType'];
  startsAt: string; // ISO UTC
  endsAt: string;   // ISO UTC
  localDate: string; // "YYYY-MM-DD"
  startTimeStr: string; // "HH:mm"
  endTimeStr: string;   // "HH:mm"
  location?: string;
  isSkipped: boolean;
  exceptionId?: string;
  reason?: string;
  commuteBeforeMinutes: number;
  commuteAfterMinutes: number;
}

/**
 * Checks whether an event occurs on a specific local date string ("YYYY-MM-DD")
 */
export function doesEventOccurOnLocalDate(
  event: Pick<BusyEvent, 'startsAt' | 'endsAt' | 'recurrenceRule'>,
  targetLocalDate: string,
  timezone = 'Asia/Ho_Chi_Minh'
): boolean {
  if (!event.startsAt) return false;

  const eventStartDate = new Date(event.startsAt);
  const eventStartLocalDate = formatDateInTimezone(eventStartDate, timezone);

  if (targetLocalDate < eventStartLocalDate) {
    return false;
  }

  const rrule = (event.recurrenceRule || 'none').toLowerCase().trim();

  if (rrule === 'none' || !rrule) {
    return eventStartLocalDate === targetLocalDate;
  }

  // Check UNTIL clause if present (e.g. "FREQ=WEEKLY;UNTIL=20261231...")
  if (rrule.includes('until=')) {
    const match = rrule.match(/until=(\d{4})(\d{2})(\d{2})/i);
    if (match) {
      const untilDateStr = `${match[1]}-${match[2]}-${match[3]}`;
      if (targetLocalDate > untilDateStr) {
        return false;
      }
    }
  }

  // Parse target date's day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const [tYear, tMonth, tDay] = targetLocalDate.split('-').map(Number);
  const targetDateObj = new Date(Date.UTC(tYear, tMonth - 1, tDay, 12, 0, 0));
  const dayOfWeek = targetDateObj.getUTCDay();

  const [sYear, sMonth, sDay] = eventStartLocalDate.split('-').map(Number);
  const startLocalObj = new Date(Date.UTC(sYear, sMonth - 1, sDay, 12, 0, 0));
  const diffDays = Math.round((targetDateObj.getTime() - startLocalObj.getTime()) / (24 * 3600 * 1000));

  if (rrule === 'daily' || rrule.startsWith('freq=daily')) {
    return true;
  }

  if (rrule === 'weekdays') {
    return dayOfWeek >= 1 && dayOfWeek <= 5;
  }

  if (rrule === 'weekends') {
    return dayOfWeek === 0 || dayOfWeek === 6;
  }

  if (rrule === 'weekly' || rrule.startsWith('freq=weekly')) {
    const startDayOfWeek = startLocalObj.getUTCDay();
    // Check if byday is specified
    if (rrule.includes('byday=')) {
      const byDayMap: Record<string, number> = { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6 };
      const match = rrule.match(/byday=([a-z,]+)/i);
      if (match) {
        const days = match[1].toLowerCase().split(',').map((d) => byDayMap[d.trim()]);
        return days.includes(dayOfWeek);
      }
    }
    return dayOfWeek === startDayOfWeek;
  }

  if (rrule === 'biweekly') {
    const startDayOfWeek = startLocalObj.getUTCDay();
    if (dayOfWeek !== startDayOfWeek) return false;
    const diffWeeks = Math.floor(diffDays / 7);
    return diffWeeks % 2 === 0;
  }

  if (rrule === 'monthly') {
    return tDay === sDay;
  }

  return false;
}

/**
 * Expands busy events into concrete occurrences within [fromDate, toDate]
 * and attaches exception flags (isSkipped, reason, exceptionId).
 */
export function expandBusyEvents(
  events: BusyEvent[],
  exceptions: BusyEventException[],
  fromDate: string, // "YYYY-MM-DD"
  toDate: string,   // "YYYY-MM-DD"
  timezone = 'Asia/Ho_Chi_Minh'
): ExpandedBusyEventOccurrence[] {
  const exceptionMap = new Map<string, BusyEventException>();
  for (const exc of exceptions) {
    const key = `${exc.busyEventId}__${exc.occurrenceDate}`;
    exceptionMap.set(key, exc);
  }

  const occurrences: ExpandedBusyEventOccurrence[] = [];

  const [fromY, fromM, fromD] = fromDate.split('-').map(Number);
  const [toY, toM, toD] = toDate.split('-').map(Number);

  const cur = new Date(Date.UTC(fromY, fromM - 1, fromD, 12, 0, 0));
  const end = new Date(Date.UTC(toY, toM - 1, toD, 12, 0, 0));

  while (cur <= end) {
    const year = cur.getUTCFullYear();
    const month = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const day = String(cur.getUTCDate()).padStart(2, '0');
    const curDateStr = `${year}-${month}-${day}`;

    for (const ev of events) {
      if (!ev.startsAt || !ev.endsAt) continue;

      if (doesEventOccurOnLocalDate(ev, curDateStr, timezone)) {
        const startTimeStr = formatTimeInTimezone(new Date(ev.startsAt), timezone);
        const endTimeStr = formatTimeInTimezone(new Date(ev.endsAt), timezone);

        const excKey = `${ev.id}__${curDateStr}`;
        const exc = exceptionMap.get(excKey);

        occurrences.push({
          occurrenceId: `${ev.id}_${curDateStr}`,
          busyEventId: ev.id,
          title: ev.title,
          eventType: ev.eventType,
          startsAt: ev.startsAt,
          endsAt: ev.endsAt,
          localDate: curDateStr,
          startTimeStr,
          endTimeStr,
          location: ev.location,
          isSkipped: Boolean(exc && (exc.exceptionType === 'cancelled' || exc.exceptionType === 'skip')),
          exceptionId: exc?.id,
          reason: exc?.reason,
          commuteBeforeMinutes: ev.commuteBeforeMinutes || 0,
          commuteAfterMinutes: ev.commuteAfterMinutes || 0,
        });
      }
    }

    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return occurrences;
}
