-- JAMI AI Database Schema Migration 003: Reconciliation & Chat History Schema
-- Ensures complete idempotent column reconciliation and adds jami_conversations & jami_messages tables

-- 1. Create Jami Chat Tables if not existing
CREATE TABLE IF NOT EXISTS jami_conversations (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_jconv_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  INDEX idx_jmsg_conv (conversation_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Schedule Proposals Persistence
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
