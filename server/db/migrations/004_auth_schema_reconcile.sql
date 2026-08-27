-- JAMI AI Database Schema Migration 004: Comprehensive Auth & Core Schema Reconcile
-- Idempotent schema reconciliation for Aiven MySQL / Production Deployment

-- 1. Ensure schema_migrations exists
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  checksum VARCHAR(64) NOT NULL,
  applied_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Ensure users table exists with all required columns
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  password_salt VARCHAR(64) NOT NULL,
  password_scheme VARCHAR(20) DEFAULT 'scrypt',
  display_name VARCHAR(100) NOT NULL,
  preferred_name VARCHAR(50) NOT NULL,
  locale VARCHAR(10) DEFAULT 'vi-VN',
  timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',
  age_band VARCHAR(20) DEFAULT '14-17',
  status VARCHAR(20) DEFAULT 'active',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Ensure student_profiles table exists
CREATE TABLE IF NOT EXISTS student_profiles (
  user_id VARCHAR(36) PRIMARY KEY,
  grade_level INT NOT NULL DEFAULT 9,
  school_name VARCHAR(255) NULL,
  goals_json JSON NULL,
  preferred_session_minutes INT DEFAULT 45,
  max_daily_study_minutes INT DEFAULT 180,
  energy_preferences_json JSON NULL,
  sleep_schedule_json JSON NULL,
  meal_times_json JSON NULL,
  onboarding_completed_at DATETIME(3) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Ensure auth_sessions table exists with is_demo column
CREATE TABLE IF NOT EXISTS auth_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  user_agent VARCHAR(255) NULL,
  ip_address VARCHAR(50) NULL,
  is_demo BOOLEAN DEFAULT FALSE,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_session_token (token_hash),
  INDEX idx_session_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Ensure password_reset_tokens table exists
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_reset_token (token_hash),
  INDEX idx_reset_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Ensure jami_messages table exists
CREATE TABLE IF NOT EXISTS jami_messages (
  id VARCHAR(36) PRIMARY KEY,
  conversation_id VARCHAR(36) NULL,
  user_id VARCHAR(36) NOT NULL,
  sender VARCHAR(20) NOT NULL,
  text TEXT NOT NULL,
  emotion VARCHAR(30) DEFAULT 'idle',
  suggested_actions_json JSON NULL,
  requires_confirmation BOOLEAN DEFAULT FALSE,
  confirmation_summary TEXT NULL,
  proposal_id VARCHAR(36) NULL,
  is_confirmed BOOLEAN DEFAULT FALSE,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_jmsg_user_time (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Ensure schedule_proposals table exists
CREATE TABLE IF NOT EXISTS schedule_proposals (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  tasks_json JSON NOT NULL,
  scheduled_events_json JSON NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  confirmed_at DATETIME(3) NULL,
  INDEX idx_sprop_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
