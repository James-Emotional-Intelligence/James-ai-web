-- Idempotent V6 verification. Do not edit earlier migrations which may already be applied.

-- Tasks may be created before a subject is assigned.
ALTER TABLE study_tasks MODIFY COLUMN subject_id VARCHAR(64) NULL;

-- Ensure replayable turn fields exist (prepared SQL keeps compatibility with
-- MySQL variants that do not support ADD COLUMN IF NOT EXISTS).
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_turns' AND column_name = 'reply_message_id') = 0, 'ALTER TABLE jami_turns ADD COLUMN reply_message_id VARCHAR(64) NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_turns' AND column_name = 'response_json') = 0, 'ALTER TABLE jami_turns ADD COLUMN response_json JSON NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_turns' AND column_name = 'user_message_id') = 0, 'ALTER TABLE jami_turns ADD COLUMN user_message_id VARCHAR(64) NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_turns' AND column_name = 'error_code') = 0, 'ALTER TABLE jami_turns ADD COLUMN error_code VARCHAR(64) NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_turns' AND column_name = 'error_message') = 0, 'ALTER TABLE jami_turns ADD COLUMN error_message TEXT NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Backfill the canonical turn reply column without dropping compatibility data.
SET @has_legacy_reply := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_turns' AND column_name = 'assistant_message_id');
SET @copy_legacy_reply := IF(@has_legacy_reply > 0, 'UPDATE jami_turns SET reply_message_id = COALESCE(reply_message_id, assistant_message_id)', 'SELECT 1');
PREPARE stmt_copy_legacy_reply FROM @copy_legacy_reply;
EXECUTE stmt_copy_legacy_reply;
DEALLOCATE PREPARE stmt_copy_legacy_reply;

-- Refuse to add unique keys when legacy duplicates exist: an operator must reconcile data explicitly.
SET @duplicate_messages := (SELECT COUNT(*) FROM (SELECT user_id, client_message_id FROM jami_messages WHERE client_message_id IS NOT NULL GROUP BY user_id, client_message_id HAVING COUNT(*) > 1) duplicate_rows);
SET @message_unique_columns := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE table_schema = DATABASE() AND table_name = 'jami_messages' AND non_unique = 0 GROUP BY index_name HAVING SUM(column_name = 'user_id') = 1 AND SUM(column_name = 'client_message_id') = 1 LIMIT 1);
SET @add_message_unique := IF(@duplicate_messages = 0 AND COALESCE(@message_unique_columns, 0) = 0, 'CREATE UNIQUE INDEX uq_jami_message_user_client_v6 ON jami_messages (user_id, client_message_id)', 'SELECT 1');
PREPARE stmt_message_unique FROM @add_message_unique;
EXECUTE stmt_message_unique;
DEALLOCATE PREPARE stmt_message_unique;

SET @turn_unique_columns := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE table_schema = DATABASE() AND table_name = 'jami_turns' AND non_unique = 0 GROUP BY index_name HAVING SUM(column_name = 'user_id') = 1 AND SUM(column_name = 'client_message_id') = 1 LIMIT 1);
SET @add_turn_unique := IF(COALESCE(@turn_unique_columns, 0) = 0, 'CREATE UNIQUE INDEX uq_jami_turn_user_client_v6 ON jami_turns (user_id, client_message_id)', 'SELECT 1');
PREPARE stmt_turn_unique FROM @add_turn_unique;
EXECUTE stmt_turn_unique;
DEALLOCATE PREPARE stmt_turn_unique;

-- Proposal execution fields used by the canonical confirmation runtime.
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_action_proposals' AND column_name = 'execution_key') = 0, 'ALTER TABLE jami_action_proposals ADD COLUMN execution_key VARCHAR(191) NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_action_proposals' AND column_name = 'result_resource_id') = 0, 'ALTER TABLE jami_action_proposals ADD COLUMN result_resource_id VARCHAR(64) NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_action_proposals' AND column_name = 'processing_at') = 0, 'ALTER TABLE jami_action_proposals ADD COLUMN processing_at DATETIME(3) NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_action_proposals' AND column_name = 'error_code') = 0, 'ALTER TABLE jami_action_proposals ADD COLUMN error_code VARCHAR(64) NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'jami_action_proposals' AND column_name = 'error_message') = 0, 'ALTER TABLE jami_action_proposals ADD COLUMN error_message TEXT NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
