-- JAMI AI Database Schema Migration 025: Busy Event Exceptions & Auth Sessions Column Reconciliation
-- Idempotent schema reconciliation for Busy Events skipping and Auth Sessions audit logging

-- 1. Create busy_event_exceptions table for "Nghỉ tạm lần này / Nghỉ tuần này" in Thời gian biểu
CREATE TABLE IF NOT EXISTS busy_event_exceptions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  busy_event_id VARCHAR(36) NOT NULL,
  occurrence_date DATE NOT NULL,
  exception_type VARCHAR(20) NOT NULL DEFAULT 'cancelled',
  reason VARCHAR(255) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_busy_event_occurrence (busy_event_id, occurrence_date),
  INDEX idx_busy_exceptions_user_date (user_id, occurrence_date),
  INDEX idx_busy_exceptions_event (busy_event_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (busy_event_id) REFERENCES busy_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Ensure auth_sessions has user_agent, ip_address, and is_demo
ALTER TABLE auth_sessions ADD COLUMN user_agent VARCHAR(500) NULL;
ALTER TABLE auth_sessions ADD COLUMN ip_address VARCHAR(45) NULL;
ALTER TABLE auth_sessions ADD COLUMN is_demo BOOLEAN DEFAULT FALSE;

-- 3. Ensure users table columns exist and have appropriate defaults
ALTER TABLE users ADD COLUMN last_active_at DATETIME(3) NULL;
ALTER TABLE users ADD COLUMN password_scheme VARCHAR(50) NULL DEFAULT 'scrypt';
ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN preferred_name VARCHAR(100) NULL;

-- 4. Ensure jami_preferences has sound_effects column
ALTER TABLE jami_preferences ADD COLUMN sound_effects BOOLEAN DEFAULT TRUE;
