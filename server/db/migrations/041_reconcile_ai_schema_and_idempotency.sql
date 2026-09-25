-- Migration 041: Reconcile AI Schema, jami_turns column names, and idempotency guarantees
-- Ensures reply_message_id canonical column name in jami_turns and guarantees idempotent runtime persistence.

-- 1. Reconcile jami_turns columns
SET @has_jami_turns := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE table_schema = DATABASE() AND table_name = 'jami_turns'
);

-- Rename legacy assistant_message_id to reply_message_id if exists
SET @exist_turn_asst_msg := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'jami_turns' AND column_name = 'assistant_message_id'
);
SET @exist_turn_reply_msg := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'jami_turns' AND column_name = 'reply_message_id'
);

SET @sql_turn_rename_msg := IF(
  @has_jami_turns > 0 AND @exist_turn_asst_msg > 0 AND @exist_turn_reply_msg = 0,
  'ALTER TABLE jami_turns CHANGE COLUMN assistant_message_id reply_message_id VARCHAR(64) NULL',
  'SELECT 1'
);
PREPARE stmt_turn_rename FROM @sql_turn_rename_msg;
EXECUTE stmt_turn_rename;
DEALLOCATE PREPARE stmt_turn_rename;

-- Add reply_message_id if neither existed
SET @exist_turn_reply_msg_after := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'jami_turns' AND column_name = 'reply_message_id'
);
SET @sql_turn_add_reply := IF(
  @has_jami_turns > 0 AND @exist_turn_reply_msg_after = 0,
  'ALTER TABLE jami_turns ADD COLUMN reply_message_id VARCHAR(64) NULL AFTER user_message_id',
  'SELECT 1'
);
PREPARE stmt_turn_add_r FROM @sql_turn_add_reply;
EXECUTE stmt_turn_add_r;
DEALLOCATE PREPARE stmt_turn_add_r;

-- Ensure conversation_id allows NULL in jami_turns for legacy/direct turns
SET @sql_turn_conv_null := IF(
  @has_jami_turns > 0,
  'ALTER TABLE jami_turns MODIFY COLUMN conversation_id VARCHAR(64) NULL',
  'SELECT 1'
);
PREPARE stmt_turn_c_null FROM @sql_turn_conv_null;
EXECUTE stmt_turn_c_null;
DEALLOCATE PREPARE stmt_turn_c_null;

-- 2. Verify jami_messages uq_jami_message_user_client
SET @has_jami_messages := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE table_schema = DATABASE() AND table_name = 'jami_messages'
);
SET @exist_msg_uniq := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'jami_messages' AND index_name = 'uq_jami_message_user_client'
);
SET @sql_msg_uniq := IF(
  @has_jami_messages > 0 AND @exist_msg_uniq = 0,
  'CREATE UNIQUE INDEX uq_jami_message_user_client ON jami_messages (user_id, client_message_id)',
  'SELECT 1'
);
PREPARE stmt_msg_u FROM @sql_msg_uniq;
EXECUTE stmt_msg_u;
DEALLOCATE PREPARE stmt_msg_u;
