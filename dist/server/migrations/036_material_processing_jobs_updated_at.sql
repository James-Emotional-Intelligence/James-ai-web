-- ==============================================================================
-- Migration 036: Add updated_at column to material_processing_jobs
-- Description: Ensures material_processing_jobs has canonical updated_at column
-- ==============================================================================

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'material_processing_jobs'
    AND COLUMN_NAME = 'updated_at'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE material_processing_jobs ADD COLUMN updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) AFTER created_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
