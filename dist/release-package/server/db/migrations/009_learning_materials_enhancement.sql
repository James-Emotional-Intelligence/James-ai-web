-- JAMI AI Database Schema Migration 009: Learning Materials & R2 Storage Subsystem Enhancement
-- Idempotent schema reconciliation for learning materials, structured summaries, and R2 metadata

-- 1. Ensure learning_materials table has all storage and processing columns
CREATE TABLE IF NOT EXISTS learning_materials (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  subject_id VARCHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'pdf', 'image', 'notes'
  r2_object_key VARCHAR(255) NULL,
  file_name VARCHAR(255) NULL,
  mime_type VARCHAR(100) NULL,
  size_bytes BIGINT DEFAULT 0,
  sha256 VARCHAR(64) NULL,
  summary TEXT NULL,
  summary_json JSON NULL,
  content_text LONGTEXT NULL,
  processing_status VARCHAR(30) DEFAULT 'ready', -- 'uploading', 'queued', 'processing', 'ready', 'error'
  error_message TEXT NULL,
  attempt_count INT DEFAULT 0,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE learning_materials ADD COLUMN file_name VARCHAR(255) NULL;
ALTER TABLE learning_materials ADD COLUMN summary_json JSON NULL;
ALTER TABLE learning_materials ADD COLUMN content_text LONGTEXT NULL;
ALTER TABLE learning_materials ADD COLUMN error_message TEXT NULL;
ALTER TABLE learning_materials ADD COLUMN attempt_count INT DEFAULT 0;
ALTER TABLE learning_materials ADD COLUMN updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
ALTER TABLE learning_materials ADD INDEX idx_mat_user_status_created (user_id, processing_status, created_at);
ALTER TABLE learning_materials ADD INDEX idx_mat_user_subject (user_id, subject_id);
