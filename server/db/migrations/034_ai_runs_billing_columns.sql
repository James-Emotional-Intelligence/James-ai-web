-- Migration 034: AI Runs Billing & Token Cost Tracking Columns
-- Reconcile ai_runs schema to support cached_input_tokens, cost_milli_vnd, pricing_version

-- 1. cached_input_tokens
SET @exist_cached_tokens := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_runs'
    AND column_name = 'cached_input_tokens'
);
SET @sql_cached_tokens := IF(
  @exist_cached_tokens = 0,
  'ALTER TABLE ai_runs ADD COLUMN cached_input_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER completion_tokens',
  'SELECT 1'
);
PREPARE stmt_cached FROM @sql_cached_tokens;
EXECUTE stmt_cached;
DEALLOCATE PREPARE stmt_cached;

-- 2. cost_milli_vnd
SET @exist_cost_milli := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_runs'
    AND column_name = 'cost_milli_vnd'
);
SET @sql_cost_milli := IF(
  @exist_cost_milli = 0,
  'ALTER TABLE ai_runs ADD COLUMN cost_milli_vnd BIGINT UNSIGNED NULL AFTER cached_input_tokens',
  'SELECT 1'
);
PREPARE stmt_cost FROM @sql_cost_milli;
EXECUTE stmt_cost;
DEALLOCATE PREPARE stmt_cost;

-- 3. pricing_version
SET @exist_pricing_ver := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_runs'
    AND column_name = 'pricing_version'
);
SET @sql_pricing_ver := IF(
  @exist_pricing_ver = 0,
  'ALTER TABLE ai_runs ADD COLUMN pricing_version VARCHAR(64) NOT NULL DEFAULT ''legacy-unpriced'' AFTER cost_milli_vnd',
  'SELECT 1'
);
PREPARE stmt_pricing FROM @sql_pricing_ver;
EXECUTE stmt_pricing;
DEALLOCATE PREPARE stmt_pricing;

-- 4. Backfill existing legacy records if any
UPDATE ai_runs SET cached_input_tokens = 0 WHERE cached_input_tokens IS NULL;
UPDATE ai_runs SET pricing_version = 'legacy-unpriced' WHERE pricing_version IS NULL OR pricing_version = '';
