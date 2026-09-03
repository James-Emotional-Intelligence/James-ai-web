-- JAMI AI Database Schema Migration 027: Soft Books Subsystem (Sách Mềm)
-- Idempotent schema additions for Soft Books, Chapters, Chunks, Progress, Bookmarks, Highlights, and Job Worker

-- 1. Extend learning_materials for book metadata and rights verification
ALTER TABLE learning_materials ADD COLUMN material_kind VARCHAR(32) NOT NULL DEFAULT 'document';
ALTER TABLE learning_materials ADD COLUMN original_filename VARCHAR(255) NULL;
ALTER TABLE learning_materials ADD COLUMN detected_mime VARCHAR(100) NULL;
ALTER TABLE learning_materials ADD COLUMN publisher VARCHAR(150) NULL;
ALTER TABLE learning_materials ADD COLUMN edition_year INT NULL;
ALTER TABLE learning_materials ADD COLUMN language VARCHAR(10) DEFAULT 'vi';
ALTER TABLE learning_materials ADD COLUMN cover_object_key VARCHAR(500) NULL;
ALTER TABLE learning_materials ADD COLUMN page_count INT DEFAULT 0;
ALTER TABLE learning_materials ADD COLUMN chapter_count INT DEFAULT 0;
ALTER TABLE learning_materials ADD COLUMN processing_progress INT DEFAULT 0;
ALTER TABLE learning_materials ADD COLUMN rights_confirmed_at DATETIME(3) NULL;
ALTER TABLE learning_materials ADD COLUMN rights_terms_version VARCHAR(20) NULL;
ALTER TABLE learning_materials ADD INDEX idx_mat_user_kind (user_id, material_kind, created_at);

-- 2. Book Chapters (Mục lục / Chương sách)
CREATE TABLE IF NOT EXISTS book_chapters (
  id VARCHAR(64) PRIMARY KEY,
  material_id VARCHAR(64) NOT NULL,
  parent_id VARCHAR(64) NULL,
  ordinal INT NOT NULL DEFAULT 1,
  title VARCHAR(255) NOT NULL,
  start_page INT NOT NULL DEFAULT 1,
  end_page INT NOT NULL DEFAULT 1,
  source_anchor VARCHAR(100) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_chapters_material_ord (material_id, ordinal),
  FOREIGN KEY (material_id) REFERENCES learning_materials(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Book Chunks (Đoạn nội dung có trích dẫn trang & chương cho RAG/Search)
CREATE TABLE IF NOT EXISTS book_chunks (
  id VARCHAR(64) PRIMARY KEY,
  material_id VARCHAR(64) NOT NULL,
  chapter_id VARCHAR(64) NULL,
  ordinal INT NOT NULL DEFAULT 1,
  text MEDIUMTEXT NOT NULL,
  page_start INT NOT NULL DEFAULT 1,
  page_end INT NOT NULL DEFAULT 1,
  token_count INT DEFAULT 0,
  content_hash VARCHAR(64) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_book_chunks_mat_ord (material_id, ordinal),
  INDEX idx_book_chunks_chapter (chapter_id),
  FOREIGN KEY (material_id) REFERENCES learning_materials(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Book Reading Progress (Tiến độ đọc sách cá nhân)
CREATE TABLE IF NOT EXISTS book_progress (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  material_id VARCHAR(64) NOT NULL,
  chapter_id VARCHAR(64) NULL,
  page INT NOT NULL DEFAULT 1,
  percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_book_progress_user_mat (user_id, material_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES learning_materials(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Book Bookmarks (Dấu trang)
CREATE TABLE IF NOT EXISTS book_bookmarks (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  material_id VARCHAR(64) NOT NULL,
  chapter_id VARCHAR(64) NULL,
  page INT NOT NULL DEFAULT 1,
  title VARCHAR(255) NOT NULL,
  source_anchor VARCHAR(100) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_bookmarks_user_mat (user_id, material_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES learning_materials(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Book Highlights & Notes (Tô sáng & Ghi chú trang sách)
CREATE TABLE IF NOT EXISTS book_highlights (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  material_id VARCHAR(64) NOT NULL,
  chapter_id VARCHAR(64) NULL,
  page INT NOT NULL DEFAULT 1,
  selected_text TEXT NOT NULL,
  note TEXT NULL,
  color VARCHAR(30) DEFAULT 'yellow',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_highlights_user_mat (user_id, material_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES learning_materials(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Extend material_processing_jobs for durable worker queue leases
ALTER TABLE material_processing_jobs ADD COLUMN job_type VARCHAR(50) NOT NULL DEFAULT 'extract_and_chunk';
ALTER TABLE material_processing_jobs ADD COLUMN attempt INT NOT NULL DEFAULT 0;
ALTER TABLE material_processing_jobs ADD COLUMN max_attempts INT NOT NULL DEFAULT 3;
ALTER TABLE material_processing_jobs ADD COLUMN lease_until DATETIME(3) NULL;
ALTER TABLE material_processing_jobs ADD COLUMN error_code VARCHAR(50) NULL;
