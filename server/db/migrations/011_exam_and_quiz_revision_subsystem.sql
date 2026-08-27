-- JAMI AI Database Schema Migration 011: Exam Milestones & Quiz Revision Enhancement
-- Idempotent schema reconciliation for Exam Milestones D-14/D-7/D-3/D-1, Quiz Generation, and Short-Answer Rubric Grading

CREATE TABLE IF NOT EXISTS exam_milestones (
  id VARCHAR(36) PRIMARY KEY,
  exam_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  milestone_type VARCHAR(20) NOT NULL, -- 'D-14', 'D-7', 'D-3', 'D-1'
  title VARCHAR(150) NOT NULL,
  target_date DATETIME(3) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'current', 'completed', 'overdue'
  related_quiz_id VARCHAR(36) NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_exam_milestones_exam (exam_id, milestone_type),
  INDEX idx_exam_milestones_user (user_id, status),
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add performance indexes for Exam and Quiz tracking
ALTER TABLE exams ADD INDEX idx_exams_user_status_at (user_id, status, exam_at);
ALTER TABLE quizzes ADD INDEX idx_quizzes_exam_milestone (exam_id, milestone);
ALTER TABLE quiz_attempts ADD INDEX idx_quiz_attempts_user_quiz (user_id, quiz_id, status);
