-- JAMI AI Database Schema Migration 022: Tomorrow Preparation Plans & Items
-- Idempotent schema for evening automated short study plan preparation ("Jami chuẩn bị ngày mai")

CREATE TABLE IF NOT EXISTS tomorrow_preparation_plans (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  plan_date VARCHAR(10) NOT NULL, -- 'YYYY-MM-DD' (Tối hôm nay)
  target_date VARCHAR(10) NOT NULL, -- 'YYYY-MM-DD' (Ngày mai)
  available_start VARCHAR(5) NOT NULL DEFAULT '19:00', -- 'HH:MM'
  available_end VARCHAR(5) NOT NULL DEFAULT '22:00', -- 'HH:MM'
  energy_level VARCHAR(32) NOT NULL DEFAULT 'normal', -- 'high', 'normal', 'low', 'due_only', 'skip'
  total_minutes INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'draft', -- 'draft', 'accepted', 'in_progress', 'completed', 'dismissed', 'expired'
  generated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  accepted_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_user_plan_date (user_id, plan_date),
  INDEX idx_plans_user_status (user_id, status),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tomorrow_preparation_items (
  id VARCHAR(64) PRIMARY KEY,
  plan_id VARCHAR(64) NOT NULL,
  subject_id VARCHAR(64) NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  reason TEXT NULL,
  source_type VARCHAR(64) NOT NULL, -- 'due_task', 'exam_review', 'class_checkin_reflection', 'class_checkin_homework', 'tomorrow_subject_preview', 'pack_bag', 'general_review'
  source_id VARCHAR(64) NULL,
  priority VARCHAR(32) NOT NULL DEFAULT 'medium', -- 'high', 'medium', 'low'
  planned_minutes INT NOT NULL DEFAULT 15,
  start_at VARCHAR(10) NOT NULL, -- 'HH:MM'
  end_at VARCHAR(10) NOT NULL, -- 'HH:MM'
  status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'skipped'
  sort_order INT NOT NULL DEFAULT 0,
  task_id VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_items_plan (plan_id),
  INDEX idx_items_task (task_id),
  FOREIGN KEY (plan_id) REFERENCES tomorrow_preparation_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
