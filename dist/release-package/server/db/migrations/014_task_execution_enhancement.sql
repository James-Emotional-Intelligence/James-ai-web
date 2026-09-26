-- JAMI AI Database Schema Migration 014: Task Execution Guides, Itemized Checklist & Evidence Enhancement
-- Forward-only migration to ensure relational consistency for task execution and reflection

-- 1. Create execution_checklist_items for persistent checklist item management
CREATE TABLE IF NOT EXISTS execution_checklist_items (
  id VARCHAR(36) PRIMARY KEY,
  task_id VARCHAR(36) NOT NULL,
  guide_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  item_order INT DEFAULT 1,
  text TEXT NOT NULL,
  is_checked TINYINT(1) DEFAULT 0,
  checked_at DATETIME(3) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_chk_task_user (task_id, user_id),
  INDEX idx_chk_guide (guide_id),
  FOREIGN KEY (task_id) REFERENCES study_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Performance indexes on study_tasks and execution_steps
ALTER TABLE study_tasks ADD INDEX idx_tasks_user_status (user_id, status);
ALTER TABLE execution_steps ADD INDEX idx_steps_guide_order (guide_id, step_order);
ALTER TABLE task_evidence ADD INDEX idx_evidence_task_user (task_id, user_id);
