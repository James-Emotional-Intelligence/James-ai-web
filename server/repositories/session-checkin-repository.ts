import { db } from '../db/mysql';
import { isProduction, isDatabaseRequired } from '../config/env';
import { ClassSessionCheckin, MissedClassSession, TimetableEntry } from '../../shared/types';
import { timetableRepo } from './timetable-repository';
import { userRepo } from './user-repository';
import crypto from 'crypto';

function getTimezoneOffsetString(date: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    }).formatToParts(date);
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value;
    if (tzPart && tzPart.startsWith('GMT')) {
      const match = tzPart.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
      if (match) {
        const sign = match[1];
        const h = match[2].padStart(2, '0');
        const m = match[3] || '00';
        return `${sign}${h}:${m}`;
      }
    }
  } catch {}
  return '+07:00';
}

function getLocalDateParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const year = map.year;
  const month = map.month;
  const day = map.day;
  const dateKey = `${year}-${month}-${day}`;
  const formattedDate = `${day}/${month}/${year}`;
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const dayOfWeek = weekdayMap[map.weekday] || 1;

  const dayNameMap: Record<number, string> = {
    1: 'Thứ Hai',
    2: 'Thứ Ba',
    3: 'Thứ Tư',
    4: 'Thứ Năm',
    5: 'Thứ Sáu',
    6: 'Thứ Bảy',
    7: 'Chủ Nhật',
  };

  return { year, month, day, dateKey, formattedDate, dayOfWeek, dayOfWeekText: dayNameMap[dayOfWeek] || 'Thứ Hai' };
}

export class SessionCheckinRepository {
  private static instance: SessionCheckinRepository;
  private demoCheckins: Map<string, ClassSessionCheckin[]> = new Map();

  private constructor() {}

  public static getInstance(): SessionCheckinRepository {
    if (!SessionCheckinRepository.instance) {
      SessionCheckinRepository.instance = new SessionCheckinRepository();
    }
    return SessionCheckinRepository.instance;
  }

  public async createOrUpdateCheckin(
    userId: string,
    data: {
      timetableEntryId: string;
      occurrenceDate: string;
      learnedContent?: string | null;
      homework?: string | null;
      reflection?: string | null;
      understandingLevel?: 'very_easy' | 'normal' | 'hard' | 'not_understood' | null;
      attendanceStatus?: 'attended' | 'absent';
    }
  ): Promise<ClassSessionCheckin> {
    const id = 'chk_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const nowIso = new Date().toISOString();

    const checkin: ClassSessionCheckin = {
      id,
      userId,
      timetableEntryId: data.timetableEntryId,
      occurrenceDate: data.occurrenceDate,
      learnedContent: data.learnedContent || undefined,
      homework: data.homework || undefined,
      reflection: data.reflection || undefined,
      understandingLevel: data.understandingLevel || undefined,
      attendanceStatus: data.attendanceStatus || 'attended',
      completedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO class_session_checkins (
           id, user_id, timetable_entry_id, occurrence_date, learned_content, homework, reflection,
           understanding_level, attendance_status, completed_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3), NOW(3))
         ON DUPLICATE KEY UPDATE
           learned_content = VALUES(learned_content),
           homework = VALUES(homework),
           reflection = VALUES(reflection),
           understanding_level = VALUES(understanding_level),
           attendance_status = VALUES(attendance_status),
           completed_at = NOW(3),
           updated_at = NOW(3)`,
        [
          id,
          userId,
          data.timetableEntryId,
          data.occurrenceDate,
          data.learnedContent || null,
          data.homework || null,
          data.reflection || null,
          data.understandingLevel || null,
          data.attendanceStatus || 'attended',
        ]
      );
    } else {
      if (isProduction || isDatabaseRequired) {
        throw new Error('[JAMI Database] Database is unreachable. Cannot save session check-in.');
      }
      const list = this.demoCheckins.get(userId) || [];
      const idx = list.findIndex(
        (c) => c.timetableEntryId === data.timetableEntryId && c.occurrenceDate === data.occurrenceDate
      );
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...checkin, createdAt: list[idx].createdAt };
      } else {
        list.push(checkin);
      }
      this.demoCheckins.set(userId, list);
    }

    return checkin;
  }

  public async getCheckins(userId: string, fromDate?: string, toDate?: string): Promise<ClassSessionCheckin[]> {
    if (db.isHealthy()) {
      let query = `
        SELECT id, user_id, timetable_entry_id, occurrence_date, learned_content, homework, reflection,
               understanding_level, attendance_status, completed_at, created_at, updated_at
        FROM class_session_checkins
        WHERE user_id = ?
      `;
      const params: any[] = [userId];
      if (fromDate) {
        query += ' AND occurrence_date >= ?';
        params.push(fromDate);
      }
      if (toDate) {
        query += ' AND occurrence_date <= ?';
        params.push(toDate);
      }
      query += ' ORDER BY occurrence_date ASC, completed_at ASC';

      const rows = await db.query<any>(query, params);
      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        timetableEntryId: r.timetable_entry_id,
        occurrenceDate: r.occurrence_date,
        learnedContent: r.learned_content || undefined,
        homework: r.homework || undefined,
        reflection: r.reflection || undefined,
        understandingLevel: r.understanding_level || undefined,
        attendanceStatus: r.attendance_status || 'attended',
        completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : new Date().toISOString(),
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
      }));
    }

    let list = this.demoCheckins.get(userId) || [];
    if (fromDate) {
      list = list.filter((c) => c.occurrenceDate >= fromDate);
    }
    if (toDate) {
      list = list.filter((c) => c.occurrenceDate <= toDate);
    }
    return list;
  }

  public async getMissedSessions(userId: string, timezone = 'Asia/Ho_Chi_Minh'): Promise<MissedClassSession[]> {
    const user = await userRepo.findById(userId);
    const now = new Date();
    const nowMs = now.getTime();

    // Default lookback to 24h ago if lastActiveAt not recorded, with maximum lookback of 7 days
    const maxLookbackMs = 7 * 24 * 3600 * 1000;
    const defaultLookbackMs = 24 * 3600 * 1000;
    let startLookbackMs = user?.lastActiveAt
      ? new Date(user.lastActiveAt).getTime()
      : nowMs - defaultLookbackMs;

    if (isNaN(startLookbackMs) || startLookbackMs < nowMs - maxLookbackMs) {
      startLookbackMs = nowMs - maxLookbackMs;
    }

    // Must not be in the future
    if (startLookbackMs > nowMs) {
      startLookbackMs = nowMs - defaultLookbackMs;
    }

    const activeTimetable = await timetableRepo.getActiveTimetable(userId);
    if (!activeTimetable) {
      return [];
    }

    const entries = await timetableRepo.getTimetableEntries(userId, activeTimetable.id);
    if (entries.length === 0) {
      return [];
    }

    // Determine calendar date range in user timezone
    const startDateObj = new Date(startLookbackMs);
    const fromParts = getLocalDateParts(startDateObj, timezone);
    const toParts = getLocalDateParts(now, timezone);

    const exceptions = await timetableRepo.getExceptions(userId, fromParts.dateKey, toParts.dateKey);
    const skippedSet = new Set(exceptions.map((exc) => `${exc.timetableEntryId}_${exc.occurrenceDate}`));

    const checkins = await this.getCheckins(userId, fromParts.dateKey, toParts.dateKey);
    const checkedInSet = new Set(checkins.map((chk) => `${chk.timetableEntryId}_${chk.occurrenceDate}`));

    const missedSessions: MissedClassSession[] = [];

    // Loop through each calendar day from start date to current day
    const cursor = new Date(startLookbackMs);
    // Align cursor to beginning of that local calendar day
    const seenDateKeys = new Set<string>();

    for (let dayOffset = 0; dayOffset <= 8; dayOffset++) {
      const dayDate = new Date(startLookbackMs + dayOffset * 24 * 3600 * 1000);
      const parts = getLocalDateParts(dayDate, timezone);
      if (seenDateKeys.has(parts.dateKey)) continue;
      seenDateKeys.add(parts.dateKey);

      if (parts.dateKey > toParts.dateKey) break;

      const tzOffset = getTimezoneOffsetString(dayDate, timezone);
      const matchingEntries = entries.filter((e) => Number(e.dayOfWeek) === parts.dayOfWeek);

      for (const entry of matchingEntries) {
        const sessionKey = `${entry.id}_${parts.dateKey}`;

        // Exclude skipped / cancelled sessions
        if (skippedSet.has(sessionKey)) continue;

        // Exclude already checked-in sessions
        if (checkedInSet.has(sessionKey)) continue;

        // Check if session has ended in the past
        const [endH, endM] = (entry.endLocalTime || '11:45').split(':');
        const sessionEndIso = `${parts.dateKey}T${endH.padStart(2, '0')}:${endM.padStart(2, '0')}:00.000${tzOffset}`;
        const sessionEndTimeMs = new Date(sessionEndIso).getTime();

        // Must have ended between startLookbackMs and nowMs
        if (sessionEndTimeMs <= nowMs && sessionEndTimeMs >= startLookbackMs - 60000) {
          missedSessions.push({
            timetableEntryId: entry.id,
            subjectId: entry.subjectId,
            subjectName: entry.subjectName || entry.title,
            title: entry.title,
            dayOfWeek: entry.dayOfWeek,
            startLocalTime: entry.startLocalTime,
            endLocalTime: entry.endLocalTime,
            occurrenceDate: parts.dateKey,
            formattedDate: parts.formattedDate,
            dayOfWeekText: parts.dayOfWeekText,
            room: entry.location || entry.room,
          });
        }
      }
    }

    // Sort chronologically by date and start time
    return missedSessions.sort((a, b) => {
      const cmp = a.occurrenceDate.localeCompare(b.occurrenceDate);
      if (cmp !== 0) return cmp;
      return a.startLocalTime.localeCompare(b.startLocalTime);
    });
  }
}

export const sessionCheckinRepo = SessionCheckinRepository.getInstance();
