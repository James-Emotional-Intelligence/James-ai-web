-- JAMI AI Database Schema Migration 030: Reconcile homework_image_material_id column length
-- Ensures homework_image_material_id matches learning_materials(id) VARCHAR(36) exactly.

ALTER TABLE class_session_checkins
  MODIFY COLUMN homework_image_material_id VARCHAR(36) NULL;
