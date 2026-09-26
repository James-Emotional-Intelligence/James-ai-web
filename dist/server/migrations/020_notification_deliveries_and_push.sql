-- JAMI AI Database Schema Migration 020: Notification Deliveries & Push Subscriptions
-- Idempotent schema reconciliation for notification deliveries, web push subscriptions, and scheduled jobs

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id VARCHAR(36) PRIMARY KEY,
  notification_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  channel VARCHAR(30) NOT NULL, -- 'in_app', 'web_push', 'email'
  status VARCHAR(20) DEFAULT 'delivered', -- 'delivered', 'failed', 'suppressed'
  error_message TEXT NULL,
  delivered_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_deliveries_user (user_id, channel),
  INDEX idx_deliveries_notification (notification_id),
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_push_sub_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  job_type VARCHAR(50) NOT NULL, -- 'upcoming_class_reminder', 'upcoming_exam_reminder', 'overdue_task_check'
  target_id VARCHAR(36) NULL,
  scheduled_at DATETIME(3) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'executed', 'cancelled'
  payload_json JSON NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_sched_jobs_user_status (user_id, status, scheduled_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
