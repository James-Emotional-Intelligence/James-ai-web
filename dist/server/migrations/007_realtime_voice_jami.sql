-- JAMI AI Database Schema Migration 007: Realtime Voice Jami & Action Proposals
-- Idempotent schema reconciliation for Voice Requests, Jami Messages & Action Execution

-- 1. Ensure voice_requests table exists with full metadata
CREATE TABLE IF NOT EXISTS voice_requests (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  purpose VARCHAR(50) NOT NULL DEFAULT 'voice_command',
  transcript TEXT NULL,
  language VARCHAR(10) DEFAULT 'vi',
  duration_ms INT DEFAULT 0,
  processing_status VARCHAR(30) DEFAULT 'completed',
  mode VARCHAR(30) DEFAULT 'openai_realtime',
  client_turn_id VARCHAR(64) NULL,
  error_code VARCHAR(50) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE voice_requests ADD COLUMN mode VARCHAR(30) DEFAULT 'openai_realtime';
ALTER TABLE voice_requests ADD COLUMN client_turn_id VARCHAR(64) NULL;
ALTER TABLE voice_requests ADD COLUMN deleted_at DATETIME(3) NULL;
ALTER TABLE voice_requests ADD INDEX idx_user_turn (user_id, client_turn_id);
ALTER TABLE voice_requests ADD INDEX idx_user_created (user_id, created_at);

-- 2. Ensure jami_action_proposals table exists for safe mutation previews & confirmations
CREATE TABLE IF NOT EXISTS jami_action_proposals (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  conversation_id VARCHAR(36) NULL,
  action_type VARCHAR(50) NOT NULL,
  payload_json JSON NOT NULL,
  preview_text TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  expires_at DATETIME(3) NOT NULL,
  confirmed_at DATETIME(3) NULL,
  idempotency_key VARCHAR(64) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE jami_action_proposals ADD INDEX idx_act_user_status_exp (user_id, status, expires_at);
ALTER TABLE jami_action_proposals ADD INDEX idx_act_user_idempotency (user_id, idempotency_key);

-- 3. Ensure jami_messages table has all required columns and indexes
CREATE TABLE IF NOT EXISTS jami_messages (
  id VARCHAR(36) PRIMARY KEY,
  conversation_id VARCHAR(36) NULL,
  user_id VARCHAR(36) NOT NULL DEFAULT 'usr_student_demo_01',
  sender VARCHAR(20) NOT NULL DEFAULT 'jami',
  text TEXT NOT NULL,
  emotion VARCHAR(30) DEFAULT 'idle',
  suggested_actions_json JSON NULL,
  requires_confirmation BOOLEAN DEFAULT FALSE,
  confirmation_summary TEXT NULL,
  proposal_id VARCHAR(36) NULL,
  is_confirmed BOOLEAN DEFAULT FALSE,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE jami_messages ADD COLUMN user_id VARCHAR(36) NOT NULL DEFAULT 'usr_student_demo_01';
ALTER TABLE jami_messages ADD COLUMN conversation_id VARCHAR(36) NULL;
ALTER TABLE jami_messages ADD COLUMN sender VARCHAR(20) NOT NULL DEFAULT 'jami';
ALTER TABLE jami_messages ADD COLUMN text TEXT NOT NULL;
ALTER TABLE jami_messages ADD COLUMN emotion VARCHAR(30) DEFAULT 'idle';
ALTER TABLE jami_messages ADD COLUMN suggested_actions_json JSON NULL;
ALTER TABLE jami_messages ADD COLUMN requires_confirmation BOOLEAN DEFAULT FALSE;
ALTER TABLE jami_messages ADD COLUMN confirmation_summary TEXT NULL;
ALTER TABLE jami_messages ADD COLUMN proposal_id VARCHAR(36) NULL;
ALTER TABLE jami_messages ADD COLUMN is_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE jami_messages ADD INDEX idx_jmsg_user_time (user_id, created_at);
