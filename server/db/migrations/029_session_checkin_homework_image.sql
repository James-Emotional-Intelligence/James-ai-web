-- JAMI AI Database Schema Migration 029: Class Session Check-in Homework Image Support
-- Adds homework_image_material_id to link homework photos with learning_materials

ALTER TABLE class_session_checkins
  ADD COLUMN homework_image_material_id VARCHAR(64) NULL AFTER homework;

ALTER TABLE class_session_checkins
  ADD CONSTRAINT fk_checkins_hw_material FOREIGN KEY (homework_image_material_id) REFERENCES learning_materials(id) ON DELETE SET NULL;

ALTER TABLE class_session_checkins
  ADD INDEX idx_checkins_hw_material (homework_image_material_id);
