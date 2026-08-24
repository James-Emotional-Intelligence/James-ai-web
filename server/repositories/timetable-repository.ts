import { db } from '../db/mysql';
import { TimetableEntry, BusyEvent, AvailabilityRule } from '../../shared/types';
import crypto from 'crypto';

export class TimetableRepository {
  private static instance: TimetableRepository;
  private demoTimetables: Map<string, TimetableEntry[]> = new Map();
  private demoBusyEvents: Map<string, BusyEvent[]> = new Map();

  private constructor() {}

  public static getInstance(): TimetableRepository {
    if (!TimetableRepository.instance) {
      TimetableRepository.instance = new TimetableRepository();
    }
    return TimetableRepository.instance;
  }

  public async getTimetableEntries(userId: string): Promise<TimetableEntry[]> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT e.id, e.subject_id, e.title, e.day_of_week, e.start_local_time, e.end_local_time,
                e.location, e.commute_before_minutes, e.commute_after_minutes,
                s.name as subject_name, s.color as subject_color
         FROM school_timetable_entries e
         JOIN school_timetables t ON e.timetable_id = t.id
         LEFT JOIN subjects s ON e.subject_id = s.id
         WHERE t.user_id = ? AND t.is_active = TRUE
         ORDER BY e.day_of_week ASC, e.start_local_time ASC`,
        [userId]
      );

      return rows.map((r) => ({
        id: r.id,
        dayOfWeek: Number(r.day_of_week),
        period: 1,
        subjectId: r.subject_id,
        subjectName: r.subject_name || r.title,
        title: r.title,
        room: r.location || '',
        startLocalTime: r.start_local_time,
        endLocalTime: r.end_local_time,
        commuteBeforeMinutes: r.commute_before_minutes || 15,
        commuteAfterMinutes: r.commute_after_minutes || 15,
      }));
    }

    return this.demoTimetables.get(userId) || [];
  }

  public async getBusyEvents(userId: string): Promise<BusyEvent[]> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT id, user_id, type, title, starts_at, ends_at, recurrence_rule, timezone, is_fixed, source
         FROM busy_events
         WHERE user_id = ?
         ORDER BY starts_at ASC`,
        [userId]
      );

      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        type: r.type,
        title: r.title,
        startsAt: r.starts_at?.toISOString?.() || String(r.starts_at),
        endsAt: r.ends_at?.toISOString?.() || String(r.ends_at),
        recurrenceRule: r.recurrence_rule,
        timezone: r.timezone || 'Asia/Ho_Chi_Minh',
        isFixed: Boolean(r.is_fixed),
        source: r.source || 'user',
      }));
    }

    return this.demoBusyEvents.get(userId) || [];
  }

  public async createBusyEvent(userId: string, event: Partial<BusyEvent>): Promise<BusyEvent> {
    const id = 'busy_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const now = new Date();
    const startsAt = event.startsAt || now.toISOString();
    const endsAt = event.endsAt || new Date(now.getTime() + 60 * 60 * 1000).toISOString();

    const created: BusyEvent = {
      id,
      userId,
      type: event.type || 'personal',
      title: (event.title || 'Việc bận').trim(),
      startsAt,
      endsAt,
      recurrenceRule: event.recurrenceRule,
      timezone: event.timezone || 'Asia/Ho_Chi_Minh',
      isFixed: event.isFixed ?? true,
      source: event.source || 'user',
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO busy_events (id, user_id, type, title, starts_at, ends_at, recurrence_rule, timezone, is_fixed, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
        [
          created.id,
          userId,
          created.type,
          created.title,
          new Date(created.startsAt),
          new Date(created.endsAt),
          created.recurrenceRule || null,
          created.timezone,
          created.isFixed ? 1 : 0,
          created.source,
        ]
      );
    } else {
      const list = this.demoBusyEvents.get(userId) || [];
      list.push(created);
      this.demoBusyEvents.set(userId, list);
    }

    return created;
  }

  public async deleteBusyEvent(userId: string, id: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute('DELETE FROM busy_events WHERE id = ? AND user_id = ?', [id, userId]);
      return res?.affectedRows > 0;
    }

    const list = this.demoBusyEvents.get(userId) || [];
    const filtered = list.filter((e) => e.id !== id);
    this.demoBusyEvents.set(userId, filtered);
    return true;
  }

  public seedDemo(userId: string, timetable: TimetableEntry[], busyEvents: BusyEvent[]) {
    this.demoTimetables.set(userId, [...timetable]);
    this.demoBusyEvents.set(userId, [...busyEvents]);
  }
}

export const timetableRepo = TimetableRepository.getInstance();
