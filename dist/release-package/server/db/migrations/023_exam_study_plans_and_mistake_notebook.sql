-- JAMI AI Database Schema Migration 023: Exam Study Plans, Versions & Mistake Notebook
-- Subsystem for automated multi-day exam study planning, missed session rescheduling, and personal spaced repetition mistake notebook

CREATE TABLE IF NOT EXISTS exam_study_plans (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  exam_id VARCHAR(64) NOT NULL,
  start_date VARCHAR(10) NOT NULL, -- 'YYYY-MM-DD'
  target_date VARCHAR(10) NOT NULL, -- 'YYYY-MM-DD'
  daily_minutes INT NOT NULL DEFAULT 45,
  status VARCHAR(32) NOT NULL DEFAULT 'draft', -- 'draft', 'accepted', 'in_progress', 'completed', 'dismissed', 'expired'
  current_version INT NOT NULL DEFAULT 1,
  generated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  accepted_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_study_plans_user (user_id),
  INDEX idx_study_plans_exam (exam_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exam_study_plan_items (
  id VARCHAR(64) PRIMARY KEY,
  plan_id VARCHAR(64) NOT NULL,
  subject_id VARCHAR(64) NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  activity_type VARCHAR(64) NOT NULL DEFAULT 'theory_review', -- 'theory_review', 'basic_practice', 'medium_practice', 'advanced_practice', 'mistake_review', 'mock_test', 'light_revision'
  source_type VARCHAR(64) NOT NULL DEFAULT 'exam_scope', -- 'exam_scope', 'mistake_notebook', 'weak_topic', 'mock_test'
  source_id VARCHAR(64) NULL,
  priority VARCHAR(32) NOT NULL DEFAULT 'medium', -- 'high', 'medium', 'low'
  planned_date VARCHAR(10) NOT NULL, -- 'YYYY-MM-DD'
  start_at VARCHAR(10) NOT NULL, -- 'HH:MM'
  end_at VARCHAR(10) NOT NULL, -- 'HH:MM'
  planned_minutes INT NOT NULL DEFAULT 30,
  status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'missed', 'skipped'
  completed_at DATETIME(3) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  task_id VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_plan_items_plan (plan_id),
  INDEX idx_plan_items_date (planned_date),
  INDEX idx_plan_items_status (status),
  FOREIGN KEY (plan_id) REFERENCES exam_study_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS exam_study_plan_versions (
  id VARCHAR(64) PRIMARY KEY,
  plan_id VARCHAR(64) NOT NULL,
  version_number INT NOT NULL,
  snapshot_json LONGTEXT NOT NULL,
  reason VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_plan_versions_plan (plan_id, version_number),
  FOREIGN KEY (plan_id) REFERENCES exam_study_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mistake_notebook_entries (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  subject_id VARCHAR(64) NULL,
  topic VARCHAR(150) NOT NULL,
  question_text TEXT NOT NULL,
  question_data_json LONGTEXT NULL, -- Options, hints, attachments
  selected_answer TEXT NULL,
  correct_answer TEXT NOT NULL,
  mistake_reason VARCHAR(64) NOT NULL DEFAULT 'other', -- 'knowledge_gap', 'misread_question', 'calculation_error', 'wrong_choice', 'time_pressure', 'not_learned_yet', 'other'
  correct_explanation TEXT NULL,
  difficulty VARCHAR(32) NOT NULL DEFAULT 'medium', -- 'easy', 'medium', 'hard'
  source_type VARCHAR(64) NOT NULL DEFAULT 'manual', -- 'quiz', 'exam_mock', 'manual', 'class_exercise'
  source_id VARCHAR(64) NULL,
  first_mistake_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_reviewed_at DATETIME(3) NULL,
  next_review_at DATETIME(3) NOT NULL,
  review_count INT NOT NULL DEFAULT 0,
  correct_streak INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'new', -- 'new', 'reviewing', 'needs_retry', 'mastered'
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_mistakes_user_status (user_id, status),
  INDEX idx_mistakes_next_review (user_id, next_review_at),
  INDEX idx_mistakes_subject_topic (user_id, subject_id, topic),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mistake_review_attempts (
  id VARCHAR(64) PRIMARY KEY,
  mistake_entry_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  reviewed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  next_review_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_attempts_mistake (mistake_entry_id),
  INDEX idx_attempts_user (user_id),
  FOREIGN KEY (mistake_entry_id) REFERENCES mistake_notebook_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
