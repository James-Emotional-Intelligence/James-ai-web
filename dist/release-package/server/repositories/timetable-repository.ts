import { db } from '../db/mysql';
import type { DbExecutor } from '../db/mysql';
import { isProduction, isDatabaseRequired } from '../config/env';
import { AppError } from '../errors/app-errors';
import { TimetableEntry, BusyEvent, BusyEventException, AvailabilityRule, SchoolTimetable, TimetableEntryException } from '../../shared/types';
import crypto from 'crypto';

export class TimetableRepository {
  private static instance: TimetableRepository;
  private demoTimetables: Map<string, SchoolTimetable[]> = new Map();
  private demoEntries: Map<string, TimetableEntry[]> = new Map();
  private demoExceptions: Map<string, TimetableEntryException[]> = new Map();
  private demoBusyEvents: Map<string, BusyEvent[]> = new Map();
  private demoBusyExceptions: Map<string, BusyEventException[]> = new Map();
  private demoAvailabilityRules: Map<string, AvailabilityRule[]> = new Map();

  private constructor() {}

  public static getInstance(): TimetableRepository {
    if (!TimetableRepository.instance) {
      TimetableRepository.instance = new TimetableRepository();
    }
    return TimetableRepository.instance;
  }

  // ==========================================
  // School Timetables CRUD
  // ==========================================

  public async getTimetables(userId: string): Promise<SchoolTimetable[]> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT id, user_id, name, valid_from, valid_to, timezone, is_active
         FROM school_timetables
         WHERE user_id = ?
         ORDER BY is_active DESC`,
        [userId]
      );

      const timetables: SchoolTimetable[] = [];
      for (const r of rows) {
        const entries = await this.getTimetableEntries(userId, r.id);
        const cleanName = (r.name || '1. THỜI KHÓA BIỂU (TRƯỜNG HỌC)').replace(/\s*\(Mẫu nhận dạng AI\)/gi, '').trim() || '1. THỜI KHÓA BIỂU (TRƯỜNG HỌC)';
        timetables.push({
          id: r.id,
          userId: r.user_id,
          name: cleanName,
          validFrom: r.valid_from ? new Date(r.valid_from).toISOString().split('T')[0] : undefined,
          validTo: r.valid_to ? new Date(r.valid_to).toISOString().split('T')[0] : undefined,
          timezone: r.timezone || 'Asia/Ho_Chi_Minh',
          isActive: Boolean(r.is_active),
          entries,
        });
      }
      return timetables;
    }

    if (isProduction || isDatabaseRequired) {
      throw new Error('[JAMI Database] Database is unreachable. Cannot retrieve school timetables.');
    }

    return this.demoTimetables.get(userId) || [];
  }

  public async getActiveTimetable(userId: string): Promise<SchoolTimetable | null> {
    const list = await this.getTimetables(userId);
    return list.find((t) => t.isActive) || list[0] || null;
  }

  public async getOrCreateActiveTimetable(userId: string, executor?: DbExecutor): Promise<SchoolTimetable> {
    if (executor) {
      const [rows] = await executor.query<any[]>(
        `SELECT id, user_id, name, valid_from, valid_to, timezone, is_active
         FROM school_timetables
         WHERE user_id = ?
         ORDER BY is_active DESC
         LIMIT 1
         FOR UPDATE`,
        [userId]
      );
      const row = rows[0];
      if (row) {
        return {
          id: row.id,
          userId: row.user_id,
          name: row.name,
          validFrom: row.valid_from ? new Date(row.valid_from).toISOString().split('T')[0] : undefined,
          validTo: row.valid_to ? new Date(row.valid_to).toISOString().split('T')[0] : undefined,
          timezone: row.timezone || 'Asia/Ho_Chi_Minh',
          isActive: Boolean(row.is_active),
          entries: [],
        };
      }
    } else {
      const active = await this.getActiveTimetable(userId);
      if (active) return active;
    }

    return this.createTimetable(userId, {
      name: 'Thời khóa biểu chính khóa',
      isActive: true,
    }, executor);
  }

  private async hasOwnedTimetable(userId: string, timetableId: string, executor?: DbExecutor): Promise<boolean> {
    if (executor) {
      // Use FOR UPDATE to lock the row within the transaction, preventing a
      // TOCTOU race where the timetable is deleted between this check and the
      // subsequent INSERT into school_timetable_entries (FK constraint failure).
      const [rows] = await executor.query<any[]>(
        'SELECT id FROM school_timetables WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE',
        [timetableId, userId]
      );
      return rows.length > 0;
    }

    if (db.isHealthy()) {
      const rows = await db.query<any>(
        'SELECT id FROM school_timetables WHERE id = ? AND user_id = ? LIMIT 1',
        [timetableId, userId]
      );
      return rows.length > 0;
    }

    const timetables = this.demoTimetables.get(userId) || [];
    return timetables.some((item) => item.id === timetableId);
  }

  public async createTimetable(userId: string, data: Partial<SchoolTimetable>, executor?: DbExecutor): Promise<SchoolTimetable> {
    const id = 'tt_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const timetable: SchoolTimetable = {
      id,
      userId,
      name: data.name || 'Thời khóa biểu chính khóa',
      validFrom: data.validFrom,
      validTo: data.validTo,
      timezone: data.timezone || 'Asia/Ho_Chi_Minh',
      isActive: data.isActive ?? true,
      entries: [],
    };

    if (executor || db.isHealthy()) {
      const writer = executor || db;
      // If active, optionally unset other active timetables
      if (timetable.isActive) {
        await writer.execute('UPDATE school_timetables SET is_active = FALSE WHERE user_id = ?', [userId]);
      }

      await writer.execute(
        `INSERT INTO school_timetables (id, user_id, name, valid_from, valid_to, timezone, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          timetable.id,
          userId,
          timetable.name,
          timetable.validFrom ? new Date(timetable.validFrom) : null,
          timetable.validTo ? new Date(timetable.validTo) : null,
          timetable.timezone,
          timetable.isActive ? 1 : 0,
        ]
      );
    } else {
      if (isProduction || isDatabaseRequired) {
        throw new Error('[JAMI Database] Database is unreachable. Cannot create timetable.');
      }
      const list = this.demoTimetables.get(userId) || [];
      if (timetable.isActive) {
        list.forEach((t) => (t.isActive = false));
      }
      list.push(timetable);
      this.demoTimetables.set(userId, list);
    }

    return timetable;
  }

  public async updateTimetable(userId: string, id: string, data: Partial<SchoolTimetable>): Promise<SchoolTimetable | null> {
    if (db.isHealthy()) {
      const existing = await db.query<any>('SELECT id FROM school_timetables WHERE id = ? AND user_id = ?', [id, userId]);
      if (existing.length === 0) return null;

      if (data.isActive) {
        await db.execute('UPDATE school_timetables SET is_active = FALSE WHERE user_id = ?', [userId]);
      }

      const sets: string[] = [];
      const params: any[] = [];

      if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name); }
      if (data.validFrom !== undefined) { sets.push('valid_from = ?'); params.push(data.validFrom ? new Date(data.validFrom) : null); }
      if (data.validTo !== undefined) { sets.push('valid_to = ?'); params.push(data.validTo ? new Date(data.validTo) : null); }
      if (data.timezone !== undefined) { sets.push('timezone = ?'); params.push(data.timezone); }
      if (data.isActive !== undefined) { sets.push('is_active = ?'); params.push(data.isActive ? 1 : 0); }

      if (sets.length > 0) {
        params.push(id, userId);
        await db.execute(`UPDATE school_timetables SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, params);
      }

      const list = await this.getTimetables(userId);
      return list.find((t) => t.id === id) || null;
    }

    if (isProduction || isDatabaseRequired) {
      throw new Error('[JAMI Database] Database is unreachable. Cannot update timetable.');
    }

    const list = this.demoTimetables.get(userId) || [];
    const item = list.find((t) => t.id === id);
    if (!item) return null;
    Object.assign(item, data);
    return item;
  }

  public async deleteTimetable(userId: string, id: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute('DELETE FROM school_timetables WHERE id = ? AND user_id = ?', [id, userId]);
      return res?.affectedRows > 0;
    }

    if (isProduction || isDatabaseRequired) {
      throw new Error('[JAMI Database] Database is unreachable. Cannot delete timetable.');
    }

    const list = this.demoTimetables.get(userId) || [];
    const filtered = list.filter((t) => t.id !== id);
    this.demoTimetables.set(userId, filtered);
    return true;
  }

  // ==========================================
  // Timetable Entries CRUD
  // ==========================================

  public async getTimetableEntries(userId: string, timetableId?: string, forDate?: string): Promise<TimetableEntry[]> {
    let entries: TimetableEntry[];
    if (db.isHealthy()) {
      let query = `
        SELECT e.id, e.timetable_id, e.subject_id, e.title, e.teacher, e.notes, e.day_of_week, e.start_local_time, e.end_local_time,
               e.location, e.commute_before_minutes, e.commute_after_minutes,
               s.name as subject_name, s.color as subject_color
        FROM school_timetable_entries e
        JOIN school_timetables t ON e.timetable_id = t.id
        LEFT JOIN subjects s ON e.subject_id = s.id
        WHERE t.user_id = ?
      `;
      const params: any[] = [userId];

      if (timetableId) {
        query += ' AND e.timetable_id = ?';
        params.push(timetableId);
      } else {
        query += ' AND t.is_active = TRUE';
      }

      query += ' ORDER BY e.day_of_week ASC, e.start_local_time ASC';

      const rows = await db.query<any>(query, params);

      entries = rows.map((r) => ({
        id: r.id,
        timetableId: r.timetable_id,
        dayOfWeek: Number(r.day_of_week),
        subjectId: r.subject_id,
        subjectName: r.subject_name || r.title,
        subjectColor: r.subject_color || '#16A34A',
        title: r.title,
        teacher: r.teacher || undefined,
        notes: r.notes || undefined,
        room: r.location || '',
        location: r.location || '',
        startLocalTime: r.start_local_time,
        endLocalTime: r.end_local_time,
        commuteBeforeMinutes: r.commute_before_minutes ?? 15,
        commuteAfterMinutes: r.commute_after_minutes ?? 15,
      }));
    } else {
      if (isProduction || isDatabaseRequired) {
        throw new Error('[JAMI Database] Database is unreachable. Cannot retrieve timetable entries.');
      }

      const list = this.demoEntries.get(userId) || [];
      entries = timetableId ? list.filter((e) => e.timetableId === timetableId) : [...list];
    }

    if (forDate) {
      const exceptions = await this.getExceptions(userId, forDate, forDate);
      const excMap = new Map(exceptions.map((exc) => [exc.timetableEntryId, exc]));
      for (const e of entries) {
        const exc = excMap.get(e.id);
        if (exc) {
          e.isSkippedThisWeek = true;
          e.exceptionId = exc.id;
        } else {
          e.isSkippedThisWeek = false;
        }
      }
    }

    return entries;
  }

  public async getEntryById(userId: string, entryId: string): Promise<TimetableEntry | null> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT e.id, e.timetable_id, e.subject_id, e.title, e.teacher, e.notes, e.day_of_week, e.start_local_time, e.end_local_time,
                e.location, e.commute_before_minutes, e.commute_after_minutes,
                s.name as subject_name, s.color as subject_color
         FROM school_timetable_entries e
         JOIN school_timetables t ON e.timetable_id = t.id
         LEFT JOIN subjects s ON e.subject_id = s.id
         WHERE e.id = ? AND t.user_id = ?`,
        [entryId, userId]
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        timetableId: r.timetable_id,
        dayOfWeek: Number(r.day_of_week),
        subjectId: r.subject_id,
        subjectName: r.subject_name || r.title,
        subjectColor: r.subject_color || '#16A34A',
        title: r.title,
        teacher: r.teacher || undefined,
        notes: r.notes || undefined,
        room: r.location || '',
        location: r.location || '',
        startLocalTime: r.start_local_time,
        endLocalTime: r.end_local_time,
        commuteBeforeMinutes: Number(r.commute_before_minutes || 0),
        commuteAfterMinutes: Number(r.commute_after_minutes || 0),
      };
    }
    const list = this.demoEntries.get(userId) || [];
    return list.find((e) => e.id === entryId) || null;
  }

  // ==========================================
  // Timetable Exceptions (Nghỉ tuần này)
  // ==========================================

  public async createException(
    userId: string,
    entryIdOrData: string | { timetableEntryId: string; occurrenceDate: string; reason?: string; exceptionType?: 'cancelled' | 'rescheduled' | 'skip' },
    occurrenceDateParam?: string,
    reasonParam?: string,
    exceptionTypeParam: 'cancelled' | 'rescheduled' | 'skip' = 'cancelled'
  ): Promise<TimetableEntryException> {
    let entryId: string;
    let occurrenceDate: string;
    let reason: string | undefined;
    let exceptionType: 'cancelled' | 'rescheduled' | 'skip';

    if (typeof entryIdOrData === 'object') {
      entryId = entryIdOrData.timetableEntryId;
      occurrenceDate = entryIdOrData.occurrenceDate;
      reason = entryIdOrData.reason;
      exceptionType = entryIdOrData.exceptionType || 'cancelled';
    } else {
      entryId = entryIdOrData;
      occurrenceDate = occurrenceDateParam!;
      reason = reasonParam;
      exceptionType = exceptionTypeParam;
    }

    const entry = await this.getEntryById(userId, entryId);
    if (!entry) {
      throw new Error('Không tìm thấy tiết học hoặc bạn không có quyền truy cập.');
    }

    const id = 'exc_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const exc: TimetableEntryException = {
      id,
      userId,
      timetableEntryId: entryId,
      occurrenceDate,
      exceptionType,
      reason: reason || undefined,
      createdAt: new Date().toISOString(),
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO timetable_entry_exceptions (id, user_id, timetable_entry_id, occurrence_date, exception_type, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(3))
         ON DUPLICATE KEY UPDATE
           exception_type = VALUES(exception_type),
           reason = VALUES(reason)`,
        [id, userId, entryId, occurrenceDate, exceptionType, reason || null]
      );
    } else {
      if (isProduction || isDatabaseRequired) {
        throw new Error('[JAMI Database] Database is unreachable. Cannot record timetable exception.');
      }
      const list = this.demoExceptions.get(userId) || [];
      const existingIdx = list.findIndex((e) => e.timetableEntryId === entryId && e.occurrenceDate === occurrenceDate);
      if (existingIdx >= 0) {
        list[existingIdx] = exc;
      } else {
        list.push(exc);
      }
      this.demoExceptions.set(userId, list);
    }

    return exc;
  }

  public async deleteException(userId: string, entryId: string, occurrenceDate: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute(
        `DELETE FROM timetable_entry_exceptions WHERE user_id = ? AND timetable_entry_id = ? AND occurrence_date = ?`,
        [userId, entryId, occurrenceDate]
      );
      return (res?.affectedRows || 0) > 0;
    }

    const list = this.demoExceptions.get(userId) || [];
    const idx = list.findIndex((e) => e.timetableEntryId === entryId && e.occurrenceDate === occurrenceDate);
    if (idx >= 0) {
      list.splice(idx, 1);
      this.demoExceptions.set(userId, list);
      return true;
    }
    return false;
  }

  public async deleteExceptionById(userId: string, exceptionId: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute(
        `DELETE FROM timetable_entry_exceptions WHERE user_id = ? AND id = ?`,
        [userId, exceptionId]
      );
      return (res?.affectedRows || 0) > 0;
    }

    const list = this.demoExceptions.get(userId) || [];
    const idx = list.findIndex((e) => e.id === exceptionId);
    if (idx >= 0) {
      list.splice(idx, 1);
      this.demoExceptions.set(userId, list);
      return true;
    }
    return false;
  }

  public async getExceptions(userId: string, fromDate?: string, toDate?: string): Promise<TimetableEntryException[]> {
    if (db.isHealthy()) {
      let query = `
        SELECT id, user_id, timetable_entry_id, occurrence_date, exception_type, reason, created_at
        FROM timetable_entry_exceptions
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
      query += ' ORDER BY occurrence_date ASC';
      const rows = await db.query<any>(query, params);
      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        timetableEntryId: r.timetable_entry_id,
        occurrenceDate: r.occurrence_date,
        exceptionType: r.exception_type,
        reason: r.reason || undefined,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      }));
    }

    let list = this.demoExceptions.get(userId) || [];
    if (fromDate) {
      list = list.filter((e) => e.occurrenceDate >= fromDate);
    }
    if (toDate) {
      list = list.filter((e) => e.occurrenceDate <= toDate);
    }
    return list;
  }

  public async isEntrySkippedOnDate(
    userIdOrEntryId: string,
    entryIdOrOccurrenceDate: string,
    occurrenceDateParam?: string
  ): Promise<boolean> {
    let userId: string | undefined;
    let entryId: string;
    let occurrenceDate: string;

    if (occurrenceDateParam) {
      userId = userIdOrEntryId;
      entryId = entryIdOrOccurrenceDate;
      occurrenceDate = occurrenceDateParam;
    } else {
      entryId = userIdOrEntryId;
      occurrenceDate = entryIdOrOccurrenceDate;
    }

    if (db.isHealthy()) {
      let query = `SELECT id FROM timetable_entry_exceptions WHERE timetable_entry_id = ? AND occurrence_date = ?`;
      const params: any[] = [entryId, occurrenceDate];
      if (userId) {
        query += ` AND user_id = ?`;
        params.push(userId);
      }
      const rows = await db.query<any>(query, params);
      return rows.length > 0;
    }

    if (userId) {
      const list = this.demoExceptions.get(userId) || [];
      return list.some((e) => e.timetableEntryId === entryId && e.occurrenceDate === occurrenceDate);
    }

    for (const list of this.demoExceptions.values()) {
      if (list.some((e) => e.timetableEntryId === entryId && e.occurrenceDate === occurrenceDate)) {
        return true;
      }
    }
    return false;
  }

  public async createTimetableEntry(userId: string, data: Partial<TimetableEntry>, executor?: DbExecutor): Promise<TimetableEntry> {
    let targetTimetableId = data.timetableId;
    if (targetTimetableId) {
      const isOwned = await this.hasOwnedTimetable(userId, targetTimetableId, executor);
      if (!isOwned) {
        throw new AppError(
          'Không tìm thấy thời khóa biểu hợp lệ. Jami đã không lưu thay đổi; vui lòng thử lại.',
          404,
          'TIMETABLE_NOT_FOUND_OR_NOT_OWNED'
        );
      }
    } else {
      targetTimetableId = (await this.getOrCreateActiveTimetable(userId, executor)).id;
    }

    const id = 'entry_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const entry: TimetableEntry = {
      id,
      timetableId: targetTimetableId,
      subjectId: data.subjectId || undefined,
      subjectName: data.subjectName || data.title || 'Tiết học',
      title: data.title || 'Tiết học',
      teacher: data.teacher || undefined,
      dayOfWeek: Number(data.dayOfWeek) || 1,
      startLocalTime: data.startLocalTime || '07:30',
      endLocalTime: data.endLocalTime || '11:45',
      room: data.room || data.location || '',
      location: data.room || data.location || '',
      commuteBeforeMinutes: data.commuteBeforeMinutes ?? 15,
      commuteAfterMinutes: data.commuteAfterMinutes ?? 15,
    };

    if (executor || db.isHealthy()) {
      const writer = executor || db;
      // Validate subject ownership if subjectId provided
      if (entry.subjectId) {
        const subResult = executor
          ? await executor.query<any>('SELECT id, name, color FROM subjects WHERE id = ? AND user_id = ?', [entry.subjectId, userId])
          : await db.query<any>('SELECT id, name, color FROM subjects WHERE id = ? AND user_id = ?', [entry.subjectId, userId]);
        const sub = executor ? (subResult[0] as any[]) : subResult;
        if (sub.length > 0) {
          entry.subjectName = sub[0].name;
          entry.subjectColor = sub[0].color;
        } else {
          entry.subjectId = undefined; // Drop foreign key if not owned
        }
      }

      await writer.execute(
        `INSERT INTO school_timetable_entries (id, timetable_id, subject_id, title, teacher, notes, day_of_week, start_local_time, end_local_time, location, commute_before_minutes, commute_after_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          entry.timetableId,
          entry.subjectId || null,
          entry.title,
          entry.teacher || null,
          entry.notes || null,
          entry.dayOfWeek,
          entry.startLocalTime,
          entry.endLocalTime,
          entry.location || null,
          entry.commuteBeforeMinutes,
          entry.commuteAfterMinutes,
        ]
      );
    } else {
      if (isProduction || isDatabaseRequired) {
        throw new Error('[JAMI Database] Database is unreachable. Cannot create timetable entry.');
      }
      const list = this.demoEntries.get(userId) || [];
      list.push(entry);
      this.demoEntries.set(userId, list);
    }

    return entry;
  }

  public async updateTimetableEntry(userId: string, id: string, data: Partial<TimetableEntry>): Promise<TimetableEntry | null> {
    if (db.isHealthy()) {
      // Verify ownership through join
      const rows = await db.query<any>(
        `SELECT e.id FROM school_timetable_entries e
         JOIN school_timetables t ON e.timetable_id = t.id
         WHERE e.id = ? AND t.user_id = ?`,
        [id, userId]
      );
      if (rows.length === 0) return null;

      const sets: string[] = [];
      const params: any[] = [];

      if (data.title !== undefined) { sets.push('title = ?'); params.push(data.title); }
      if (data.teacher !== undefined) { sets.push('teacher = ?'); params.push(data.teacher || null); }
      if (data.notes !== undefined) { sets.push('notes = ?'); params.push(data.notes || null); }
      if (data.subjectId !== undefined) {
        if (data.subjectId) {
          const sub = await db.query<any>('SELECT id FROM subjects WHERE id = ? AND user_id = ?', [data.subjectId, userId]);
          sets.push('subject_id = ?');
          params.push(sub.length > 0 ? data.subjectId : null);
        } else {
          sets.push('subject_id = ?');
          params.push(null);
        }
      }
      if (data.dayOfWeek !== undefined) { sets.push('day_of_week = ?'); params.push(data.dayOfWeek); }
      if (data.startLocalTime !== undefined) { sets.push('start_local_time = ?'); params.push(data.startLocalTime); }
      if (data.endLocalTime !== undefined) { sets.push('end_local_time = ?'); params.push(data.endLocalTime); }
      if (data.location !== undefined || data.room !== undefined) { sets.push('location = ?'); params.push(data.location || data.room || null); }
      if (data.commuteBeforeMinutes !== undefined) { sets.push('commute_before_minutes = ?'); params.push(data.commuteBeforeMinutes); }
      if (data.commuteAfterMinutes !== undefined) { sets.push('commute_after_minutes = ?'); params.push(data.commuteAfterMinutes); }

      if (sets.length > 0) {
        params.push(id);
        await db.execute(`UPDATE school_timetable_entries SET ${sets.join(', ')} WHERE id = ?`, params);
      }

      const list = await this.getTimetableEntries(userId);
      return list.find((e) => e.id === id) || null;
    }

    if (isProduction || isDatabaseRequired) {
      throw new Error('[JAMI Database] Database is unreachable. Cannot update timetable entry.');
    }

    const list = this.demoEntries.get(userId) || [];
    const item = list.find((e) => e.id === id);
    if (!item) return null;
    Object.assign(item, data);
    return item;
  }

  public async deleteTimetableEntry(userId: string, id: string, executor?: DbExecutor): Promise<boolean> {
    if (executor || db.isHealthy()) {
      const writer = executor || db;
      const res = await writer.execute(
        `DELETE e FROM school_timetable_entries e
         JOIN school_timetables t ON e.timetable_id = t.id
         WHERE e.id = ? AND t.user_id = ?`,
        [id, userId]
      );
      return res?.affectedRows > 0;
    }

    if (isProduction || isDatabaseRequired) {
      throw new Error('[JAMI Database] Database is unreachable. Cannot delete timetable entry.');
    }

    const list = this.demoEntries.get(userId) || [];
    const filtered = list.filter((e) => e.id !== id);
    this.demoEntries.set(userId, filtered);
    return true;
  }

  public async deleteEntriesByDay(userId: string, dayOfWeek: number, timetableId?: string): Promise<number> {
    if (db.isHealthy()) {
      let query = `
        DELETE e FROM school_timetable_entries e
        JOIN school_timetables t ON e.timetable_id = t.id
        WHERE t.user_id = ? AND e.day_of_week = ?
      `;
      const params: any[] = [userId, dayOfWeek];
      if (timetableId) {
        query += ' AND e.timetable_id = ?';
        params.push(timetableId);
      } else {
        query += ' AND t.is_active = TRUE';
      }
      const res = await db.execute(query, params);
      return res?.affectedRows || 0;
    }

    if (isProduction || isDatabaseRequired) {
      throw new Error('[JAMI Database] Database is unreachable. Cannot delete timetable entries.');
    }

    const list = this.demoEntries.get(userId) || [];
    const before = list.length;
    const filtered = list.filter((e) => e.dayOfWeek !== dayOfWeek);
    this.demoEntries.set(userId, filtered);
    return before - filtered.length;
  }

  public async deleteAllEntries(userId: string, timetableId?: string): Promise<number> {
    if (db.isHealthy()) {
      let query = `
        DELETE e FROM school_timetable_entries e
        JOIN school_timetables t ON e.timetable_id = t.id
        WHERE t.user_id = ?
      `;
      const params: any[] = [userId];
      if (timetableId) {
        query += ' AND e.timetable_id = ?';
        params.push(timetableId);
      } else {
        query += ' AND t.is_active = TRUE';
      }
      const res = await db.execute(query, params);
      return res?.affectedRows || 0;
    }

    if (isProduction || isDatabaseRequired) {
      throw new Error('[JAMI Database] Database is unreachable. Cannot delete all timetable entries.');
    }

    const list = this.demoEntries.get(userId) || [];
    const count = list.length;
    this.demoEntries.set(userId, []);
    return count;
  }

  /**
   * Atomically replaces all entries in a timetable within a single transaction
   */
  public async replaceTimetableEntries(
    userId: string,
    timetableId: string,
    entries: Partial<TimetableEntry>[]
  ): Promise<TimetableEntry[]> {
    if (db.isHealthy()) {
      return db.withTransaction(async (conn) => {
        const [ttRows]: any = await conn.query(
          'SELECT id FROM school_timetables WHERE id = ? AND user_id = ?',
          [timetableId, userId]
        );
        if (!ttRows || ttRows.length === 0) {
          throw new Error('Không tìm thấy thời khóa biểu hoặc không có quyền.');
        }

        await conn.execute(
          'DELETE FROM school_timetable_entries WHERE timetable_id = ?',
          [timetableId]
        );

        const saved: TimetableEntry[] = [];
        for (const item of entries) {
          if (!item.title) continue;
          const entryId = 'tte_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
          const dayOfWeek = Number(item.dayOfWeek) || 1;
          const startLocalTime = item.startLocalTime || '07:30';
          const endLocalTime = item.endLocalTime || '08:15';
          const location = item.location || item.room || '';
          const commuteBeforeMinutes = item.commuteBeforeMinutes ?? 15;
          const commuteAfterMinutes = item.commuteAfterMinutes ?? 15;

          await conn.execute(
            `INSERT INTO school_timetable_entries
             (id, timetable_id, subject_id, title, teacher, notes, day_of_week, start_local_time, end_local_time, location, commute_before_minutes, commute_after_minutes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              entryId,
              timetableId,
              item.subjectId || null,
              item.title.trim(),
              item.teacher || null,
              item.notes || null,
              dayOfWeek,
              startLocalTime,
              endLocalTime,
              location,
              commuteBeforeMinutes,
              commuteAfterMinutes,
            ]
          );

          saved.push({
            id: entryId,
            timetableId,
            dayOfWeek,
            subjectId: item.subjectId,
            title: item.title.trim(),
            teacher: item.teacher,
            notes: item.notes,
            startLocalTime,
            endLocalTime,
            location,
            room: location,
            commuteBeforeMinutes,
            commuteAfterMinutes,
          });
        }
        return saved;
      });
    }

    const list = this.demoEntries.get(userId) || [];
    const remaining = list.filter((e) => e.timetableId !== timetableId);
    const saved: TimetableEntry[] = [];
    for (const item of entries) {
      if (!item.title) continue;
      const entryId = 'tte_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
      const e: TimetableEntry = {
        id: entryId,
        timetableId,
        dayOfWeek: Number(item.dayOfWeek) || 1,
        subjectId: item.subjectId,
        title: item.title.trim(),
        teacher: item.teacher,
        startLocalTime: item.startLocalTime || '07:30',
        endLocalTime: item.endLocalTime || '08:15',
        location: item.location || item.room || '',
        room: item.location || item.room || '',
        commuteBeforeMinutes: item.commuteBeforeMinutes ?? 15,
        commuteAfterMinutes: item.commuteAfterMinutes ?? 15,
      };
      saved.push(e);
      remaining.push(e);
    }
    this.demoEntries.set(userId, remaining);
    return saved;
  }

  // ==========================================
  // Busy Events CRUD
  // ==========================================

  public async getBusyEvents(userId: string, from?: string, to?: string): Promise<BusyEvent[]> {
    if (db.isHealthy()) {
      let query = `
        SELECT b.id, b.user_id, b.type, b.title, b.notes, b.is_all_day, b.starts_at, b.ends_at, b.recurrence_rule, b.timezone,
               b.is_fixed, b.location, b.commute_before_minutes, b.commute_after_minutes, b.source, s.name as subject_name
        FROM busy_events b
        LEFT JOIN subjects s ON b.title = s.name
        WHERE b.user_id = ?
      `;
      const params: any[] = [userId];

      if (from && to) {
        query += ' AND ((b.ends_at >= ? AND b.starts_at <= ?) OR b.recurrence_rule IS NOT NULL)';
        params.push(new Date(from), new Date(to));
      }

      query += ' ORDER BY b.starts_at ASC';

      const rows = await db.query<any>(query, params);

      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        type: r.type,
        title: r.title,
        notes: r.notes || undefined,
        isAllDay: Boolean(r.is_all_day),
        startsAt: r.starts_at?.toISOString?.() || String(r.starts_at),
        endsAt: r.ends_at?.toISOString?.() || String(r.ends_at),
        recurrenceRule: r.recurrence_rule || undefined,
        timezone: r.timezone || 'Asia/Ho_Chi_Minh',
        isFixed: Boolean(r.is_fixed),
        location: r.location || undefined,
        commuteBeforeMinutes: r.commute_before_minutes ?? 0,
        commuteAfterMinutes: r.commute_after_minutes ?? 0,
        subjectName: r.subject_name || undefined,
        source: r.source || 'user',
      }));
    }

    if (isProduction || isDatabaseRequired) {
      throw new Error('[JAMI Database] Database is unreachable. Cannot retrieve busy events.');
    }

    return this.demoBusyEvents.get(userId) || [];
  }

  public async createBusyEvent(userId: string, event: Partial<BusyEvent>, executor?: DbExecutor): Promise<BusyEvent> {
    const id = 'busy_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const now = new Date();
    const startsAt = event.startsAt || now.toISOString();
    const endsAt = event.endsAt || new Date(now.getTime() + 60 * 60 * 1000).toISOString();

    const created: BusyEvent = {
      id,
      userId,
      type: event.type || 'personal',
      title: (event.title || 'Việc bận').trim(),
      notes: event.notes,
      isAllDay: event.isAllDay ?? false,
      startsAt,
      endsAt,
      recurrenceRule: event.recurrenceRule || undefined,
      timezone: event.timezone || 'Asia/Ho_Chi_Minh',
      isFixed: event.isFixed ?? true,
      location: event.location || undefined,
      commuteBeforeMinutes: event.commuteBeforeMinutes ?? 0,
      commuteAfterMinutes: event.commuteAfterMinutes ?? 0,
      subjectId: event.subjectId || undefined,
      source: event.source || 'user',
    };

    if (executor || db.isHealthy()) {
      const writer = executor || db;
      await writer.execute(
        `INSERT INTO busy_events (id, user_id, type, title, notes, is_all_day, starts_at, ends_at, recurrence_rule, timezone, is_fixed, location, commute_before_minutes, commute_after_minutes, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
        [
          created.id,
          userId,
          created.type,
          created.title,
          created.notes || null,
          created.isAllDay ? 1 : 0,
          new Date(created.startsAt),
          new Date(created.endsAt),
          created.recurrenceRule || null,
          created.timezone,
          created.isFixed ? 1 : 0,
          created.location || null,
          created.commuteBeforeMinutes || 0,
          created.commuteAfterMinutes || 0,
          created.source,
        ]
      );
    } else {
      if (isProduction || isDatabaseRequired) {
        throw new Error('[JAMI Database] Database is unreachable. Cannot create busy event.');
      }
      const list = this.demoBusyEvents.get(userId) || [];
      list.push(created);
      this.demoBusyEvents.set(userId, list);
    }

    return created;
  }

  public async updateBusyEvent(userId: string, id: string, data: Partial<BusyEvent>): Promise<BusyEvent | null> {
    if (db.isHealthy()) {
      const existing = await db.query<any>('SELECT id FROM busy_events WHERE id = ? AND user_id = ?', [id, userId]);
      if (existing.length === 0) return null;

      const sets: string[] = [];
      const params: any[] = [];

      if (data.title !== undefined) { sets.push('title = ?'); params.push(data.title); }
      if (data.type !== undefined) { sets.push('type = ?'); params.push(data.type); }
      if (data.notes !== undefined) { sets.push('notes = ?'); params.push(data.notes || null); }
      if (data.isAllDay !== undefined) { sets.push('is_all_day = ?'); params.push(data.isAllDay ? 1 : 0); }
      if (data.startsAt !== undefined) { sets.push('starts_at = ?'); params.push(new Date(data.startsAt)); }
      if (data.endsAt !== undefined) { sets.push('ends_at = ?'); params.push(new Date(data.endsAt)); }
      if (data.recurrenceRule !== undefined) { sets.push('recurrence_rule = ?'); params.push(data.recurrenceRule || null); }
      if (data.timezone !== undefined) { sets.push('timezone = ?'); params.push(data.timezone); }
      if (data.isFixed !== undefined) { sets.push('is_fixed = ?'); params.push(data.isFixed ? 1 : 0); }
      if (data.location !== undefined) { sets.push('location = ?'); params.push(data.location || null); }
      if (data.commuteBeforeMinutes !== undefined) { sets.push('commute_before_minutes = ?'); params.push(data.commuteBeforeMinutes); }
      if (data.commuteAfterMinutes !== undefined) { sets.push('commute_after_minutes = ?'); params.push(data.commuteAfterMinutes); }

      if (sets.length > 0) {
        sets.push('updated_at = NOW(3)');
        params.push(id, userId);
        await db.execute(`UPDATE busy_events SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, params);
      }

      const list = await this.getBusyEvents(userId);
      return list.find((e) => e.id === id) || null;
    }

    if (isProduction || isDatabaseRequired) {
      throw new Error('[JAMI Database] Database is unreachable. Cannot update busy event.');
    }

    const list = this.demoBusyEvents.get(userId) || [];
    const item = list.find((e) => e.id === id);
    if (!item) return null;
    Object.assign(item, data);
    return item;
  }

  public async deleteBusyEvent(userId: string, id: string, executor?: DbExecutor): Promise<boolean> {
    if (executor || db.isHealthy()) {
      const writer = executor || db;
      await writer.execute('DELETE FROM busy_event_exceptions WHERE busy_event_id = ? AND user_id = ?', [id, userId]);
      const res = await writer.execute('DELETE FROM busy_events WHERE id = ? AND user_id = ?', [id, userId]);
      return res?.affectedRows > 0;
    }

    if (isProduction || isDatabaseRequired) {
      throw new Error('[JAMI Database] Database is unreachable. Cannot delete busy event.');
    }

    const excList = this.demoBusyExceptions.get(userId) || [];
    this.demoBusyExceptions.set(userId, excList.filter((e) => e.busyEventId !== id));

    const list = this.demoBusyEvents.get(userId) || [];
    const filtered = list.filter((e) => e.id !== id);
    this.demoBusyEvents.set(userId, filtered);
    return true;
  }

  // ==========================================
  // Busy Event Exceptions CRUD (Nghỉ tạm thời gian biểu)
  // ==========================================

  public async createBusyEventException(
    userId: string,
    busyEventId: string,
    occurrenceDate: string,
    reason?: string,
    exceptionType: 'cancelled' | 'skip' = 'cancelled'
  ): Promise<BusyEventException> {
    // 1. Ownership check: verify busy event belongs to user
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        'SELECT id FROM busy_events WHERE id = ? AND user_id = ?',
        [busyEventId, userId]
      );
      if (rows.length === 0) {
        throw new Error('Sự kiện bận không tồn tại hoặc không thuộc quyền sở hữu của bạn');
      }
    } else {
      const list = this.demoBusyEvents.get(userId) || [];
      if (!list.some((b) => b.id === busyEventId)) {
        throw new Error('Sự kiện bận không tồn tại hoặc không thuộc quyền sở hữu của bạn');
      }
    }

    const id = 'bexc_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const nowIso = new Date().toISOString();
    const exc: BusyEventException = {
      id,
      userId,
      busyEventId,
      occurrenceDate,
      exceptionType,
      reason: reason || undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO busy_event_exceptions (id, user_id, busy_event_id, occurrence_date, exception_type, reason, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
         ON DUPLICATE KEY UPDATE
           exception_type = VALUES(exception_type),
           reason = VALUES(reason),
           updated_at = NOW(3)`,
        [id, userId, busyEventId, occurrenceDate, exceptionType, reason || null]
      );
    } else {
      if (isProduction || isDatabaseRequired) {
        throw new Error('[JAMI Database] Database is unreachable. Cannot record busy event exception.');
      }
      const list = this.demoBusyExceptions.get(userId) || [];
      const existingIdx = list.findIndex((e) => e.busyEventId === busyEventId && e.occurrenceDate === occurrenceDate);
      if (existingIdx >= 0) {
        list[existingIdx] = exc;
      } else {
        list.push(exc);
      }
      this.demoBusyExceptions.set(userId, list);
    }

    return exc;
  }

  public async deleteBusyEventException(userId: string, busyEventId: string, occurrenceDate: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute(
        `DELETE FROM busy_event_exceptions WHERE user_id = ? AND busy_event_id = ? AND occurrence_date = ?`,
        [userId, busyEventId, occurrenceDate]
      );
      return (res?.affectedRows || 0) > 0;
    }

    const list = this.demoBusyExceptions.get(userId) || [];
    const idx = list.findIndex((e) => e.busyEventId === busyEventId && e.occurrenceDate === occurrenceDate);
    if (idx >= 0) {
      list.splice(idx, 1);
      this.demoBusyExceptions.set(userId, list);
      return true;
    }
    return false;
  }

  public async getBusyEventExceptions(userId: string, fromDate?: string, toDate?: string): Promise<BusyEventException[]> {
    if (db.isHealthy()) {
      let query = `
        SELECT id, user_id, busy_event_id, occurrence_date, exception_type, reason, created_at, updated_at
        FROM busy_event_exceptions
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
      query += ' ORDER BY occurrence_date ASC';

      const rows = await db.query<any>(query, params);
      return rows.map((r) => {
        let occDate = r.occurrence_date;
        if (occDate instanceof Date) {
          occDate = occDate.toISOString().split('T')[0];
        } else if (typeof occDate === 'string') {
          occDate = occDate.split('T')[0];
        }
        return {
          id: r.id,
          userId: r.user_id,
          busyEventId: r.busy_event_id,
          occurrenceDate: occDate,
          exceptionType: r.exception_type,
          reason: r.reason || undefined,
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
        };
      });
    }

    let list = this.demoBusyExceptions.get(userId) || [];
    if (fromDate) {
      list = list.filter((e) => e.occurrenceDate >= fromDate);
    }
    if (toDate) {
      list = list.filter((e) => e.occurrenceDate <= toDate);
    }
    return list;
  }

  public async isBusyEventSkipped(userId: string, busyEventId: string, occurrenceDate: string): Promise<boolean> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT id FROM busy_event_exceptions WHERE user_id = ? AND busy_event_id = ? AND occurrence_date = ?`,
        [userId, busyEventId, occurrenceDate]
      );
      return rows.length > 0;
    }

    const list = this.demoBusyExceptions.get(userId) || [];
    return list.some((e) => e.busyEventId === busyEventId && e.occurrenceDate === occurrenceDate);
  }

  // ==========================================
  // Availability Rules CRUD
  // ==========================================

  public async getAvailabilityRules(userId: string): Promise<AvailabilityRule[]> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT id, user_id, day_of_week, start_local_time, end_local_time, effective_from, effective_to, is_enabled
         FROM availability_rules
         WHERE user_id = ?
         ORDER BY day_of_week ASC, start_local_time ASC`,
        [userId]
      );

      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        dayOfWeek: Number(r.day_of_week),
        startLocalTime: r.start_local_time,
        endLocalTime: r.end_local_time,
        effectiveFrom: r.effective_from ? new Date(r.effective_from).toISOString().split('T')[0] : undefined,
        effectiveTo: r.effective_to ? new Date(r.effective_to).toISOString().split('T')[0] : undefined,
        type: 'available',
        isEnabled: Boolean(r.is_enabled),
      }));
    }

    if (isProduction || isDatabaseRequired) {
      throw new Error('[JAMI Database] Database is unreachable. Cannot retrieve availability rules.');
    }

    return this.demoAvailabilityRules.get(userId) || [];
  }

  public async saveAvailabilityRules(userId: string, rules: AvailabilityRule[]): Promise<AvailabilityRule[]> {
    if (db.isHealthy()) {
      await db.withTransaction(async (conn) => {
        await conn.execute('DELETE FROM availability_rules WHERE user_id = ?', [userId]);

        for (const rule of rules) {
          const ruleId = rule.id || 'avail_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
          await conn.execute(
            `INSERT INTO availability_rules (id, user_id, day_of_week, start_local_time, end_local_time, effective_from, effective_to, is_enabled)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              ruleId,
              userId,
              rule.dayOfWeek,
              rule.startLocalTime,
              rule.endLocalTime,
              rule.effectiveFrom ? new Date(rule.effectiveFrom) : null,
              rule.effectiveTo ? new Date(rule.effectiveTo) : null,
              rule.isEnabled ? 1 : 0,
            ]
          );
        }
      });

      return this.getAvailabilityRules(userId);
    }

    if (isProduction || isDatabaseRequired) {
      throw new Error('[JAMI Database] Database is unreachable. Cannot save availability rules.');
    }

    this.demoAvailabilityRules.set(userId, [...rules]);
    return rules;
  }

  public async generateTimetableCsv(userId: string): Promise<string> {
    const entries = await this.getTimetableEntries(userId);
    const busyEvents = await this.getBusyEvents(userId);

    const escapeCell = (val: any): string => {
      if (val === null || val === undefined) return '""';
      let str = String(val).replace(/"/g, '""');
      if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
      return `"${str}"`;
    };

    const dayLabels: Record<number, string> = {
      1: 'Thứ 2',
      2: 'Thứ 3',
      3: 'Thứ 4',
      4: 'Thứ 5',
      5: 'Thứ 6',
      6: 'Thứ 7',
      7: 'Chủ nhật',
    };

    const lines: string[] = [];
    lines.push('\uFEFF"THỜI KHÓA BIỂU HỌC TẬP JAMI AI"');
    lines.push(`"Ngày xuất",${escapeCell(new Date().toLocaleDateString('vi-VN'))}`);
    lines.push('');

    lines.push('"LỊCH CHÍNH KHÓA (TRƯỜNG)"');
    lines.push('"Thứ","Môn / Tiết học","Bắt đầu","Kết thúc","Địa điểm / Phòng"');
    for (const e of entries.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startLocalTime.localeCompare(b.startLocalTime))) {
      lines.push([
        escapeCell(dayLabels[e.dayOfWeek] || `Thứ ${e.dayOfWeek + 1}`),
        escapeCell(e.title),
        escapeCell(e.startLocalTime),
        escapeCell(e.endLocalTime),
        escapeCell(e.location || e.room || ''),
      ].join(','));
    }
    lines.push('');

    lines.push('"LỊCH HỌC THÊM & VIỆC BẬN"');
    lines.push('"Tên sự kiện","Thời gian bắt đầu","Thời gian kết thúc","Lặp lại"');
    for (const b of busyEvents) {
      lines.push([
        escapeCell(b.title),
        escapeCell(b.startsAt),
        escapeCell(b.endsAt),
        escapeCell(b.recurrenceRule || 'Một lần'),
      ].join(','));
    }

    return lines.join('\r\n');
  }

  public seedDemo(userId: string, timetable: TimetableEntry[], busyEvents: BusyEvent[]) {
    this.demoEntries.set(userId, [...timetable]);
    this.demoBusyEvents.set(userId, [...busyEvents]);
  }
}

export const timetableRepo = TimetableRepository.getInstance();
