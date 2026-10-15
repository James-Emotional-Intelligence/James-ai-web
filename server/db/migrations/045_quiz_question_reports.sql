-- Student reports and review trail. Original quiz answers remain unchanged.
CREATE TABLE IF NOT EXISTS quiz_question_reports (
  id VARCHAR(36) PRIMARY KEY,
  reporter_user_id VARCHAR(36) NOT NULL,
  question_id VARCHAR(36) NOT NULL,
  quiz_id VARCHAR(36) NOT NULL,
  attempt_id VARCHAR(36) NULL,
  reason VARCHAR(30) NOT NULL,
  description_sanitized VARCHAR(1000) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  reviewer_id VARCHAR(36) NULL,
  reviewer_note VARCHAR(1000) NULL,
  question_version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  resolved_at DATETIME(3) NULL,
  UNIQUE KEY uq_question_reporter (reporter_user_id, question_id),
  INDEX idx_question_reports_status_created (status, created_at),
  INDEX idx_question_reports_question (question_id, status),
  FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quiz_question_review_audit (
  id VARCHAR(36) PRIMARY KEY,
  report_id VARCHAR(36) NOT NULL,
  reviewer_id VARCHAR(36) NOT NULL,
  old_status VARCHAR(30) NOT NULL,
  new_status VARCHAR(30) NOT NULL,
  note VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_review_audit_report (report_id, created_at),
  FOREIGN KEY (report_id) REFERENCES quiz_question_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
