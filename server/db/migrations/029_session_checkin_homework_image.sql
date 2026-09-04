-- JAMI AI Database Schema Migration 029: Class Session Check-in Homework Image Support
-- Adds homework_image_material_id to link homework photos with learning_materials
-- Compatible with fresh databases and partially-run databases with VARCHAR(64) columns

-- 1. Add column as VARCHAR(36) matching learning_materials.id
ALTER TABLE class_session_checkins
  ADD COLUMN homework_image_material_id VARCHAR(36) NULL AFTER homework;

-- 2. Modify column to VARCHAR(36) in case it was previously created as VARCHAR(64)
ALTER TABLE class_session_checkins
  MODIFY COLUMN homework_image_material_id VARCHAR(36) NULL;

-- 3. Add Index before Foreign Key constraint
ALTER TABLE class_session_checkins
  ADD INDEX idx_checkins_hw_material (homework_image_material_id);

-- 4. Add Foreign Key constraint with ON DELETE SET NULL
ALTER TABLE class_session_checkins
  ADD CONSTRAINT fk_checkins_hw_material FOREIGN KEY (homework_image_material_id) REFERENCES learning_materials(id) ON DELETE SET NULL;
