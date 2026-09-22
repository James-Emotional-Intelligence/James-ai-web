-- Migration 037: AI Safety, Strict Schemas, Idempotency and Durable Outbox Alignment
-- Ensures zero schema drift across ai_wallet_reconcile_queue, jami_messages idempotency, and realtime sessions.

-- 1. Ensure ai_wallet_reconcile_queue canonical structure
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

-- 2. Ensure ai_realtime_sessions has reconciled_at column
SET @exist_rt_reconciled := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'ai_realtime_sessions' AND column_name = 'reconciled_at');
SET @sql := IF(@exist_rt_reconciled = 0, 'ALTER TABLE ai_realtime_sessions ADD COLUMN reconciled_at DATETIME(3) NULL AFTER ended_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Ensure jami_messages has unique index on client_message_id per user (idempotent retry defense)
SET @exist_msg_idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE table_schema = DATABASE() AND table_name = 'jami_messages' AND index_name = 'idx_jm_user_client_msg');
SET @sql := IF(@exist_msg_idx = 0, 'CREATE INDEX idx_jm_user_client_msg ON jami_messages (user_id, client_message_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Ensure material_processing_jobs has updated_at column
SET @exist_mat_updated := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'material_processing_jobs' AND column_name = 'updated_at');
SET @sql := IF(@exist_mat_updated = 0, 'ALTER TABLE material_processing_jobs ADD COLUMN updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
