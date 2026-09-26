-- JAMI AI Database Schema Migration 019: Outlines & Material Processing Subsystem
-- Idempotent schema reconciliation for Outlines, Outline Versions, Material Chunks, and Processing Jobs

CREATE TABLE IF NOT EXISTS outlines (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  subject_id VARCHAR(36) NOT NULL,
  material_id VARCHAR(36) NULL,
  title VARCHAR(255) NOT NULL,
  chapter VARCHAR(150) NULL,
  content_markdown LONGTEXT NOT NULL,
  key_points_json JSON NULL,
  formulas_json JSON NULL,
  is_pinned TINYINT(1) DEFAULT 0,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_outlines_user_subject (user_id, subject_id),
  INDEX idx_outlines_material (material_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS outline_versions (
  id VARCHAR(36) PRIMARY KEY,
  outline_id VARCHAR(36) NOT NULL,
  version_number INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content_markdown LONGTEXT NOT NULL,
  changelog VARCHAR(255) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_outline_versions_outline (outline_id, version_number),
  FOREIGN KEY (outline_id) REFERENCES outlines(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS material_chunks (
  id VARCHAR(36) PRIMARY KEY,
  material_id VARCHAR(36) NOT NULL,
  chunk_order INT NOT NULL,
  chunk_text LONGTEXT NOT NULL,
  page_number INT NULL,
  token_count INT DEFAULT 0,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_chunks_material (material_id, chunk_order),
  FOREIGN KEY (material_id) REFERENCES learning_materials(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS material_processing_jobs (
  id VARCHAR(36) PRIMARY KEY,
  material_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  status VARCHAR(30) DEFAULT 'queued', -- 'queued', 'processing', 'completed', 'failed'
  progress_percent INT DEFAULT 0,
  error_message TEXT NULL,
  started_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_jobs_material (material_id),
  INDEX idx_jobs_user_status (user_id, status),
  FOREIGN KEY (material_id) REFERENCES learning_materials(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
