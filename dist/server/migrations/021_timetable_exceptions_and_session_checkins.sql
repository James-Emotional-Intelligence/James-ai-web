-- JAMI AI Database Schema Migration 021: Timetable Entry Exceptions & Session Check-ins
-- Idempotent schema for single-session timetable cancellation and offline session check-in reflections

CREATE TABLE IF NOT EXISTS timetable_entry_exceptions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  timetable_entry_id VARCHAR(64) NOT NULL,
  occurrence_date VARCHAR(10) NOT NULL, -- 'YYYY-MM-DD'
  exception_type VARCHAR(32) NOT NULL DEFAULT 'cancelled', -- 'cancelled', 'rescheduled', 'skip'
  reason VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_entry_occurrence (timetable_entry_id, occurrence_date),
  INDEX idx_exceptions_user_date (user_id, occurrence_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS class_session_checkins (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  timetable_entry_id VARCHAR(64) NOT NULL,
  occurrence_date VARCHAR(10) NOT NULL, -- 'YYYY-MM-DD'
  learned_content TEXT NULL,
  homework TEXT NULL,
  reflection TEXT NULL,
  understanding_level VARCHAR(32) NULL, -- 'very_easy', 'normal', 'hard', 'not_understood'
  attendance_status VARCHAR(32) NOT NULL DEFAULT 'attended', -- 'attended', 'absent'
  completed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_checkin_user_entry_occ (user_id, timetable_entry_id, occurrence_date),
  INDEX idx_checkins_user_date (user_id, occurrence_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
