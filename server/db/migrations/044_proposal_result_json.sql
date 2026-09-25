-- Persist canonical proposal execution output for crash-safe replay.
SET @has_result_json := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'jami_action_proposals'
    AND column_name = 'result_json'
);
SET @sql_result_json := IF(
  @has_result_json = 0,
  'ALTER TABLE jami_action_proposals ADD COLUMN result_json JSON NULL AFTER result_resource_id',
  'SELECT 1'
);
PREPARE stmt_result_json FROM @sql_result_json;
EXECUTE stmt_result_json;
DEALLOCATE PREPARE stmt_result_json;
