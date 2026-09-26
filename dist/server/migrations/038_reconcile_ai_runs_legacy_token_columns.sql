-- Migration 038: Reconcile AI Runs Legacy Token Columns and Indices
-- Ensures complete idempotency and column parity across all AI execution tracking tables.

-- 1. Ensure prompt_tokens exists in ai_runs
SET @exist_prompt_tokens := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_runs'
    AND column_name = 'prompt_tokens'
);
SET @sql_prompt_tokens := IF(
  @exist_prompt_tokens = 0,
  'ALTER TABLE ai_runs ADD COLUMN prompt_tokens INT DEFAULT 0 AFTER latency_ms',
  'SELECT 1'
);
PREPARE stmt_prompt FROM @sql_prompt_tokens;
EXECUTE stmt_prompt;
DEALLOCATE PREPARE stmt_prompt;

-- 2. Ensure completion_tokens exists in ai_runs
SET @exist_completion_tokens := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_runs'
    AND column_name = 'completion_tokens'
);
SET @sql_completion_tokens := IF(
  @exist_completion_tokens = 0,
  'ALTER TABLE ai_runs ADD COLUMN completion_tokens INT DEFAULT 0 AFTER prompt_tokens',
  'SELECT 1'
);
PREPARE stmt_completion FROM @sql_completion_tokens;
EXECUTE stmt_completion;
DEALLOCATE PREPARE stmt_completion;

-- 3. Ensure cached_input_tokens exists in ai_runs
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

-- 4. Ensure cost_milli_vnd exists in ai_runs
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

-- 5. Ensure pricing_version exists in ai_runs
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

-- 6. Ensure indices on ai_runs
SET @exist_runs_user_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_runs'
    AND index_name = 'idx_ai_runs_user_created'
);
SET @sql_runs_user_idx := IF(
  @exist_runs_user_idx = 0,
  'CREATE INDEX idx_ai_runs_user_created ON ai_runs (user_id, created_at)',
  'SELECT 1'
);
PREPARE stmt_idx_user FROM @sql_runs_user_idx;
EXECUTE stmt_idx_user;
DEALLOCATE PREPARE stmt_idx_user;

-- 7. Backfill legacy null values safely
UPDATE ai_runs SET prompt_tokens = 0 WHERE prompt_tokens IS NULL;
UPDATE ai_runs SET completion_tokens = 0 WHERE completion_tokens IS NULL;
UPDATE ai_runs SET cached_input_tokens = 0 WHERE cached_input_tokens IS NULL;
UPDATE ai_runs SET pricing_version = 'legacy-unpriced' WHERE pricing_version IS NULL OR pricing_version = '';
