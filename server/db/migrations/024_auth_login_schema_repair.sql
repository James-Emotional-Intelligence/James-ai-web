-- JAMI AI Database Schema Migration 024: Auth Schema Repair & User Column Integrity
-- Idempotent reconciliation for users and auth_sessions tables

-- 1. Ensure last_active_at exists in users table
ALTER TABLE users ADD COLUMN last_active_at DATETIME(3) NULL;

-- 2. Ensure password_scheme exists in users table
ALTER TABLE users ADD COLUMN password_scheme VARCHAR(50) NULL DEFAULT 'scrypt';
ALTER TABLE users MODIFY COLUMN password_scheme VARCHAR(50) NULL DEFAULT 'scrypt';

-- 3. Ensure role exists in users table
ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user';

-- 4. Ensure status exists in users table
ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active';

-- 5. Ensure preferred_name exists in users table
ALTER TABLE users ADD COLUMN preferred_name VARCHAR(100) NULL;

-- 6. Ensure auth_sessions table exists with all canonical columns
CREATE TABLE IF NOT EXISTS auth_sessions (
  id VARCHAR(36) PRIMARY KEY,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  user_id VARCHAR(36) NOT NULL,
  is_demo BOOLEAN DEFAULT FALSE,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_auth_sessions_user (user_id),
  INDEX idx_auth_sessions_lookup (token_hash, revoked_at, expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Ensure is_demo exists on auth_sessions if table already existed
ALTER TABLE auth_sessions ADD COLUMN is_demo BOOLEAN DEFAULT FALSE;

-- 8. Add index on users.last_active_at for efficient queries
ALTER TABLE users ADD INDEX idx_users_last_active (last_active_at);

-- 9. Ensure sound_effects exists in jami_preferences
ALTER TABLE jami_preferences ADD COLUMN sound_effects BOOLEAN DEFAULT TRUE;
