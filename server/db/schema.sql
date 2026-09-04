-- JAMI AI Database Schema (Aiven MySQL / Cloudflare Hyperdrive)
-- Character Set: utf8mb4, Collation: utf8mb4_unicode_ci

CREATE DATABASE IF NOT EXISTS jami_ai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE jami_ai;

-- 1. users
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  password_salt VARCHAR(255) NULL,
  password_scheme VARCHAR(50) NULL DEFAULT 'scrypt',
  display_name VARCHAR(100) NOT NULL,
  preferred_name VARCHAR(50) NOT NULL,
  locale VARCHAR(10) DEFAULT 'vi-VN',
  timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',
  age_band VARCHAR(20) DEFAULT '14-17',
  role VARCHAR(20) DEFAULT 'user',
  status VARCHAR(20) DEFAULT 'active',
  last_active_at DATETIME(3) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_users_last_active (last_active_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 1.1 auth_sessions
CREATE TABLE IF NOT EXISTS auth_sessions (
  id VARCHAR(36) PRIMARY KEY,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  user_id VARCHAR(36) NOT NULL,
  is_demo BOOLEAN DEFAULT FALSE,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  user_agent VARCHAR(500) NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_auth_sessions_user (user_id),
  INDEX idx_auth_sessions_lookup (token_hash, revoked_at, expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. refresh_sessions
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. consent_records
CREATE TABLE IF NOT EXISTS consent_records (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  consent_type VARCHAR(50) NOT NULL,
  policy_version VARCHAR(20) NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT TRUE,
  granted_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at DATETIME(3) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. student_profiles
CREATE TABLE IF NOT EXISTS student_profiles (
  user_id VARCHAR(36) PRIMARY KEY,
  grade_level INT NOT NULL DEFAULT 9,
  school_name VARCHAR(255) NULL,
  goals_json JSON NULL,
  preferred_session_minutes INT DEFAULT 45,
  max_daily_study_minutes INT DEFAULT 180,
  energy_preferences_json JSON NULL,
  onboarding_completed_at DATETIME(3) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. subjects
CREATE TABLE IF NOT EXISTS subjects (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(30) NOT NULL DEFAULT '#3B82F6',
  icon VARCHAR(50) DEFAULT 'BookOpen',
  sort_order INT DEFAULT 0,
  archived_at DATETIME(3) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. school_timetables
CREATE TABLE IF NOT EXISTS school_timetables (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  valid_from DATE NULL,
  valid_to DATE NULL,
  timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',
  is_active BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. school_timetable_entries
CREATE TABLE IF NOT EXISTS school_timetable_entries (
  id VARCHAR(36) PRIMARY KEY,
  timetable_id VARCHAR(36) NOT NULL,
  subject_id VARCHAR(36) NULL,
  title VARCHAR(150) NOT NULL,
  day_of_week INT NOT NULL, -- 1 = Monday, 7 = Sunday
  start_local_time VARCHAR(5) NOT NULL, -- '07:30'
  end_local_time VARCHAR(5) NOT NULL,   -- '11:45'
  location VARCHAR(100) NULL,
  commute_before_minutes INT DEFAULT 15,
  commute_after_minutes INT DEFAULT 15,
  FOREIGN KEY (timetable_id) REFERENCES school_timetables(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. busy_events
CREATE TABLE IF NOT EXISTS busy_events (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'extra_class', 'meal', 'sleep', 'commute', 'personal'
  title VARCHAR(150) NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  recurrence_rule VARCHAR(100) NULL,
  timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',
  is_fixed BOOLEAN DEFAULT TRUE,
  source VARCHAR(50) DEFAULT 'user',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_user_time (user_id, starts_at, ends_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8.1 busy_event_exceptions (Nghỉ tạm thời gian biểu)
CREATE TABLE IF NOT EXISTS busy_event_exceptions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  busy_event_id VARCHAR(36) NOT NULL,
  occurrence_date DATE NOT NULL,
  exception_type VARCHAR(20) NOT NULL DEFAULT 'cancelled',
  reason VARCHAR(255) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_busy_event_occurrence (busy_event_id, occurrence_date),
  INDEX idx_busy_exceptions_user_date (user_id, occurrence_date),
  INDEX idx_busy_exceptions_event (busy_event_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (busy_event_id) REFERENCES busy_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. availability_rules
CREATE TABLE IF NOT EXISTS availability_rules (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  day_of_week INT NOT NULL,
  start_local_time VARCHAR(5) NOT NULL,
  end_local_time VARCHAR(5) NOT NULL,
  effective_from DATE NULL,
  effective_to DATE NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. exams
CREATE TABLE IF NOT EXISTS exams (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  subject_id VARCHAR(36) NOT NULL,
  title VARCHAR(150) NOT NULL,
  exam_at DATETIME(3) NOT NULL,
  importance VARCHAR(20) DEFAULT 'high', -- 'low', 'medium', 'high', 'critical'
  scope_text TEXT NULL,
  status VARCHAR(20) DEFAULT 'upcoming', -- 'upcoming', 'completed', 'cancelled'
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. exam_topics
CREATE TABLE IF NOT EXISTS exam_topics (
  id VARCHAR(36) PRIMARY KEY,
  exam_id VARCHAR(36) NOT NULL,
  topic_name VARCHAR(150) NOT NULL,
  weight INT DEFAULT 1,
  notes TEXT NULL,
  source_material_id VARCHAR(36) NULL,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. study_plans
CREATE TABLE IF NOT EXISTS study_plans (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(150) NOT NULL,
  range_start DATETIME(3) NOT NULL,
  range_end DATETIME(3) NOT NULL,
  timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',
  status VARCHAR(20) DEFAULT 'active',
  source VARCHAR(50) DEFAULT 'ai_voice',
  version INT DEFAULT 1,
  confirmed_at DATETIME(3) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13. study_tasks
CREATE TABLE IF NOT EXISTS study_tasks (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  plan_id VARCHAR(36) NULL,
  subject_id VARCHAR(36) NOT NULL,
  exam_id VARCHAR(36) NULL,
  parent_task_id VARCHAR(36) NULL,
  title VARCHAR(200) NOT NULL,
  objective TEXT NULL,
  status VARCHAR(30) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'cancelled'
  priority VARCHAR(20) DEFAULT 'medium',
  difficulty VARCHAR(20) DEFAULT 'medium',
  due_at DATETIME(3) NULL,
  estimated_minutes INT NOT NULL DEFAULT 45,
  minimum_session_minutes INT DEFAULT 20,
  maximum_session_minutes INT DEFAULT 60,
  splittable BOOLEAN DEFAULT FALSE,
  locked BOOLEAN DEFAULT FALSE,
  scheduled_start_at DATETIME(3) NULL,
  scheduled_end_at DATETIME(3) NULL,
  completion_percent INT DEFAULT 0,
  source VARCHAR(50) DEFAULT 'planner',
  idempotency_key VARCHAR(64) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_user_scheduled (user_id, scheduled_start_at, scheduled_end_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 14. task_dependencies
CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id VARCHAR(36) NOT NULL,
  depends_on_task_id VARCHAR(36) NOT NULL,
  type VARCHAR(30) DEFAULT 'finish_to_start',
  PRIMARY KEY (task_id, depends_on_task_id),
  FOREIGN KEY (task_id) REFERENCES study_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_task_id) REFERENCES study_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 15. execution_guides
CREATE TABLE IF NOT EXISTS execution_guides (
  id VARCHAR(36) PRIMARY KEY,
  task_id VARCHAR(36) NOT NULL UNIQUE,
  objective TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  prerequisites_json JSON NULL,
  materials_json JSON NULL,
  preparation_checklist_json JSON NULL,
  success_criteria_json JSON NULL,
  excellent_criteria_json JSON NULL,
  evidence_required_json JSON NULL,
  common_mistakes_json JSON NULL,
  fallback_action TEXT NULL,
  completion_questions_json JSON NULL,
  next_action TEXT NULL,
  version INT DEFAULT 1,
  generated_by_ai BOOLEAN DEFAULT TRUE,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (task_id) REFERENCES study_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 16. execution_steps
CREATE TABLE IF NOT EXISTS execution_steps (
  id VARCHAR(36) PRIMARY KEY,
  guide_id VARCHAR(36) NOT NULL,
  step_order INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  planned_minutes INT NOT NULL,
  instruction TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  tips_json JSON NULL,
  status VARCHAR(20) DEFAULT 'pending',
  started_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  actual_minutes INT NULL,
  FOREIGN KEY (guide_id) REFERENCES execution_guides(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 17. focus_sessions
CREATE TABLE IF NOT EXISTS focus_sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36) NULL,
  mode VARCHAR(30) DEFAULT '25_5', -- '25_5', '45_10', 'custom'
  planned_minutes INT NOT NULL DEFAULT 25,
  state VARCHAR(30) DEFAULT 'ready', -- 'ready', 'running', 'paused', 'break', 'completed', 'abandoned'
  started_at DATETIME(3) NULL,
  paused_at DATETIME(3) NULL,
  ended_at DATETIME(3) NULL,
  accumulated_pause_seconds INT DEFAULT 0,
  outcome VARCHAR(50) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 18. study_sessions
CREATE TABLE IF NOT EXISTS study_sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36) NOT NULL,
  planned_start_at DATETIME(3) NOT NULL,
  actual_start_at DATETIME(3) NULL,
  actual_end_at DATETIME(3) NULL,
  planned_minutes INT NOT NULL,
  actual_minutes INT NULL,
  completion_status VARCHAR(30) DEFAULT 'completed',
  self_assessment INT NULL, -- 1 to 5 stars
  notes TEXT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES study_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 19. task_evidence
CREATE TABLE IF NOT EXISTS task_evidence (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36) NOT NULL,
  step_id VARCHAR(36) NULL,
  type VARCHAR(30) NOT NULL, -- 'text_note', 'image_r2', 'score'
  text_value TEXT NULL,
  r2_object_key VARCHAR(255) NULL,
  score_value INT NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES study_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 20. learning_materials
CREATE TABLE IF NOT EXISTS learning_materials (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  subject_id VARCHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'pdf', 'image', 'notes', 'docx', 'epub', 'txt'
  material_kind VARCHAR(32) NOT NULL DEFAULT 'document', -- 'document', 'book'
  storage_driver VARCHAR(16) NOT NULL DEFAULT 'local', -- 'local', 'r2'
  storage_key VARCHAR(512) NULL,
  original_filename VARCHAR(255) NULL,
  detected_mime VARCHAR(100) NULL,
  extension VARCHAR(32) NULL,
  r2_object_key VARCHAR(255) NULL,
  file_name VARCHAR(255) NULL,
  mime_type VARCHAR(100) NULL,
  size_bytes BIGINT DEFAULT 0,
  sha256 VARCHAR(64) NULL,
  publisher VARCHAR(150) NULL,
  edition_year INT NULL,
  language VARCHAR(10) DEFAULT 'vi',
  cover_object_key VARCHAR(500) NULL,
  page_count INT DEFAULT 0,
  chapter_count INT DEFAULT 0,
  processing_status VARCHAR(30) DEFAULT 'ready',
  processing_progress INT DEFAULT 0,
  processing_error_code VARCHAR(64) NULL,
  summary TEXT NULL,
  summary_json JSON NULL,
  content_text LONGTEXT NULL,
  error_message TEXT NULL,
  rights_confirmed_at DATETIME(3) NULL,
  rights_terms_version VARCHAR(20) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  INDEX idx_mat_user_status_created (user_id, processing_status, created_at),
  INDEX idx_mat_storage_driver (storage_driver)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 21. quizzes
CREATE TABLE IF NOT EXISTS quizzes (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  exam_id VARCHAR(36) NULL,
  subject_id VARCHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  type VARCHAR(50) DEFAULT 'practice', -- 'diagnostic', 'weak_topic', 'simulation', 'quick_review'
  milestone VARCHAR(20) NULL, -- 'D-14', 'D-7', 'D-3', 'D-1'
  difficulty VARCHAR(20) DEFAULT 'medium',
  status VARCHAR(30) DEFAULT 'ready',
  source_scope_json JSON NULL,
  idempotency_key VARCHAR(64) NULL,
  generated_by_ai BOOLEAN DEFAULT TRUE,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 22. quiz_questions (correct_answer and explanation are server-only)
CREATE TABLE IF NOT EXISTS quiz_questions (
  id VARCHAR(36) PRIMARY KEY,
  quiz_id VARCHAR(36) NOT NULL,
  question_order INT NOT NULL,
  type VARCHAR(30) NOT NULL, -- 'multiple_choice', 'true_false', 'short_answer'
  prompt TEXT NOT NULL,
  options_json JSON NULL,
  correct_answer_server_only TEXT NOT NULL,
  rubric_json JSON NULL,
  explanation_server_only TEXT NOT NULL,
  difficulty VARCHAR(20) DEFAULT 'medium',
  topic_ref VARCHAR(100) NULL,
  source_reference VARCHAR(255) NULL,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 23. quiz_attempts
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id VARCHAR(36) PRIMARY KEY,
  quiz_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  started_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  submitted_at DATETIME(3) NULL,
  score DECIMAL(5,2) NULL,
  max_score DECIMAL(5,2) DEFAULT 10.00,
  status VARCHAR(20) DEFAULT 'in_progress', -- 'in_progress', 'submitted', 'abandoned'
  feedback_summary TEXT NULL,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 24. quiz_answers
CREATE TABLE IF NOT EXISTS quiz_answers (
  id VARCHAR(36) PRIMARY KEY,
  attempt_id VARCHAR(36) NOT NULL,
  question_id VARCHAR(36) NOT NULL,
  answer_json JSON NOT NULL,
  is_correct BOOLEAN NULL,
  score DECIMAL(5,2) NULL,
  feedback TEXT NULL,
  answered_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 25. topic_mastery
CREATE TABLE IF NOT EXISTS topic_mastery (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  subject_id VARCHAR(36) NOT NULL,
  topic_key VARCHAR(100) NOT NULL,
  mastery_score INT DEFAULT 50, -- 0 to 100
  confidence INT DEFAULT 50,
  evidence_count INT DEFAULT 1,
  last_practiced_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_user_subj_topic (user_id, subject_id, topic_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 26. notifications
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'upcoming_class', 'upcoming_exam', 'incomplete_task', 'system'
  title VARCHAR(150) NOT NULL,
  body TEXT NOT NULL,
  action_url VARCHAR(255) NULL,
  scheduled_for DATETIME(3) NULL,
  delivered_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  read_at DATETIME(3) NULL,
  status VARCHAR(20) DEFAULT 'unread',
  dedupe_key VARCHAR(100) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_user_status (user_id, status),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 27. notification_preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id VARCHAR(36) PRIMARY KEY,
  quiet_hours_start VARCHAR(5) DEFAULT '22:30',
  quiet_hours_end VARCHAR(5) DEFAULT '06:30',
  timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',
  in_app_enabled BOOLEAN DEFAULT TRUE,
  web_push_enabled BOOLEAN DEFAULT FALSE,
  reminder_lead_minutes_json JSON NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 28. voice_requests
CREATE TABLE IF NOT EXISTS voice_requests (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  purpose VARCHAR(50) NOT NULL,
  transcript TEXT NULL,
  language VARCHAR(10) DEFAULT 'vi',
  duration_ms INT DEFAULT 0,
  processing_status VARCHAR(30) DEFAULT 'completed',
  error_code VARCHAR(50) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 29. jami_preferences
CREATE TABLE IF NOT EXISTS jami_preferences (
  user_id VARCHAR(36) PRIMARY KEY,
  voice_enabled BOOLEAN DEFAULT TRUE,
  selected_voice VARCHAR(50) DEFAULT 'vi-VN-Standard-A',
  animation_enabled BOOLEAN DEFAULT TRUE,
  response_length VARCHAR(20) DEFAULT 'balanced', -- 'concise', 'balanced', 'detailed'
  preferred_address VARCHAR(50) DEFAULT 'Minh',
  memory_enabled BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 30. jami_memory_summaries
CREATE TABLE IF NOT EXISTS jami_memory_summaries (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'weak_subject', 'preference', 'habit'
  summary TEXT NOT NULL,
  expires_at DATETIME(3) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 31. schedule_proposals
CREATE TABLE IF NOT EXISTS schedule_proposals (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  base_plan_version INT DEFAULT 1,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'confirmed', 'rejected'
  reason TEXT NOT NULL,
  diff_json JSON NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  confirmed_at DATETIME(3) NULL,
  idempotency_key VARCHAR(64) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 32. ai_runs
CREATE TABLE IF NOT EXISTS ai_runs (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  purpose VARCHAR(50) NOT NULL,
  provider VARCHAR(50) DEFAULT 'openai',
  model VARCHAR(50) NOT NULL,
  request_id VARCHAR(100) NULL,
  schema_version VARCHAR(20) DEFAULT '1.0',
  status VARCHAR(20) DEFAULT 'success',
  latency_ms INT DEFAULT 0,
  prompt_tokens INT DEFAULT 0,
  completion_tokens INT DEFAULT 0,
  estimated_cost DECIMAL(8,6) DEFAULT 0,
  safety_flags_json JSON NULL,
  error_code VARCHAR(50) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 33. audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  actor_user_id VARCHAR(36) NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  result VARCHAR(20) DEFAULT 'success',
  request_id VARCHAR(100) NULL,
  safe_metadata_json JSON NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 34. data_requests
CREATE TABLE IF NOT EXISTS data_requests (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  type VARCHAR(20) NOT NULL, -- 'EXPORT', 'DELETE'
  status VARCHAR(20) DEFAULT 'completed',
  requested_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  completed_at DATETIME(3) NULL,
  error_code VARCHAR(50) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 35. book_chapters (Mục lục & Chương sách Sách mềm)
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

-- 36. book_chunks (Đoạn ngữ nghĩa có trích dẫn trang & chương cho RAG/Search)
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

-- 37. book_progress (Tiến độ đọc sách cá nhân)
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

-- 38. book_bookmarks (Dấu trang)
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

-- 39. book_highlights (Tô sáng & Ghi chú trang sách)
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

-- 40. timetable_entry_exceptions (Ngoại lệ thời khóa biểu)
CREATE TABLE IF NOT EXISTS timetable_entry_exceptions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  timetable_entry_id VARCHAR(64) NOT NULL,
  occurrence_date VARCHAR(10) NOT NULL,
  exception_type VARCHAR(32) NOT NULL DEFAULT 'cancelled',
  reason VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_entry_occurrence (timetable_entry_id, occurrence_date),
  INDEX idx_exceptions_user_date (user_id, occurrence_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 41. class_session_checkins (Nhật ký bài học & BTVN)
CREATE TABLE IF NOT EXISTS class_session_checkins (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  timetable_entry_id VARCHAR(64) NOT NULL,
  occurrence_date VARCHAR(10) NOT NULL,
  learned_content TEXT NULL,
  homework TEXT NULL,
  homework_image_material_id VARCHAR(36) NULL,
  has_no_homework BOOLEAN NOT NULL DEFAULT FALSE,
  reflection TEXT NULL,
  understanding_level VARCHAR(32) NULL,
  attendance_status VARCHAR(32) NOT NULL DEFAULT 'attended',
  completed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_checkin_user_entry_occ (user_id, timetable_entry_id, occurrence_date),
  INDEX idx_checkins_user_date (user_id, occurrence_date),
  INDEX idx_checkins_hw_material (homework_image_material_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (homework_image_material_id) REFERENCES learning_materials(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 42. tomorrow_preparation_plans (Kế hoạch chuẩn bị ngày mai)
CREATE TABLE IF NOT EXISTS tomorrow_preparation_plans (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  target_date VARCHAR(10) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  summary TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_prep_user_target_date (user_id, target_date),
  INDEX idx_prep_user_date (user_id, target_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 43. tomorrow_preparation_items
CREATE TABLE IF NOT EXISTS tomorrow_preparation_items (
  id VARCHAR(64) PRIMARY KEY,
  plan_id VARCHAR(64) NOT NULL,
  item_type VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at DATETIME(3) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_prep_items_plan (plan_id),
  FOREIGN KEY (plan_id) REFERENCES tomorrow_preparation_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 44. exam_study_plans (Kế hoạch ôn thi)
CREATE TABLE IF NOT EXISTS exam_study_plans (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  exam_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_exam_study_plans_user (user_id, exam_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 45. exam_study_plan_items
CREATE TABLE IF NOT EXISTS exam_study_plan_items (
  id VARCHAR(64) PRIMARY KEY,
  plan_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  scheduled_date VARCHAR(10) NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 45,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at DATETIME(3) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_plan_items_plan (plan_id),
  FOREIGN KEY (plan_id) REFERENCES exam_study_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 46. exam_study_plan_versions
CREATE TABLE IF NOT EXISTS exam_study_plan_versions (
  id VARCHAR(64) PRIMARY KEY,
  plan_id VARCHAR(64) NOT NULL,
  version_number INT NOT NULL DEFAULT 1,
  snapshot_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_plan_versions_plan (plan_id),
  FOREIGN KEY (plan_id) REFERENCES exam_study_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 47. mistake_notebook_entries (Sổ tay lỗi sai)
CREATE TABLE IF NOT EXISTS mistake_notebook_entries (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  subject_id VARCHAR(64) NULL,
  topic_ref VARCHAR(255) NULL,
  question_text TEXT NOT NULL,
  user_wrong_answer TEXT NULL,
  correct_answer TEXT NOT NULL,
  explanation TEXT NULL,
  mistake_reason VARCHAR(255) NULL,
  mastery_level VARCHAR(32) NOT NULL DEFAULT 'unmastered',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_mistakes_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 48. mistake_review_attempts
CREATE TABLE IF NOT EXISTS mistake_review_attempts (
  id VARCHAR(64) PRIMARY KEY,
  entry_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  user_answer TEXT NULL,
  reviewed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_mistake_reviews (entry_id, user_id),
  FOREIGN KEY (entry_id) REFERENCES mistake_notebook_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 49. learning_material_outlines (Đề cương môn học)
CREATE TABLE IF NOT EXISTS learning_material_outlines (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  material_id VARCHAR(64) NOT NULL,
  outline_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_outlines_mat (material_id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES learning_materials(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 50. notification_deliveries (Nhật ký gửi thông báo)
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id VARCHAR(64) PRIMARY KEY,
  notification_id VARCHAR(64) NOT NULL,
  channel VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  error_message TEXT NULL,
  delivered_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_notif_deliveries (notification_id),
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

