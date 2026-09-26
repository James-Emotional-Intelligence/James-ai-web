-- JAMI AI Database Schema Migration 031: AI Credit Wallet, Ledger & Registration Codes Subsystem
-- Forward-only, production-grade schema migration for usage-based metering and code redemptions

-- 1. AI Wallets (milli-VND storage: 1 VND = 1,000 milli-VND, 25,000 VND = 25,000,000 milli-VND)
CREATE TABLE IF NOT EXISTS ai_wallets (
  user_id VARCHAR(36) PRIMARY KEY,
  balance_milli_vnd BIGINT NOT NULL DEFAULT 0,
  reserved_milli_vnd BIGINT NOT NULL DEFAULT 0,
  ai_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  unlimited_forever BOOLEAN NOT NULL DEFAULT FALSE,
  unlimited_until DATETIME(3) NULL,
  version BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. AI Wallet Transactions (Immutable Ledger)
CREATE TABLE IF NOT EXISTS ai_wallet_transactions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  actor_user_id VARCHAR(36) NULL,
  type VARCHAR(32) NOT NULL,
  amount_milli_vnd BIGINT NOT NULL,
  balance_after_milli_vnd BIGINT NOT NULL,
  reserved_after_milli_vnd BIGINT NOT NULL DEFAULT 0,
  request_id VARCHAR(100) NULL,
  ai_run_id VARCHAR(36) NULL,
  registration_code_id VARCHAR(36) NULL,
  idempotency_key VARCHAR(150) NOT NULL UNIQUE,
  reason VARCHAR(500) NULL,
  metadata_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_ai_wallet_tx_user_created (user_id, created_at),
  INDEX idx_ai_wallet_tx_actor (actor_user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Registration Codes (HMAC-SHA256 hashed code)
CREATE TABLE IF NOT EXISTS registration_codes (
  id VARCHAR(36) PRIMARY KEY,
  code_hash CHAR(64) NOT NULL UNIQUE,
  code_prefix VARCHAR(12) NOT NULL,
  reward_type VARCHAR(20) NOT NULL,
  credit_milli_vnd BIGINT NULL,
  unlimited_forever BOOLEAN NOT NULL DEFAULT FALSE,
  unlimited_until DATETIME(3) NULL,
  max_redemptions INT NOT NULL DEFAULT 1,
  redemption_count INT NOT NULL DEFAULT 0,
  per_user_limit INT NOT NULL DEFAULT 1,
  starts_at DATETIME(3) NULL,
  expires_at DATETIME(3) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by_admin_id VARCHAR(36) NULL,
  note VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  revoked_at DATETIME(3) NULL,
  INDEX idx_reg_codes_status (status),
  INDEX idx_reg_codes_hash (code_hash),
  FOREIGN KEY (created_by_admin_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Registration Code Redemptions (Audit trail)
CREATE TABLE IF NOT EXISTS registration_code_redemptions (
  id VARCHAR(36) PRIMARY KEY,
  code_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  reward_type VARCHAR(20) NOT NULL,
  credit_milli_vnd BIGINT NULL,
  redeemed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_code_user_redemption (code_id, user_id),
  INDEX idx_reg_redemptions_user (user_id),
  FOREIGN KEY (code_id) REFERENCES registration_codes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Backfill Wallets and Initial Grants for Existing Users (25.000 VND = 25.000.000 milli-VND)
INSERT INTO ai_wallets (user_id, balance_milli_vnd, reserved_milli_vnd, ai_enabled, unlimited_forever, version, created_at, updated_at)
SELECT u.id, 25000000, 0, TRUE, FALSE, 0, NOW(3), NOW(3)
FROM users u
LEFT JOIN ai_wallets w ON u.id = w.user_id
WHERE w.user_id IS NULL;

INSERT INTO ai_wallet_transactions (id, user_id, actor_user_id, type, amount_milli_vnd, balance_after_milli_vnd, reserved_after_milli_vnd, idempotency_key, reason, created_at)
SELECT CONCAT('tx_init_', u.id), u.id, NULL, 'initial_grant', 25000000, 25000000, 0, CONCAT('init_grant_', u.id), 'Cấp ngân sách AI ban đầu (25.000đ)', NOW(3)
FROM users u
LEFT JOIN ai_wallet_transactions tx ON tx.idempotency_key = CONCAT('init_grant_', u.id)
WHERE tx.id IS NULL;
