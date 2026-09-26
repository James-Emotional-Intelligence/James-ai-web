-- JAMI AI Database Schema Migration 008: Notifications Subsystem Enhancement
-- Idempotent schema reconciliation for Notifications, Deduplication & User Preferences

-- 1. Ensure notifications table has all required columns, soft-delete, and unique dedupe index
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(150) NOT NULL,
  body TEXT NOT NULL,
  action_url VARCHAR(255) NULL,
  scheduled_for DATETIME(3) NULL,
  delivered_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  read_at DATETIME(3) NULL,
  status VARCHAR(20) DEFAULT 'unread',
  dedupe_key VARCHAR(128) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE notifications ADD COLUMN dedupe_key VARCHAR(128) NULL;
ALTER TABLE notifications ADD COLUMN deleted_at DATETIME(3) NULL;
ALTER TABLE notifications ADD INDEX idx_notif_user_status_time (user_id, status, created_at);
ALTER TABLE notifications ADD INDEX idx_notif_user_type (user_id, type);
ALTER TABLE notifications ADD UNIQUE INDEX uq_notif_user_dedupe (user_id, dedupe_key);

-- 2. Ensure notification_preferences table has granular lead times, quiet hours, and push configs
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id VARCHAR(36) PRIMARY KEY,
  upcoming_class BOOLEAN DEFAULT TRUE,
  upcoming_exam BOOLEAN DEFAULT TRUE,
  incomplete_task BOOLEAN DEFAULT TRUE,
  sound_enabled BOOLEAN DEFAULT TRUE,
  lead_minutes INT DEFAULT 15,
  class_lead_minutes INT DEFAULT 15,
  task_lead_minutes INT DEFAULT 30,
  exam_lead_days INT DEFAULT 1,
  quiet_hours_start VARCHAR(5) DEFAULT '22:30',
  quiet_hours_end VARCHAR(5) DEFAULT '06:30',
  timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',
  in_app_enabled BOOLEAN DEFAULT TRUE,
  web_push_enabled BOOLEAN DEFAULT FALSE,
  reminder_lead_minutes_json JSON NULL,
  push_subscription_json JSON NULL,
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE notification_preferences ADD COLUMN upcoming_class BOOLEAN DEFAULT TRUE;
ALTER TABLE notification_preferences ADD COLUMN upcoming_exam BOOLEAN DEFAULT TRUE;
ALTER TABLE notification_preferences ADD COLUMN incomplete_task BOOLEAN DEFAULT TRUE;
ALTER TABLE notification_preferences ADD COLUMN sound_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE notification_preferences ADD COLUMN lead_minutes INT DEFAULT 15;
ALTER TABLE notification_preferences ADD COLUMN class_lead_minutes INT DEFAULT 15;
ALTER TABLE notification_preferences ADD COLUMN task_lead_minutes INT DEFAULT 30;
ALTER TABLE notification_preferences ADD COLUMN exam_lead_days INT DEFAULT 1;
ALTER TABLE notification_preferences ADD COLUMN quiet_hours_start VARCHAR(5) DEFAULT '22:30';
ALTER TABLE notification_preferences ADD COLUMN quiet_hours_end VARCHAR(5) DEFAULT '06:30';
ALTER TABLE notification_preferences ADD COLUMN timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh';
ALTER TABLE notification_preferences ADD COLUMN in_app_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE notification_preferences ADD COLUMN web_push_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE notification_preferences ADD COLUMN push_subscription_json JSON NULL;
ALTER TABLE notification_preferences ADD COLUMN updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
