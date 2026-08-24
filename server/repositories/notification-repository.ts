import { db } from '../db/mysql';
import { Notification, NotificationPreferences } from '../../shared/types';
import crypto from 'crypto';

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

  public async getByUserId(userId: string): Promise<Notification[]> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT id, user_id, type, title, body, action_url, scheduled_for, delivered_at, read_at, status, created_at
         FROM notifications
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 50`,
        [userId]
      );

      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        type: r.type,
        title: r.title,
        body: r.body,
        actionUrl: r.action_url || undefined,
        scheduledFor: r.scheduled_for ? r.scheduled_for.toISOString?.() || String(r.scheduled_for) : undefined,
        deliveredAt: r.delivered_at ? r.delivered_at.toISOString?.() || String(r.delivered_at) : undefined,
        readAt: r.read_at ? r.read_at.toISOString?.() || String(r.read_at) : undefined,
        status: r.status,
      }));
    }

    return this.demoNotifications.get(userId) || [];
  }

  public async markAsRead(userId: string, id: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute(
        `UPDATE notifications SET status = 'read', read_at = NOW(3) WHERE id = ? AND user_id = ?`,
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

  public async markAllAsRead(userId: string): Promise<void> {
    if (db.isHealthy()) {
      await db.execute(
        `UPDATE notifications SET status = 'read', read_at = NOW(3) WHERE user_id = ? AND status = 'unread'`,
        [userId]
      );
    } else {
      const list = this.demoNotifications.get(userId) || [];
      for (const n of list) {
        n.status = 'read';
        n.readAt = new Date().toISOString();
      }
    }
  }

  public async create(userId: string, data: Partial<Notification>): Promise<Notification> {
    const id = 'notif_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const notif: Notification = {
      id,
      userId,
      type: data.type || 'system',
      title: (data.title || 'Thông báo mới').trim(),
      body: (data.body || '').trim(),
      actionUrl: data.actionUrl,
      scheduledFor: data.scheduledFor,
      deliveredAt: new Date().toISOString(),
      status: 'unread',
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO notifications (id, user_id, type, title, body, action_url, scheduled_for, delivered_at, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3), 'unread', NOW(3))`,
        [
          notif.id,
          userId,
          notif.type,
          notif.title,
          notif.body,
          notif.actionUrl || null,
          notif.scheduledFor ? new Date(notif.scheduledFor) : null,
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
}

export const notificationRepo = NotificationRepository.getInstance();
