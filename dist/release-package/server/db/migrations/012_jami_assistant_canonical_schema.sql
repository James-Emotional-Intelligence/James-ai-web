-- JAMI AI Database Schema Migration 012: Jami Assistant Canonical Chat & Action Proposals Schema
-- Idempotent schema reconciliation for jami_conversations, jami_messages, and jami_action_proposals

-- 1. Ensure jami_conversations exists and has is_archived
CREATE TABLE IF NOT EXISTS jami_conversations (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(150) NOT NULL DEFAULT 'Hội thoại với Jami',
  is_archived BOOLEAN DEFAULT FALSE,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_conv_user_time (user_id, updated_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Ensure jami_messages exists and has full canonical columns
CREATE TABLE IF NOT EXISTS jami_messages (
  id VARCHAR(36) PRIMARY KEY,
  conversation_id VARCHAR(36) NULL,
  user_id VARCHAR(36) NOT NULL,
  sender VARCHAR(20) NOT NULL DEFAULT 'jami',
  text TEXT NOT NULL,
  content TEXT NULL,
  emotion VARCHAR(30) DEFAULT 'idle',
  metadata_json JSON NULL,
  suggested_actions_json JSON NULL,
  requires_confirmation BOOLEAN DEFAULT FALSE,
  confirmation_summary TEXT NULL,
  proposal_id VARCHAR(36) NULL,
  is_confirmed BOOLEAN DEFAULT FALSE,
  client_message_id VARCHAR(64) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_jmsg_user_conv_time (user_id, conversation_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create jami_action_proposals table for safe user-confirmed mutations
CREATE TABLE IF NOT EXISTS jami_action_proposals (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  conversation_id VARCHAR(36) NULL,
  message_id VARCHAR(36) NULL,
  action_type VARCHAR(50) NOT NULL,
  arguments_json JSON NOT NULL,
  preview_json JSON NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'confirmed', 'executed', 'rejected', 'expired', 'failed'
  idempotency_key VARCHAR(64) NULL,
  expires_at DATETIME(3) NOT NULL,
  executed_at DATETIME(3) NULL,
  error_code VARCHAR(50) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_act_prop_user_status (user_id, status),
  INDEX idx_act_prop_idempotency (idempotency_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
