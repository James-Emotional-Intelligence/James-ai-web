-- JAMI AI Database Schema Migration 030_zz: Restore Homework Material FK After Resize
-- Verifies no orphan records, restores foreign key fk_checkins_hw_material with ON DELETE SET NULL, and ensures index

-- 1. Check for orphan records and halt if invalid foreign references exist
SET @orphan_cnt_030zz := (
  SELECT COUNT(*)
  FROM class_session_checkins c
  LEFT JOIN learning_materials lm ON c.homework_image_material_id = lm.id
  WHERE c.homework_image_material_id IS NOT NULL AND lm.id IS NULL
);

-- Fail with clear signal if orphan records exist (do not silently corrupt or drop data)
SET @sql_orphan_check_030zz := IF(
  @orphan_cnt_030zz > 0,
  'SIGNAL SQLSTATE "45000" SET MESSAGE_TEXT = "Cannot restore foreign key: orphan homework_image_material_id records found in class_session_checkins"',
  'SELECT 1'
);

PREPARE stmt_orphan_030zz FROM @sql_orphan_check_030zz;
EXECUTE stmt_orphan_030zz;
DEALLOCATE PREPARE stmt_orphan_030zz;

-- 2. Ensure index idx_checkins_hw_material exists
SET @exist_idx_030zz := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'class_session_checkins'
    AND INDEX_NAME = 'idx_checkins_hw_material'
);

SET @sql_idx_030zz := IF(
  @exist_idx_030zz = 0,
  'ALTER TABLE class_session_checkins ADD INDEX idx_checkins_hw_material (homework_image_material_id)',
  'SELECT 1'
);

PREPARE stmt_idx_030zz FROM @sql_idx_030zz;
EXECUTE stmt_idx_030zz;
DEALLOCATE PREPARE stmt_idx_030zz;

-- 3. Restore foreign key fk_checkins_hw_material pointing to learning_materials(id) ON DELETE SET NULL
SET @exist_fk_030zz := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'class_session_checkins'
    AND CONSTRAINT_NAME = 'fk_checkins_hw_material'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @sql_fk_030zz := IF(
  @exist_fk_030zz = 0,
  'ALTER TABLE class_session_checkins ADD CONSTRAINT fk_checkins_hw_material FOREIGN KEY (homework_image_material_id) REFERENCES learning_materials(id) ON DELETE SET NULL',
  'SELECT 1'
);

PREPARE stmt_fk_030zz FROM @sql_fk_030zz;
EXECUTE stmt_fk_030zz;
DEALLOCATE PREPARE stmt_fk_030zz;
