-- Canonical Jami turns must retain replayable results; tasks are allowed without a subject.
ALTER TABLE study_tasks MODIFY COLUMN subject_id VARCHAR(64) NULL;

-- Older installations may not have all turn failure metadata after partial migrations.
-- Use information_schema + prepared SQL for MySQL variants that do not support
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
SET @has_turn_error_code := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'jami_turns' AND column_name = 'error_code'
);
SET @sql_turn_error_code := IF(
  @has_turn_error_code = 0,
  'ALTER TABLE jami_turns ADD COLUMN error_code VARCHAR(64) NULL',
  'SELECT 1'
);
PREPARE stmt_turn_error_code FROM @sql_turn_error_code;
EXECUTE stmt_turn_error_code;
DEALLOCATE PREPARE stmt_turn_error_code;
