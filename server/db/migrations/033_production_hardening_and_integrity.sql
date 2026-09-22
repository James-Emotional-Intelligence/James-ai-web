-- Migration 033: Production Hardening, Realtime Session Lifecycle & Billing Integrity Indices
-- Forward-only database migration for JAMI AI production release

-- 1. Ensure ai_realtime_sessions exists with all required lifecycle columns
CREATE TABLE IF NOT EXISTS ai_realtime_sessions (
  id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  reservation_idempotency_key VARCHAR(150) NOT NULL,
  reserved_milli_vnd BIGINT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('active', 'completed', 'cancelled', 'expired', 'failed') NOT NULL DEFAULT 'active',
  actual_cost_milli_vnd BIGINT UNSIGNED DEFAULT NULL,
  raw_usage_json LONGTEXT DEFAULT NULL,
  started_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) DEFAULT NULL,
  ended_at DATETIME(3) DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_rt_user_created (user_id, created_at),
  KEY idx_rt_status (status),
  KEY idx_rt_res_idemp (reservation_idempotency_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Ensure indices on ai_runs for query performance & daily spend audit
SET @exist_idx_runs_uc := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_runs'
    AND index_name = 'idx_ai_runs_user_created'
);
SET @sql_runs_uc := IF(@exist_idx_runs_uc = 0, 'ALTER TABLE ai_runs ADD INDEX idx_ai_runs_user_created (user_id, created_at)', 'SELECT 1');
PREPARE stmt_runs_uc FROM @sql_runs_uc;
EXECUTE stmt_runs_uc;
DEALLOCATE PREPARE stmt_runs_uc;

SET @exist_idx_runs_sc := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_runs'
    AND index_name = 'idx_ai_runs_status_created'
);
SET @sql_runs_sc := IF(@exist_idx_runs_sc = 0, 'ALTER TABLE ai_runs ADD INDEX idx_ai_runs_status_created (status, created_at)', 'SELECT 1');
PREPARE stmt_runs_sc FROM @sql_runs_sc;
EXECUTE stmt_runs_sc;
DEALLOCATE PREPARE stmt_runs_sc;

-- 3. Ensure indices on ai_wallet_transactions for idempotency & balance ledger lookups
SET @exist_idx_tx_idemp := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_wallet_transactions'
    AND index_name = 'idx_wallet_tx_user_idemp'
);
SET @sql_tx_idemp := IF(@exist_idx_tx_idemp = 0, 'ALTER TABLE ai_wallet_transactions ADD INDEX idx_wallet_tx_user_idemp (user_id, idempotency_key)', 'SELECT 1');
PREPARE stmt_tx_idemp FROM @sql_tx_idemp;
EXECUTE stmt_tx_idemp;
DEALLOCATE PREPARE stmt_tx_idemp;

SET @exist_idx_tx_utc := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_wallet_transactions'
    AND index_name = 'idx_wallet_tx_user_type_created'
);
SET @sql_tx_utc := IF(@exist_idx_tx_utc = 0, 'ALTER TABLE ai_wallet_transactions ADD INDEX idx_wallet_tx_user_type_created (user_id, type, created_at)', 'SELECT 1');
PREPARE stmt_tx_utc FROM @sql_tx_utc;
EXECUTE stmt_tx_utc;
DEALLOCATE PREPARE stmt_tx_utc;
