-- Migration 035: Action Proposals, Realtime Safety & Billing Hardening
-- Canonical reconciliations for jami_action_proposals, ai_realtime_sessions, notifications, and ai_wallet_reconcile_queue

-- 1. jami_action_proposals Canonical Schema Reconciliation
CREATE TABLE IF NOT EXISTS jami_action_proposals (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  conversation_id VARCHAR(36) NULL,
  message_id VARCHAR(36) NULL,
  action_type VARCHAR(50) NOT NULL,
  payload_json JSON NOT NULL,
  preview_text TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  idempotency_key VARCHAR(64) NULL,
  expires_at DATETIME(3) NOT NULL,
  processing_at DATETIME(3) NULL,
  confirmed_at DATETIME(3) NULL,
  rejected_at DATETIME(3) NULL,
  executed_at DATETIME(3) NULL,
  error_code VARCHAR(50) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_act_user_status_exp (user_id, status, expires_at),
  INDEX idx_act_user_idemp (user_id, idempotency_key),
  INDEX idx_act_conv (conversation_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reconcile message_id
SET @exist_col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_action_proposals' AND column_name = 'message_id');
SET @sql := IF(@exist_col = 0, 'ALTER TABLE jami_action_proposals ADD COLUMN message_id VARCHAR(36) NULL AFTER conversation_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Reconcile payload_json
SET @exist_col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_action_proposals' AND column_name = 'payload_json');
SET @sql := IF(@exist_col = 0, 'ALTER TABLE jami_action_proposals ADD COLUMN payload_json JSON NULL AFTER action_type', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Reconcile preview_text
SET @exist_col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_action_proposals' AND column_name = 'preview_text');
SET @sql := IF(@exist_col = 0, 'ALTER TABLE jami_action_proposals ADD COLUMN preview_text TEXT NULL AFTER payload_json', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Reconcile processing_at
SET @exist_col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_action_proposals' AND column_name = 'processing_at');
SET @sql := IF(@exist_col = 0, 'ALTER TABLE jami_action_proposals ADD COLUMN processing_at DATETIME(3) NULL AFTER expires_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Reconcile rejected_at
SET @exist_col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_action_proposals' AND column_name = 'rejected_at');
SET @sql := IF(@exist_col = 0, 'ALTER TABLE jami_action_proposals ADD COLUMN rejected_at DATETIME(3) NULL AFTER confirmed_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Reconcile executed_at
SET @exist_col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_action_proposals' AND column_name = 'executed_at');
SET @sql := IF(@exist_col = 0, 'ALTER TABLE jami_action_proposals ADD COLUMN executed_at DATETIME(3) NULL AFTER rejected_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Reconcile updated_at
SET @exist_col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_action_proposals' AND column_name = 'updated_at');
SET @sql := IF(@exist_col = 0, 'ALTER TABLE jami_action_proposals ADD COLUMN updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) AFTER created_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill existing legacy columns if present
SET @exist_arg_col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_action_proposals' AND column_name = 'arguments_json');
SET @sql_backfill_payload := IF(@exist_arg_col > 0, 'UPDATE jami_action_proposals SET payload_json = arguments_json WHERE payload_json IS NULL AND arguments_json IS NOT NULL', 'SELECT 1');
PREPARE stmt FROM @sql_backfill_payload; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist_prev_col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_action_proposals' AND column_name = 'preview_json');
SET @sql_backfill_preview := IF(@exist_prev_col > 0, 'UPDATE jami_action_proposals SET preview_text = CAST(preview_json AS CHAR) WHERE (preview_text IS NULL OR preview_text = \'\') AND preview_json IS NOT NULL', 'SELECT 1');
PREPARE stmt FROM @sql_backfill_preview; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. ai_realtime_sessions Schema Reconciliation
SET @exist_rt_pricing := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'ai_realtime_sessions' AND column_name = 'pricing_version');
SET @sql := IF(@exist_rt_pricing = 0, 'ALTER TABLE ai_realtime_sessions ADD COLUMN pricing_version VARCHAR(64) NOT NULL DEFAULT \'2026-09-19-standard\' AFTER actual_cost_milli_vnd', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist_rt_model := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'ai_realtime_sessions' AND column_name = 'model');
SET @sql := IF(@exist_rt_model = 0, 'ALTER TABLE ai_realtime_sessions ADD COLUMN model VARCHAR(64) NOT NULL DEFAULT \'gpt-realtime\' AFTER user_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist_rt_reconciled := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'ai_realtime_sessions' AND column_name = 'reconciled_at');
SET @sql := IF(@exist_rt_reconciled = 0, 'ALTER TABLE ai_realtime_sessions ADD COLUMN reconciled_at DATETIME(3) NULL AFTER ended_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Durable Outbox for Failed AI Billing Reconciliation
CREATE TABLE IF NOT EXISTS ai_wallet_reconcile_queue (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  idempotency_key VARCHAR(150) NOT NULL UNIQUE,
  reserved_milli_vnd BIGINT UNSIGNED NOT NULL DEFAULT 0,
  actual_cost_milli_vnd BIGINT UNSIGNED NOT NULL DEFAULT 0,
  is_unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  request_id VARCHAR(100) NULL,
  ai_run_id VARCHAR(64) NULL,
  reason VARCHAR(255) NOT NULL,
  metadata_json JSON NULL,
  status ENUM('pending', 'processing', 'resolved', 'failed') NOT NULL DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_rq_user_status (user_id, status),
  INDEX idx_rq_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Reconcile notifications for Reminders & Scheduled notifications
SET @exist_notif_sched := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'notifications' AND column_name = 'scheduled_for');
SET @sql := IF(@exist_notif_sched = 0, 'ALTER TABLE notifications ADD COLUMN scheduled_for DATETIME(3) NULL AFTER created_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist_notif_dedupe := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'notifications' AND column_name = 'dedupe_key');
SET @sql := IF(@exist_notif_dedupe = 0, 'ALTER TABLE notifications ADD COLUMN dedupe_key VARCHAR(100) NULL AFTER scheduled_for', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
