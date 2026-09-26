-- Migration 039: Jami idempotency and AI runs legacy token backfill
-- Idempotent reconciliation for retry-safe chat turns and legacy token columns.

SET @has_jami_messages := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE table_schema = DATABASE()
    AND table_name = 'jami_messages'
);

SET @has_client_message_id := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'jami_messages'
    AND column_name = 'client_message_id'
);

SET @has_unique_client_msg := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'jami_messages'
    AND index_name = 'uniq_jami_messages_user_client_msg'
);

SET @duplicate_client_msg_count := 0;
SET @sql_count_duplicate_client_msg := IF(
  @has_jami_messages > 0 AND @has_client_message_id > 0,
  'SELECT COUNT(*) INTO @duplicate_client_msg_count FROM (SELECT user_id, client_message_id FROM jami_messages WHERE client_message_id IS NOT NULL GROUP BY user_id, client_message_id HAVING COUNT(*) > 1) dupes',
  'SELECT 0 INTO @duplicate_client_msg_count'
);
PREPARE stmt_count_duplicate_client_msg FROM @sql_count_duplicate_client_msg;
EXECUTE stmt_count_duplicate_client_msg;
DEALLOCATE PREPARE stmt_count_duplicate_client_msg;

SET @sql_unique_client_msg := IF(
  @has_jami_messages > 0 AND @has_client_message_id > 0 AND @has_unique_client_msg = 0 AND @duplicate_client_msg_count = 0,
  'CREATE UNIQUE INDEX uniq_jami_messages_user_client_msg ON jami_messages (user_id, client_message_id)',
  'SELECT 1'
);
PREPARE stmt_unique_client_msg FROM @sql_unique_client_msg;
EXECUTE stmt_unique_client_msg;
DEALLOCATE PREPARE stmt_unique_client_msg;

SET @has_ai_runs := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_runs'
);

SET @has_prompt_tokens := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_runs'
    AND column_name = 'prompt_tokens'
);

SET @sql_prompt_bigint := IF(
  @has_ai_runs > 0 AND @has_prompt_tokens > 0,
  'ALTER TABLE ai_runs MODIFY COLUMN prompt_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt_prompt_bigint FROM @sql_prompt_bigint;
EXECUTE stmt_prompt_bigint;
DEALLOCATE PREPARE stmt_prompt_bigint;

SET @has_completion_tokens := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_runs'
    AND column_name = 'completion_tokens'
);

SET @sql_completion_bigint := IF(
  @has_ai_runs > 0 AND @has_completion_tokens > 0,
  'ALTER TABLE ai_runs MODIFY COLUMN completion_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt_completion_bigint FROM @sql_completion_bigint;
EXECUTE stmt_completion_bigint;
DEALLOCATE PREPARE stmt_completion_bigint;

SET @has_input_tokens := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_runs'
    AND column_name = 'input_tokens'
);

SET @sql_backfill_prompt := IF(
  @has_ai_runs > 0 AND @has_prompt_tokens > 0 AND @has_input_tokens > 0,
  'UPDATE ai_runs SET prompt_tokens = COALESCE(input_tokens, 0) WHERE prompt_tokens IS NULL OR prompt_tokens = 0',
  'SELECT 1'
);
PREPARE stmt_backfill_prompt FROM @sql_backfill_prompt;
EXECUTE stmt_backfill_prompt;
DEALLOCATE PREPARE stmt_backfill_prompt;

SET @has_output_tokens := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'ai_runs'
    AND column_name = 'output_tokens'
);

SET @sql_backfill_completion := IF(
  @has_ai_runs > 0 AND @has_completion_tokens > 0 AND @has_output_tokens > 0,
  'UPDATE ai_runs SET completion_tokens = COALESCE(output_tokens, 0) WHERE completion_tokens IS NULL OR completion_tokens = 0',
  'SELECT 1'
);
PREPARE stmt_backfill_completion FROM @sql_backfill_completion;
EXECUTE stmt_backfill_completion;
DEALLOCATE PREPARE stmt_backfill_completion;

CREATE TABLE IF NOT EXISTS jami_realtime_tool_calls (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  call_id VARCHAR(128) NOT NULL,
  tool_name VARCHAR(128) NOT NULL,
  arguments_hash CHAR(64) NOT NULL,
  status ENUM('processing','completed','failed') NOT NULL DEFAULT 'processing',
  result_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_jami_realtime_tool_call (user_id, session_id, call_id),
  KEY idx_jami_realtime_tool_session (session_id),
  KEY idx_jami_realtime_tool_user_created (user_id, created_at)
);
