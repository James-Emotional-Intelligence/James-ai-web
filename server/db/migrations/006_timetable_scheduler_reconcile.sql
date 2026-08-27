-- JAMI AI Database Schema Migration 006: Timetable, Scheduler & Replan Reconciliation
-- Idempotent schema reconciliation for Aiven MySQL & Production deployments

-- 1. Ensure school_timetables table and indexes exist
CREATE TABLE IF NOT EXISTS school_timetables (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  valid_from DATE NULL,
  valid_to DATE NULL,
  timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE school_timetables ADD INDEX idx_user_active (user_id, is_active);

-- 2. Ensure school_timetable_entries table and indexes exist
CREATE TABLE IF NOT EXISTS school_timetable_entries (
  id VARCHAR(36) PRIMARY KEY,
  timetable_id VARCHAR(36) NOT NULL,
  subject_id VARCHAR(36) NULL,
  title VARCHAR(150) NOT NULL,
  day_of_week INT NOT NULL, -- 1 = Monday, ..., 7 = Sunday
  start_local_time VARCHAR(5) NOT NULL, -- '07:30'
  end_local_time VARCHAR(5) NOT NULL,   -- '11:45'
  location VARCHAR(100) NULL,
  commute_before_minutes INT DEFAULT 15,
  commute_after_minutes INT DEFAULT 15,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (timetable_id) REFERENCES school_timetables(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE school_timetable_entries ADD INDEX idx_timetable_day (timetable_id, day_of_week, start_local_time);

-- 3. Ensure busy_events table has subject_id column and proper time indexes
CREATE TABLE IF NOT EXISTS busy_events (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(150) NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  recurrence_rule VARCHAR(100) NULL,
  timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',
  is_fixed BOOLEAN DEFAULT TRUE,
  source VARCHAR(50) DEFAULT 'user',
  subject_id VARCHAR(36) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE busy_events ADD COLUMN subject_id VARCHAR(36) NULL;
ALTER TABLE busy_events ADD INDEX idx_user_starts_ends (user_id, starts_at, ends_at);

-- 4. Ensure availability_rules table has type and is_enabled columns
CREATE TABLE IF NOT EXISTS availability_rules (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  day_of_week INT NOT NULL,
  start_local_time VARCHAR(5) NOT NULL,
  end_local_time VARCHAR(5) NOT NULL,
  effective_from DATE NULL,
  effective_to DATE NULL,
  type VARCHAR(20) DEFAULT 'available',
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE availability_rules ADD COLUMN type VARCHAR(20) DEFAULT 'available';
ALTER TABLE availability_rules ADD COLUMN is_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE availability_rules ADD INDEX idx_user_day_enabled (user_id, day_of_week, is_enabled);

-- 5. Ensure schedule_proposals table has all required columns and indexes
CREATE TABLE IF NOT EXISTS schedule_proposals (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  base_plan_version INT DEFAULT 1,
  status VARCHAR(20) DEFAULT 'pending',
  reason TEXT NOT NULL,
  diff_json JSON NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  confirmed_at DATETIME(3) NULL,
  idempotency_key VARCHAR(64) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE schedule_proposals ADD COLUMN idempotency_key VARCHAR(64) NULL;
ALTER TABLE schedule_proposals ADD INDEX idx_user_status_expires (user_id, status, expires_at);
ALTER TABLE schedule_proposals ADD INDEX idx_user_idempotency (user_id, idempotency_key);
