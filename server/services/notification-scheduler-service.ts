import { notificationRepo } from '../repositories/notification-repository';
import { timetableRepo } from '../repositories/timetable-repository';
import { taskRepo } from '../repositories/task-repository';
import { examRepo } from '../repositories/exam-repository';
import { userRepo } from '../repositories/user-repository';
import { Notification, NotificationPreferences } from '../../shared/types';
import { db } from '../db/mysql';

export const ALLOWED_NOTIFICATION_ROUTES = [
  '/today',
  '/timetable',
  '/tasks',
  '/focus',
  '/exams',
  '/materials',
  '/reports',
  '/settings',
  '/jami',
] as const;

/**
 * Sanitizes action URL to only allow strict internal application routes
 * Rejects javascript:, protocol-relative //, and external domain URLs
 */
export function sanitizeActionUrl(url?: string): string | undefined {
  if (!url || typeof url !== 'string') return undefined;

  const trimmed = url.trim();

  // Reject dangerous schemes or protocol-relative URLs
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    return undefined;
  }

  // Must start with / and be part of allowed routes
  if (!trimmed.startsWith('/')) {
    return undefined;
  }

  const baseRoute = trimmed.split('?')[0].split('#')[0];
  const isAllowed = ALLOWED_NOTIFICATION_ROUTES.some(
    (allowed) => baseRoute === allowed || baseRoute.startsWith(`${allowed}/`)
  );

  return isAllowed ? trimmed : undefined;
}

/**
 * Checks if a given timestamp falls within user quiet hours in their timezone
 * Handles overnight ranges spanning midnight (e.g. 22:30 -> 06:30)
 */
export function isWithinQuietHours(
  now: Date,
  quietStart = '22:30',
  quietEnd = '06:30',
  timezone = 'Asia/Ho_Chi_Minh'
): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    const currentMinutes = hour * 60 + minute;

    const [startH, startM] = quietStart.split(':').map(Number);
    const [endH, endM] = quietEnd.split(':').map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      // Same-day quiet hours (e.g. 13:00 to 15:00)
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight quiet hours spanning midnight (e.g. 22:30 to 06:30)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  } catch {
    return false;
  }
}

/**
 * Calculates deferred delivery timestamp when current time is within quiet hours
 */
export function getDeferredDeliveryTime(
  now: Date,
  quietEnd = '06:30',
  timezone = 'Asia/Ho_Chi_Minh'
): Date {
  try {
    const [endH, endM] = quietEnd.split(':').map(Number);
    const deferred = new Date(now.getTime());

    // Approximate next quietEnd time
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const currentH = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);

    if (currentH >= 22) {
      // Next day morning
      deferred.setDate(deferred.getDate() + 1);
    }
    deferred.setHours(endH, endM, 0, 0);
    return deferred;
  } catch {
    return now;
  }
}

export class NotificationSchedulerService {
  private static instance: NotificationSchedulerService;

  private constructor() {}

  public static getInstance(): NotificationSchedulerService {
    if (!NotificationSchedulerService.instance) {
      NotificationSchedulerService.instance = new NotificationSchedulerService();
    }
    return NotificationSchedulerService.instance;
  }

  /**
   * Scans and generates notifications for a specific user based on timetables, tasks, and exams
   */
  public async scanAndGenerateForUser(
    userId: string,
    now: Date = new Date()
  ): Promise<{ scanned: number; created: number; deduped: number }> {
    const prefs = await notificationRepo.getPreferences(userId);

    // If in-app notifications are globally disabled by user, skip completely
    if (!prefs.inAppEnabled) {
      return { scanned: 0, created: 0, deduped: 0 };
    }

    const timezone = prefs.timezone || 'Asia/Ho_Chi_Minh';
    const isQuiet = isWithinQuietHours(now, prefs.quietHoursStart, prefs.quietHoursEnd, timezone);
    const deliveryTime = isQuiet
      ? getDeferredDeliveryTime(now, prefs.quietHoursEnd, timezone).toISOString()
      : now.toISOString();

    const notificationsToCreate: Omit<Notification, 'id' | 'status'>[] = [];
    let scannedCount = 0;

    // 1. Scan School Timetable Entries (Classes)
    if (prefs.upcomingClass) {
      try {
        const entries = await timetableRepo.getTimetableEntries(userId);

        if (entries && entries.length > 0) {
          // Get today's Day of Week (1=Monday ... 7=Sunday)
          const localDayFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            weekday: 'short',
          });
          const weekdayStr = localDayFormatter.format(now);
          const dayMap: Record<string, number> = {
            Mon: 1,
            Tue: 2,
            Wed: 3,
            Thu: 4,
            Fri: 5,
            Sat: 6,
            Sun: 7,
          };
          const todayDOW = dayMap[weekdayStr] || (now.getDay() === 0 ? 7 : now.getDay());

          const dateStr = now.toISOString().split('T')[0];

          for (const entry of entries) {
            if (entry.dayOfWeek === todayDOW && entry.startLocalTime) {
              scannedCount++;
              const [startH, startM] = entry.startLocalTime.split(':').map(Number);
              const classStartTime = new Date(now.getTime());
              classStartTime.setHours(startH, startM, 0, 0);

              const leadMs = (prefs.classLeadMinutes || prefs.leadMinutes || 15) * 60 * 1000;
              const timeUntilClass = classStartTime.getTime() - now.getTime();

              // If class is within lead window and hasn't ended yet
              if (timeUntilClass > 0 && timeUntilClass <= leadMs) {
                const leadMinutesDisplay = Math.round(timeUntilClass / (60 * 1000));
                const dedupeKey = `class_${entry.id}_${dateStr}_${entry.startLocalTime}`;

                notificationsToCreate.push({
                  userId,
                  type: 'upcoming_class',
                  title: `Tiết học sắp bắt đầu: ${entry.title}`,
                  body: `Tiết ${entry.title} (${entry.subjectName || 'Môn học'}) sẽ bắt đầu sau ${leadMinutesDisplay} phút lúc ${entry.startLocalTime}${entry.location ? ` tại ${entry.location}` : ''}.`,
                  actionUrl: '/timetable',
                  scheduledFor: classStartTime.toISOString(),
                  deliveredAt: deliveryTime,
                  dedupeKey,
                });
              }
            }
          }
        }
      } catch (err: any) {
        console.warn(`[NotificationScheduler] Error scanning timetable for ${userId}:`, err.message);
      }
    }

    // 2. Scan Study Tasks (Task Due & Incomplete)
    if (prefs.incompleteTask) {
      try {
        const tasks = await taskRepo.getByUserId(userId);
        const pendingTasks = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');

        for (const task of pendingTasks) {
          scannedCount++;

          // A. Scheduled session start reminder
          if (task.scheduledStartAt) {
            const startTime = new Date(task.scheduledStartAt);
            const leadMs = (prefs.taskLeadMinutes || 30) * 60 * 1000;
            const diff = startTime.getTime() - now.getTime();

            if (diff > 0 && diff <= leadMs) {
              const minutesLeft = Math.max(1, Math.round(diff / 60000));
              const startKey = task.scheduledStartAt.split('T')[0];
              const dedupeKey = `task_start_${task.id}_${startKey}`;

              notificationsToCreate.push({
                userId,
                type: 'task_due',
                title: `Sắp đến giờ học: ${task.title}`,
                body: `Phiên học "${task.title}" (${task.estimatedMinutes} phút) được lên lịch bắt đầu sau ${minutesLeft} phút.`,
                actionUrl: `/tasks/${task.id}`,
                scheduledFor: startTime.toISOString(),
                deliveredAt: deliveryTime,
                dedupeKey,
              });
            }
          }

          // B. Task Due Date / Overdue reminder
          if (task.dueAt) {
            const dueDate = new Date(task.dueAt);
            const diffHours = (dueDate.getTime() - now.getTime()) / (3600 * 1000);
            const dueKey = task.dueAt.split('T')[0];

            // Due today (within 12 hours) or overdue within 24h grace window
            if (diffHours <= 12 && diffHours >= -24) {
              const isOverdue = diffHours < 0;
              const dedupeKey = `task_due_${task.id}_${dueKey}_${isOverdue ? 'overdue' : 'today'}`;

              notificationsToCreate.push({
                userId,
                type: isOverdue ? 'task_overdue' : 'incomplete_task',
                title: isOverdue ? `Nhiệm vụ quá hạn: ${task.title}` : `Hạn chót hôm nay: ${task.title}`,
                body: isOverdue
                  ? `Nhiệm vụ "${task.title}" đã quá hạn. Hãy hoàn thành sớm để không bị dồn bài tập nhé!`
                  : `Nhiệm vụ "${task.title}" có hạn chót trong hôm nay. Dành thời gian hoàn thành nhé!`,
                actionUrl: `/tasks/${task.id}`,
                scheduledFor: dueDate.toISOString(),
                deliveredAt: deliveryTime,
                dedupeKey,
              });
            }
          }
        }
      } catch (err: any) {
        console.warn(`[NotificationScheduler] Error scanning tasks for ${userId}:`, err.message);
      }
    }

    // 3. Scan Exams & Milestones (D-14, D-7, D-3, D-1)
    if (prefs.upcomingExam) {
      try {
        const exams = await examRepo.getByUserId(userId);
        const upcomingExams = exams.filter((e) => e.status !== 'completed' && e.status !== 'cancelled');

        for (const exam of upcomingExams) {
          scannedCount++;
          const examDate = new Date(exam.examAt);
          const diffDays = Math.ceil((examDate.getTime() - now.getTime()) / (24 * 3600 * 1000));
          const examDateKey = exam.examAt.split('T')[0];

          // Check Milestone intervals: D-14, D-7, D-3, D-1
          const milestones = [14, 7, 3, 1];
          if (milestones.includes(diffDays)) {
            const dedupeKey = `exam_${exam.id}_D-${diffDays}_${examDateKey}`;
            const milestoneLabels: Record<number, string> = {
              14: 'Mốc D-14: Bắt đầu ôn tập nền tảng lý thuyết',
              7: 'Mốc D-7: Luyện đề thi tổng hợp và bấm giờ',
              3: 'Mốc D-3: Rà soát các dạng bài hay sai',
              1: 'Mốc D-1: Giữ tinh thần thoải mái, chuẩn bị đồ dùng',
            };

            notificationsToCreate.push({
              userId,
              type: 'upcoming_exam',
              title: `Kỳ thi sắp tới: ${exam.title} (còn ${diffDays} ngày)`,
              body: `${milestoneLabels[diffDays] || `Chỉ còn ${diffDays} ngày nữa là đến bài kiểm tra`} môn ${exam.subjectName || 'học tập'}.`,
              actionUrl: '/exams',
              scheduledFor: examDate.toISOString(),
              deliveredAt: deliveryTime,
              dedupeKey,
            });
          }
        }
      } catch (err: any) {
        console.warn(`[NotificationScheduler] Error scanning exams for ${userId}:`, err.message);
      }
    }

    // 4. Batch idempotent creation in MySQL / Repository
    const createdCount = await notificationRepo.createManyIdempotent(userId, notificationsToCreate);
    const dedupedCount = notificationsToCreate.length - createdCount;

    return {
      scanned: scannedCount,
      created: createdCount,
      deduped: dedupedCount,
    };
  }

  /**
   * Scans all active users in the system and triggers cron notification generation
   */
  public async scanAllUsers(
    now: Date = new Date()
  ): Promise<{ usersScanned: number; scanned: number; created: number; deduped: number; errors: number }> {
    let usersScanned = 0;
    let totalScanned = 0;
    let totalCreated = 0;
    let totalDeduped = 0;
    let totalErrors = 0;

    let userIds: string[] = ['usr_student_demo_01'];

    if (db.isHealthy()) {
      try {
        const rows = await db.query<any>('SELECT id FROM users WHERE status = "active" LIMIT 1000');
        if (rows.length > 0) {
          userIds = rows.map((r) => r.id);
        }
      } catch (err: any) {
        console.warn('[NotificationScheduler] DB error fetching users for cron scan:', err.message);
      }
    }

    for (const userId of userIds) {
      try {
        usersScanned++;
        const result = await this.scanAndGenerateForUser(userId, now);
        totalScanned += result.scanned;
        totalCreated += result.created;
        totalDeduped += result.deduped;
      } catch (err: any) {
        totalErrors++;
        console.error(`[NotificationScheduler] Error processing user ${userId}:`, err);
      }
    }

    return {
      usersScanned,
      scanned: totalScanned,
      created: totalCreated,
      deduped: totalDeduped,
      errors: totalErrors,
    };
  }
}

export const notificationScheduler = NotificationSchedulerService.getInstance();
