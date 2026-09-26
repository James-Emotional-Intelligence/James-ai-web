-- JAMI AI Database Schema Migration 029_zz: Prepare Homework Material FK Resize
-- Safely drops foreign key fk_checkins_hw_material if present before column resize in migration 030

SET @exist_fk_029zz := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'class_session_checkins'
    AND CONSTRAINT_NAME = 'fk_checkins_hw_material'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @sql_029zz := IF(
  @exist_fk_029zz > 0,
  'ALTER TABLE class_session_checkins DROP FOREIGN KEY fk_checkins_hw_material',
  'SELECT 1'
);

PREPARE stmt_029zz FROM @sql_029zz;
EXECUTE stmt_029zz;
DEALLOCATE PREPARE stmt_029zz;
