-- JAMI AI Database Schema Migration 013: Focus Sessions State Machine & Dashboard Aggregation Reconcile
-- Forward-only migration to support reliable pause/resume/reload recovery and single-active session constraints

-- 1. Create table if not exists (for fresh databases)
CREATE TABLE IF NOT EXISTS focus_sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36) NULL,
  mode VARCHAR(20) DEFAULT '25_5',
  phase VARCHAR(20) DEFAULT 'work',
  planned_minutes INT DEFAULT 25,
  break_minutes INT DEFAULT 5,
  state VARCHAR(20) DEFAULT 'ready',
  started_at DATETIME(3) NULL,
  paused_at DATETIME(3) NULL,
  ended_at DATETIME(3) NULL,
  last_resumed_at DATETIME(3) NULL,
  target_end_at DATETIME(3) NULL,
  remaining_seconds_at_pause INT NULL,
  actual_focus_seconds INT DEFAULT 0,
  accumulated_pause_seconds INT DEFAULT 0,
  pause_count INT DEFAULT 0,
  notes TEXT NULL,
  outcome VARCHAR(50) NULL,
  idempotency_key VARCHAR(64) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_focus_user_state (user_id, state),
  INDEX idx_focus_user_created (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Add columns if table already existed from migration 001
ALTER TABLE focus_sessions ADD COLUMN phase VARCHAR(20) DEFAULT 'work';
ALTER TABLE focus_sessions ADD COLUMN break_minutes INT DEFAULT 5;
ALTER TABLE focus_sessions ADD COLUMN last_resumed_at DATETIME(3) NULL;
ALTER TABLE focus_sessions ADD COLUMN target_end_at DATETIME(3) NULL;
ALTER TABLE focus_sessions ADD COLUMN remaining_seconds_at_pause INT NULL;
ALTER TABLE focus_sessions ADD COLUMN actual_focus_seconds INT DEFAULT 0;
ALTER TABLE focus_sessions ADD COLUMN idempotency_key VARCHAR(64) NULL;
ALTER TABLE focus_sessions ADD COLUMN updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
