import { db } from '../db/mysql';
import { Notification, NotificationPreferences, NotificationType } from '../../shared/types';
import { sanitizeActionUrl } from '../services/notification-scheduler-service';
import crypto from 'crypto';

export interface NotificationQueryOptions {
  status?: 'all' | 'unread' | 'read' | 'archived';
  type?: 'all' | NotificationType;
  cursor?: string;
  limit?: number;
  from?: string;
  to?: string;
}

export class NotificationRepository {
  private static instance: NotificationRepository;
  private demoNotifications: Map<string, Notification[]> = new Map();
  private demoPreferences: Map<string, NotificationPreferences> = new Map();

  private constructor() {}

  public static getInstance(): NotificationRepository {
    if (!NotificationRepository.instance) {
      NotificationRepository.instance = new NotificationRepository();
    }
    return NotificationRepository.instance;
  }

  public async getPaginated(
    userId: string,
    options: NotificationQueryOptions = {}
  ): Promise<{
    notifications: Notification[];
    unreadCount: number;
    nextCursor?: string;
    total: number;
  }> {
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);
    const unreadCount = await this.getUnreadCount(userId);

    if (db.isHealthy()) {
      const conditions: string[] = ['user_id = ?', 'deleted_at IS NULL'];
      const params: any[] = [userId];

      if (options.status && options.status !== 'all') {
        conditions.push('status = ?');
        params.push(options.status);
      }

      if (options.type && options.type !== 'all') {
        conditions.push('type = ?');
        params.push(options.type);
      }

      if (options.cursor) {
        conditions.push('created_at < ?');
        params.push(new Date(options.cursor));
      }

      if (options.from) {
        conditions.push('created_at >= ?');
        params.push(new Date(options.from));
      }

      if (options.to) {
        conditions.push('created_at <= ?');
        params.push(new Date(options.to));
      }

      const sql = `
        SELECT id, user_id, type, title, body, action_url, scheduled_for, delivered_at, read_at, status, dedupe_key, created_at
        FROM notifications
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT ?
      `;
      params.push(limit + 1);

      const rows = await db.query<any>(sql, params);

      const hasMore = rows.length > limit;
      const resultRows = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore && resultRows.length > 0
        ? (resultRows[resultRows.length - 1].created_at instanceof Date
            ? resultRows[resultRows.length - 1].created_at.toISOString()
            : String(resultRows[resultRows.length - 1].created_at))
        : undefined;

      const notifications: Notification[] = resultRows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        type: r.type,
        title: r.title,
        body: r.body,
        actionUrl: sanitizeActionUrl(r.action_url),
        scheduledFor: r.scheduled_for ? (r.scheduled_for.toISOString?.() || String(r.scheduled_for)) : undefined,
        deliveredAt: r.delivered_at ? (r.delivered_at.toISOString?.() || String(r.delivered_at)) : undefined,
        readAt: r.read_at ? (r.read_at.toISOString?.() || String(r.read_at)) : undefined,
        status: r.status,
        dedupeKey: r.dedupe_key || undefined,
        createdAt: r.created_at ? (r.created_at.toISOString?.() || String(r.created_at)) : undefined,
      }));

      return {
        notifications,
        unreadCount,
        nextCursor,
        total: notifications.length,
      };
    }

    // In-memory demo fallback
    let list = (this.demoNotifications.get(userId) || []).filter((n) => n.status !== 'archived');

    if (options.status && options.status !== 'all') {
      list = list.filter((n) => n.status === options.status);
    }
    if (options.type && options.type !== 'all') {
      list = list.filter((n) => n.type === options.type);
    }
    if (options.cursor) {
      const cursorTime = new Date(options.cursor).getTime();
      list = list.filter((n) => new Date(n.createdAt || 0).getTime() < cursorTime);
    }

    const items = list.slice(0, limit);
    const nextCursor = list.length > limit && items.length > 0 ? items[items.length - 1].createdAt : undefined;

    return {
      notifications: items,
      unreadCount,
      nextCursor,
      total: list.length,
    };
  }

  public async getByUserId(userId: string): Promise<Notification[]> {
    const res = await this.getPaginated(userId, { limit: 50 });
    return res.notifications;
  }

  public async getUnreadCount(userId: string): Promise<number> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = ? AND status = 'unread' AND deleted_at IS NULL`,
        [userId]
      );
      return Number(rows[0]?.unread_count || 0);
    }

    const list = this.demoNotifications.get(userId) || [];
    return list.filter((n) => n.status === 'unread').length;
  }

  public async markAsRead(userId: string, id: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute(
        `UPDATE notifications SET status = 'read', read_at = NOW(3) WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
        [id, userId]
      );
      return res?.affectedRows > 0;
    }

    const list = this.demoNotifications.get(userId) || [];
    const notif = list.find((n) => n.id === id);
    if (notif) {
      notif.status = 'read';
      notif.readAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  public async markAllAsRead(userId: string): Promise<number> {
    if (db.isHealthy()) {
      const res = await db.execute(
        `UPDATE notifications SET status = 'read', read_at = NOW(3) WHERE user_id = ? AND status = 'unread' AND deleted_at IS NULL`,
        [userId]
      );
      return Number(res?.affectedRows || 0);
    }

    const list = this.demoNotifications.get(userId) || [];
    let count = 0;
    for (const n of list) {
      if (n.status === 'unread') {
        n.status = 'read';
        n.readAt = new Date().toISOString();
        count++;
      }
    }
    return count;
  }

  public async delete(userId: string, id: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute(
        `UPDATE notifications SET deleted_at = NOW(3), status = 'archived' WHERE id = ? AND user_id = ?`,
        [id, userId]
      );
      return res?.affectedRows > 0;
    }

    const list = this.demoNotifications.get(userId) || [];
    const idx = list.findIndex((n) => n.id === id);
    if (idx !== -1) {
      list.splice(idx, 1);
      this.demoNotifications.set(userId, list);
      return true;
    }
    return false;
  }

  public async getPreferences(userId: string): Promise<NotificationPreferences> {
    const defaults: NotificationPreferences = {
      userId,
      upcomingClass: true,
      upcomingExam: true,
      incompleteTask: true,
      soundEnabled: true,
      leadMinutes: 15,
      classLeadMinutes: 15,
      taskLeadMinutes: 30,
      examLeadDays: 1,
      quietHoursStart: '22:30',
      quietHoursEnd: '06:30',
      timezone: 'Asia/Ho_Chi_Minh',
      inAppEnabled: true,
      webPushEnabled: false,
    };

    if (db.isHealthy()) {
      try {
        const rows = await db.query<any>(
          `SELECT user_id, upcoming_class, upcoming_exam, incomplete_task, sound_enabled,
                  lead_minutes, class_lead_minutes, task_lead_minutes, exam_lead_days,
                  quiet_hours_start, quiet_hours_end, timezone, in_app_enabled, web_push_enabled, push_subscription_json
           FROM notification_preferences
           WHERE user_id = ?`,
          [userId]
        );

        if (rows.length > 0) {
          const r = rows[0];
          let sub = undefined;
          try {
            if (r.push_subscription_json) {
              sub = typeof r.push_subscription_json === 'string' ? JSON.parse(r.push_subscription_json) : r.push_subscription_json;
            }
          } catch {}

          const pref: NotificationPreferences = {
            userId: r.user_id,
            upcomingClass: Boolean(r.upcoming_class ?? true),
            upcomingExam: Boolean(r.upcoming_exam ?? true),
            incompleteTask: Boolean(r.incomplete_task ?? true),
            soundEnabled: Boolean(r.sound_enabled ?? true),
            leadMinutes: Number(r.lead_minutes ?? 15),
            classLeadMinutes: Number(r.class_lead_minutes ?? 15),
            taskLeadMinutes: Number(r.task_lead_minutes ?? 30),
            examLeadDays: Number(r.exam_lead_days ?? 1),
            quietHoursStart: r.quiet_hours_start || '22:30',
            quietHoursEnd: r.quiet_hours_end || '06:30',
            timezone: r.timezone || 'Asia/Ho_Chi_Minh',
            inAppEnabled: Boolean(r.in_app_enabled ?? true),
            webPushEnabled: Boolean(r.web_push_enabled ?? false),
            pushSubscription: sub,
          };
          this.demoPreferences.set(userId, pref);
          return pref;
        }
      } catch (dbErr: any) {
        console.warn(`[NotificationRepo] Failed to query preferences for ${userId}:`, dbErr.message);
      }
    }

    return this.demoPreferences.get(userId) || defaults;
  }

  public async updatePreferences(
    userId: string,
    updates: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    const current = await this.getPreferences(userId);
    const merged: NotificationPreferences = {
      ...current,
      ...updates,
      userId,
    };

    this.demoPreferences.set(userId, merged);

    if (db.isHealthy()) {
      try {
        await db.execute(
          `INSERT INTO notification_preferences (
            user_id, upcoming_class, upcoming_exam, incomplete_task, sound_enabled,
            lead_minutes, class_lead_minutes, task_lead_minutes, exam_lead_days,
            quiet_hours_start, quiet_hours_end, timezone, in_app_enabled, web_push_enabled,
            push_subscription_json, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
          ON DUPLICATE KEY UPDATE
            upcoming_class = VALUES(upcoming_class),
            upcoming_exam = VALUES(upcoming_exam),
            incomplete_task = VALUES(incomplete_task),
            sound_enabled = VALUES(sound_enabled),
            lead_minutes = VALUES(lead_minutes),
            class_lead_minutes = VALUES(class_lead_minutes),
            task_lead_minutes = VALUES(task_lead_minutes),
            exam_lead_days = VALUES(exam_lead_days),
            quiet_hours_start = VALUES(quiet_hours_start),
            quiet_hours_end = VALUES(quiet_hours_end),
            timezone = VALUES(timezone),
            in_app_enabled = VALUES(in_app_enabled),
            web_push_enabled = VALUES(web_push_enabled),
            push_subscription_json = VALUES(push_subscription_json),
            updated_at = NOW(3)`,
          [
            userId,
            merged.upcomingClass ? 1 : 0,
            merged.upcomingExam ? 1 : 0,
            merged.incompleteTask ? 1 : 0,
            merged.soundEnabled ? 1 : 0,
            merged.leadMinutes,
            merged.classLeadMinutes,
            merged.taskLeadMinutes,
            merged.examLeadDays,
            merged.quietHoursStart,
            merged.quietHoursEnd,
            merged.timezone,
            merged.inAppEnabled ? 1 : 0,
            merged.webPushEnabled ? 1 : 0,
            merged.pushSubscription ? JSON.stringify(merged.pushSubscription) : null,
          ]
        );
      } catch (dbErr: any) {
        console.warn(`[NotificationRepo] Failed to update preferences in MySQL:`, dbErr.message);
      }
    }

    return merged;
  }

  public async createManyIdempotent(
    userId: string,
    items: Omit<Notification, 'id' | 'status'>[]
  ): Promise<number> {
    if (items.length === 0) return 0;
    let createdCount = 0;

    if (db.isHealthy()) {
      for (const item of items) {
        const id = 'notif_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
        try {
          const res = await db.execute(
            `INSERT IGNORE INTO notifications (
              id, user_id, type, title, body, action_url, scheduled_for, delivered_at, status, dedupe_key, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unread', ?, NOW(3))`,
            [
              id,
              userId,
              item.type,
              item.title.trim(),
              item.body.trim(),
              sanitizeActionUrl(item.actionUrl) || null,
              item.scheduledFor ? new Date(item.scheduledFor) : null,
              item.deliveredAt ? new Date(item.deliveredAt) : new Date(),
              item.dedupeKey || null,
            ]
          );
          if (res?.affectedRows > 0) {
            createdCount++;
          }
        } catch (err: any) {
          console.warn(`[NotificationRepository] Dedupe insert skip for ${userId}:`, err.message);
        }
      }
      return createdCount;
    }

    // In-memory deduplication
    const list = this.demoNotifications.get(userId) || [];
    for (const item of items) {
      if (item.dedupeKey && list.some((existing) => existing.dedupeKey === item.dedupeKey)) {
        continue;
      }
      const newNotif: Notification = {
        id: 'notif_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24),
        userId,
        type: item.type,
        title: item.title,
        body: item.body,
        actionUrl: sanitizeActionUrl(item.actionUrl),
        scheduledFor: item.scheduledFor,
        deliveredAt: item.deliveredAt || new Date().toISOString(),
        status: 'unread',
        dedupeKey: item.dedupeKey,
        createdAt: new Date().toISOString(),
      };
      list.unshift(newNotif);
      createdCount++;
    }
    this.demoNotifications.set(userId, list);

    return createdCount;
  }

  public async create(userId: string, data: Partial<Notification>): Promise<Notification> {
    const id = 'notif_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const notif: Notification = {
      id,
      userId,
      type: data.type || 'system',
      title: (data.title || 'Thông báo mới').trim(),
      body: (data.body || '').trim(),
      actionUrl: sanitizeActionUrl(data.actionUrl),
      scheduledFor: data.scheduledFor,
      deliveredAt: data.deliveredAt || new Date().toISOString(),
      status: 'unread',
      dedupeKey: data.dedupeKey,
      createdAt: new Date().toISOString(),
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO notifications (id, user_id, type, title, body, action_url, scheduled_for, delivered_at, status, dedupe_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3), 'unread', ?, NOW(3))
         ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body)`,
        [
          notif.id,
          userId,
          notif.type,
          notif.title,
          notif.body,
          notif.actionUrl || null,
          notif.scheduledFor ? new Date(notif.scheduledFor) : null,
          notif.dedupeKey || null,
        ]
      );
    } else {
      const list = this.demoNotifications.get(userId) || [];
      list.unshift(notif);
      this.demoNotifications.set(userId, list);
    }

    return notif;
  }

  public seedDemo(userId: string, notifications: Notification[]) {
    this.demoNotifications.set(userId, [...notifications]);
  }

  public async savePushSubscription(userId: string, subscription: any): Promise<void> {
    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO push_subscriptions (id, user_id, endpoint, keys_json, created_at)
         VALUES (?, ?, ?, ?, NOW(3))
         ON DUPLICATE KEY UPDATE keys_json = VALUES(keys_json), updated_at = NOW(3)`,
        [
          'push_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          userId,
          subscription.endpoint || '',
          JSON.stringify(subscription.keys || {}),
        ]
      ).catch(() => {});
    }
  }
}

export const notificationRepo = NotificationRepository.getInstance();
