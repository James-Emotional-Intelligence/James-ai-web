-- Migration 032: AI Realtime Sessions Safety, Robust Billing & Pricing Integrity Fix
-- Canonical Table 55: ai_realtime_sessions

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

-- Add index on ai_runs for user + created_at if not exists
SET @exist_idx := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_runs'
    AND index_name = 'idx_ai_runs_user_created'
);
SET @sql := IF(@exist_idx = 0, 'ALTER TABLE ai_runs ADD INDEX idx_ai_runs_user_created (user_id, created_at)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index on ai_wallet_transactions for user + idempotency_key if not exists
SET @exist_idx2 := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_wallet_transactions'
    AND index_name = 'idx_wallet_tx_user_idemp'
);
SET @sql2 := IF(@exist_idx2 = 0, 'ALTER TABLE ai_wallet_transactions ADD INDEX idx_wallet_tx_user_idemp (user_id, idempotency_key)', 'SELECT 1');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
