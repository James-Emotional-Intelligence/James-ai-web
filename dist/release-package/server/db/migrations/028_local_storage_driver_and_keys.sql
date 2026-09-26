-- JAMI AI Database Schema Migration 028: Local Storage Driver & Canonical Storage Keys
-- Supports Pluggable StorageAdapters (local disk vs Cloudflare R2), relative storage keys, and safe extensions

-- 1. Add storage_driver and storage_key columns to learning_materials
ALTER TABLE learning_materials ADD COLUMN storage_driver VARCHAR(16) NOT NULL DEFAULT 'local';
ALTER TABLE learning_materials ADD COLUMN storage_key VARCHAR(512) NULL;
ALTER TABLE learning_materials ADD COLUMN extension VARCHAR(32) NULL;
ALTER TABLE learning_materials ADD COLUMN processing_error_code VARCHAR(64) NULL;
ALTER TABLE learning_materials ADD INDEX idx_mat_storage_driver (storage_driver);

-- 2. Backfill existing R2 records so they continue to read via R2StorageAdapter
UPDATE learning_materials
SET storage_driver = 'r2',
    storage_key = r2_object_key
WHERE r2_object_key IS NOT NULL AND (storage_key IS NULL OR storage_key = '');
