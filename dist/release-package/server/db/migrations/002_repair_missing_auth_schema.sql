-- JAMI AI Database Schema Migration 002: Repair & Reconcile Auth & Core Tables
-- Idempotent schema reconciliation for Aiven MySQL and Cloudflare Hyperdrive

-- 1. users
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  password_salt VARCHAR(64) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  preferred_name VARCHAR(50) NOT NULL,
  locale VARCHAR(10) DEFAULT 'vi-VN',
  timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',
  age_band VARCHAR(20) DEFAULT '14-17',
  status VARCHAR(20) DEFAULT 'active',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. student_profiles
CREATE TABLE IF NOT EXISTS student_profiles (
  user_id VARCHAR(36) PRIMARY KEY,
  grade_level INT NOT NULL DEFAULT 9,
  school_name VARCHAR(255) NULL,
  goals_json JSON NULL,
  preferred_session_minutes INT DEFAULT 45,
  max_daily_study_minutes INT DEFAULT 180,
  energy_preferences_json JSON NULL,
  sleep_schedule_json JSON NULL,
  meal_times_json JSON NULL,
  onboarding_completed_at DATETIME(3) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. auth_sessions
CREATE TABLE IF NOT EXISTS auth_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  user_agent VARCHAR(255) NULL,
  ip_address VARCHAR(50) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_session_token (token_hash),
  INDEX idx_session_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. refresh_sessions
CREATE TABLE IF NOT EXISTS refresh_sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  family_id VARCHAR(36) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_user_family (user_id, family_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. password_reset_tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_reset_token (token_hash),
  INDEX idx_reset_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. consent_records
CREATE TABLE IF NOT EXISTS consent_records (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  consent_type VARCHAR(50) NOT NULL,
  policy_version VARCHAR(20) NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT TRUE,
  granted_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at DATETIME(3) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. subjects
CREATE TABLE IF NOT EXISTS subjects (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(30) NOT NULL DEFAULT '#3B82F6',
  icon VARCHAR(50) DEFAULT 'BookOpen',
  sort_order INT DEFAULT 0,
  archived_at DATETIME(3) NULL,
  INDEX idx_subj_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. school_timetables
CREATE TABLE IF NOT EXISTS school_timetables (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  effective_from DATE NULL,
  effective_to DATE NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_tt_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. school_timetable_entries
CREATE TABLE IF NOT EXISTS school_timetable_entries (
  id VARCHAR(36) PRIMARY KEY,
  timetable_id VARCHAR(36) NOT NULL,
  subject_id VARCHAR(36) NULL,
  title VARCHAR(100) NOT NULL,
  day_of_week INT NOT NULL,
  start_local_time VARCHAR(10) NOT NULL,
  end_local_time VARCHAR(10) NOT NULL,
  room VARCHAR(50) NULL,
  teacher_name VARCHAR(100) NULL,
  period INT NULL,
  notes TEXT NULL,
  INDEX idx_entry_tt (timetable_id),
  FOREIGN KEY (timetable_id) REFERENCES school_timetables(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. busy_events
CREATE TABLE IF NOT EXISTS busy_events (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  category VARCHAR(50) DEFAULT 'extracurricular',
  start_at DATETIME(3) NOT NULL,
  end_at DATETIME(3) NOT NULL,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule VARCHAR(100) NULL,
  INDEX idx_busy_user_time (user_id, start_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. availability_rules
CREATE TABLE IF NOT EXISTS availability_rules (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  day_of_week INT NOT NULL,
  slot_type VARCHAR(30) NOT NULL,
  start_local_time VARCHAR(10) NOT NULL,
  end_local_time VARCHAR(10) NOT NULL,
  priority_weight INT DEFAULT 1,
  INDEX idx_avail_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. exams
CREATE TABLE IF NOT EXISTS exams (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  subject_id VARCHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  exam_at DATETIME(3) NOT NULL,
  importance VARCHAR(20) DEFAULT 'high',
  scope_text TEXT NULL,
  status VARCHAR(20) DEFAULT 'upcoming',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_exam_user_time (user_id, exam_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. exam_topics
CREATE TABLE IF NOT EXISTS exam_topics (
  id VARCHAR(36) PRIMARY KEY,
  exam_id VARCHAR(36) NOT NULL,
  name VARCHAR(200) NOT NULL,
  weight INT DEFAULT 1,
  notes TEXT NULL,
  INDEX idx_extopic_exam (exam_id),
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. study_plans
CREATE TABLE IF NOT EXISTS study_plans (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_plan_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. study_tasks
CREATE TABLE IF NOT EXISTS study_tasks (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  subject_id VARCHAR(36) NULL,
  exam_id VARCHAR(36) NULL,
  plan_id VARCHAR(36) NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  task_type VARCHAR(50) DEFAULT 'exercise',
  priority VARCHAR(20) DEFAULT 'medium',
  difficulty VARCHAR(20) DEFAULT 'medium',
  estimated_minutes INT NOT NULL DEFAULT 45,
  scheduled_date DATE NOT NULL,
  scheduled_start_time VARCHAR(10) NULL,
  scheduled_end_time VARCHAR(10) NULL,
  status VARCHAR(20) DEFAULT 'pending',
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_task_user_date (user_id, scheduled_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE SET NULL,
  FOREIGN KEY (plan_id) REFERENCES study_plans(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. task_dependencies
CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id VARCHAR(36) NOT NULL,
  depends_on_task_id VARCHAR(36) NOT NULL,
  PRIMARY KEY (task_id, depends_on_task_id),
  FOREIGN KEY (task_id) REFERENCES study_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_task_id) REFERENCES study_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. execution_guides
CREATE TABLE IF NOT EXISTS execution_guides (
  id VARCHAR(36) PRIMARY KEY,
  task_id VARCHAR(36) NOT NULL UNIQUE,
  rationale TEXT NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (task_id) REFERENCES study_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. execution_steps
CREATE TABLE IF NOT EXISTS execution_steps (
  id VARCHAR(36) PRIMARY KEY,
  guide_id VARCHAR(36) NOT NULL,
  step_number INT NOT NULL,
  instruction TEXT NOT NULL,
  evidence_required_type VARCHAR(30) NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at DATETIME(3) NULL,
  INDEX idx_step_guide (guide_id),
  FOREIGN KEY (guide_id) REFERENCES execution_guides(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19. focus_sessions
CREATE TABLE IF NOT EXISTS focus_sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36) NULL,
  duration_minutes INT NOT NULL DEFAULT 25,
  actual_minutes INT DEFAULT 0,
  mode VARCHAR(30) DEFAULT 'standard',
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT NULL,
  started_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3) NULL,
  INDEX idx_focus_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES study_tasks(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 20. task_evidence
CREATE TABLE IF NOT EXISTS task_evidence (
  id VARCHAR(36) PRIMARY KEY,
  task_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  step_id VARCHAR(36) NULL,
  evidence_type VARCHAR(30) NOT NULL,
  file_url VARCHAR(500) NULL,
  text_value TEXT NULL,
  score_value DECIMAL(5,2) NULL,
  notes TEXT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_ev_task (task_id),
  FOREIGN KEY (task_id) REFERENCES study_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 21. learning_materials
CREATE TABLE IF NOT EXISTS learning_materials (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  subject_id VARCHAR(36) NULL,
  title VARCHAR(200) NOT NULL,
  material_type VARCHAR(30) NOT NULL,
  file_url VARCHAR(500) NULL,
  content_text MEDIUMTEXT NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_mat_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 22. quizzes
CREATE TABLE IF NOT EXISTS quizzes (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  subject_id VARCHAR(36) NULL,
  title VARCHAR(200) NOT NULL,
  time_limit_minutes INT DEFAULT 15,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_quiz_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 23. quiz_questions
CREATE TABLE IF NOT EXISTS quiz_questions (
  id VARCHAR(36) PRIMARY KEY,
  quiz_id VARCHAR(36) NOT NULL,
  question_text TEXT NOT NULL,
  options_json JSON NOT NULL,
  correct_answer VARCHAR(255) NOT NULL,
  explanation TEXT NULL,
  sort_order INT DEFAULT 0,
  INDEX idx_q_quiz (quiz_id),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 24. quiz_attempts
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id VARCHAR(36) PRIMARY KEY,
  quiz_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  score DECIMAL(5,2) NOT NULL,
  max_score DECIMAL(5,2) NOT NULL,
  feedback_summary TEXT NULL,
  submitted_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_att_user (user_id),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 25. notifications
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  action_url VARCHAR(255) NULL,
  delivered_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  read_at DATETIME(3) NULL,
  status VARCHAR(20) DEFAULT 'unread',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_notif_user_status (user_id, status),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 26. jami_preferences
CREATE TABLE IF NOT EXISTS jami_preferences (
  user_id VARCHAR(36) PRIMARY KEY,
  tone VARCHAR(30) DEFAULT 'encouraging',
  voice_gender VARCHAR(20) DEFAULT 'female',
  reminder_frequency VARCHAR(30) DEFAULT 'medium',
  enable_voice BOOLEAN DEFAULT TRUE,
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 27. jami_memory_summaries
CREATE TABLE IF NOT EXISTS jami_memory_summaries (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  topic VARCHAR(100) NOT NULL,
  summary TEXT NOT NULL,
  last_interaction_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_mem_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 28. audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NULL,
  action VARCHAR(100) NOT NULL,
  ip_address VARCHAR(50) NULL,
  user_agent VARCHAR(255) NULL,
  metadata_json JSON NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_audit_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
