-- JAMI AI Database Schema Migration 015: Comprehensive Column Reconciliation
-- Forward-only migration to ensure all canonical columns exist across all tables

-- 1. jami_messages columns
ALTER TABLE jami_messages ADD COLUMN conversation_id VARCHAR(36) NULL;
ALTER TABLE jami_messages ADD COLUMN content TEXT NULL;
ALTER TABLE jami_messages ADD COLUMN metadata_json JSON NULL;
ALTER TABLE jami_messages ADD COLUMN suggested_actions_json JSON NULL;
ALTER TABLE jami_messages ADD COLUMN requires_confirmation BOOLEAN DEFAULT FALSE;
ALTER TABLE jami_messages ADD COLUMN confirmation_summary TEXT NULL;
ALTER TABLE jami_messages ADD COLUMN proposal_id VARCHAR(36) NULL;
ALTER TABLE jami_messages ADD COLUMN is_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE jami_messages ADD COLUMN client_message_id VARCHAR(64) NULL;

-- 2. jami_conversations columns
ALTER TABLE jami_conversations ADD COLUMN is_archived BOOLEAN DEFAULT FALSE;

-- 3. focus_sessions columns
ALTER TABLE focus_sessions ADD COLUMN phase VARCHAR(20) DEFAULT 'work';
ALTER TABLE focus_sessions ADD COLUMN break_minutes INT DEFAULT 5;
ALTER TABLE focus_sessions ADD COLUMN last_resumed_at DATETIME(3) NULL;
ALTER TABLE focus_sessions ADD COLUMN target_end_at DATETIME(3) NULL;
ALTER TABLE focus_sessions ADD COLUMN remaining_seconds_at_pause INT NULL;
ALTER TABLE focus_sessions ADD COLUMN actual_focus_seconds INT DEFAULT 0;
ALTER TABLE focus_sessions ADD COLUMN idempotency_key VARCHAR(64) NULL;
