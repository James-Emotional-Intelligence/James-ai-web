-- JAMI AI Database Schema Migration 001
-- Clean standardized tables for Aiven MySQL / Cloudflare Hyperdrive

-- 0. schema_migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  checksum VARCHAR(64) NOT NULL,
  applied_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- 2. auth_sessions
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

-- 3. refresh_sessions
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

-- 4. consent_records
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

-- 5. student_profiles
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

-- 6. subjects
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

-- 7. school_timetables
CREATE TABLE IF NOT EXISTS school_timetables (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  valid_from DATE NULL,
  valid_to DATE NULL,
  timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',
  is_active BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. school_timetable_entries
CREATE TABLE IF NOT EXISTS school_timetable_entries (
  id VARCHAR(36) PRIMARY KEY,
  timetable_id VARCHAR(36) NOT NULL,
  subject_id VARCHAR(36) NULL,
  title VARCHAR(150) NOT NULL,
  day_of_week INT NOT NULL,
  start_local_time VARCHAR(5) NOT NULL,
  end_local_time VARCHAR(5) NOT NULL,
  location VARCHAR(100) NULL,
  commute_before_minutes INT DEFAULT 15,
  commute_after_minutes INT DEFAULT 15,
  FOREIGN KEY (timetable_id) REFERENCES school_timetables(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. busy_events
CREATE TABLE IF NOT EXISTS busy_events (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(150) NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  recurrence_rule VARCHAR(100) NULL,
  timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',
  is_fixed BOOLEAN DEFAULT TRUE,
  source VARCHAR(50) DEFAULT 'user',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_busy_user_time (user_id, starts_at, ends_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. availability_rules
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. exams
CREATE TABLE IF NOT EXISTS exams (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  subject_id VARCHAR(36) NOT NULL,
  title VARCHAR(150) NOT NULL,
  exam_at DATETIME(3) NOT NULL,
  importance VARCHAR(20) DEFAULT 'high',
  scope_text TEXT NULL,
  status VARCHAR(20) DEFAULT 'upcoming',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_exam_user (user_id, exam_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. exam_topics
CREATE TABLE IF NOT EXISTS exam_topics (
  id VARCHAR(36) PRIMARY KEY,
  exam_id VARCHAR(36) NOT NULL,
  topic_name VARCHAR(150) NOT NULL,
  weight INT DEFAULT 1,
  notes TEXT NULL,
  source_material_id VARCHAR(36) NULL,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. study_plans
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. study_tasks
CREATE TABLE IF NOT EXISTS study_tasks (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  plan_id VARCHAR(36) NULL,
  subject_id VARCHAR(36) NOT NULL,
  exam_id VARCHAR(36) NULL,
  parent_task_id VARCHAR(36) NULL,
  title VARCHAR(200) NOT NULL,
  objective TEXT NULL,
  status VARCHAR(30) DEFAULT 'pending',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. task_dependencies
CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id VARCHAR(36) NOT NULL,
  depends_on_task_id VARCHAR(36) NOT NULL,
  type VARCHAR(30) DEFAULT 'finish_to_start',
  PRIMARY KEY (task_id, depends_on_task_id),
  FOREIGN KEY (task_id) REFERENCES study_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_task_id) REFERENCES study_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. execution_guides
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. execution_steps
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. focus_sessions
CREATE TABLE IF NOT EXISTS focus_sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36) NULL,
  mode VARCHAR(30) DEFAULT '25_5',
  planned_minutes INT NOT NULL DEFAULT 25,
  state VARCHAR(30) DEFAULT 'ready',
  started_at DATETIME(3) NULL,
  paused_at DATETIME(3) NULL,
  ended_at DATETIME(3) NULL,
  accumulated_pause_seconds INT DEFAULT 0,
  pause_count INT DEFAULT 0,
  notes TEXT NULL,
  outcome VARCHAR(50) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_focus_user (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19. study_sessions
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
  self_assessment INT NULL,
  notes TEXT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES study_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 20. task_evidence
CREATE TABLE IF NOT EXISTS task_evidence (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  task_id VARCHAR(36) NOT NULL,
  step_id VARCHAR(36) NULL,
  type VARCHAR(30) NOT NULL,
  text_value TEXT NULL,
  r2_object_key VARCHAR(255) NULL,
  score_value INT NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES study_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 21. learning_materials
CREATE TABLE IF NOT EXISTS learning_materials (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  subject_id VARCHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  type VARCHAR(50) NOT NULL,
  r2_object_key VARCHAR(255) NULL,
  mime_type VARCHAR(100) NULL,
  size_bytes BIGINT DEFAULT 0,
  sha256 VARCHAR(64) NULL,
  processing_status VARCHAR(30) DEFAULT 'ready',
  summary TEXT NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  INDEX idx_mat_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 22. quizzes
CREATE TABLE IF NOT EXISTS quizzes (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  exam_id VARCHAR(36) NULL,
  subject_id VARCHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  type VARCHAR(50) DEFAULT 'practice',
  milestone VARCHAR(20) NULL,
  difficulty VARCHAR(20) DEFAULT 'medium',
  status VARCHAR(30) DEFAULT 'ready',
  source_scope_json JSON NULL,
  idempotency_key VARCHAR(64) NULL,
  generated_by_ai BOOLEAN DEFAULT TRUE,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_quiz_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 23. quiz_questions (correct_answer and explanation are server-only)
CREATE TABLE IF NOT EXISTS quiz_questions (
  id VARCHAR(36) PRIMARY KEY,
  quiz_id VARCHAR(36) NOT NULL,
  question_order INT NOT NULL,
  type VARCHAR(30) NOT NULL,
  prompt TEXT NOT NULL,
  options_json JSON NULL,
  correct_answer_server_only TEXT NOT NULL,
  rubric_json JSON NULL,
  explanation_server_only TEXT NOT NULL,
  difficulty VARCHAR(20) DEFAULT 'medium',
  topic_ref VARCHAR(100) NULL,
  source_reference VARCHAR(255) NULL,
  INDEX idx_quest_quiz (quiz_id),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 24. quiz_attempts
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id VARCHAR(36) PRIMARY KEY,
  quiz_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  started_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  submitted_at DATETIME(3) NULL,
  score DECIMAL(5,2) NULL,
  max_score DECIMAL(5,2) DEFAULT 10.00,
  status VARCHAR(20) DEFAULT 'in_progress',
  feedback_summary TEXT NULL,
  INDEX idx_attempt_user (user_id),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 25. quiz_answers
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 26. topic_mastery
CREATE TABLE IF NOT EXISTS topic_mastery (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  subject_id VARCHAR(36) NOT NULL,
  topic_key VARCHAR(100) NOT NULL,
  mastery_score INT DEFAULT 50,
  confidence INT DEFAULT 50,
  evidence_count INT DEFAULT 1,
  last_practiced_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_user_subj_topic (user_id, subject_id, topic_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 27. notifications
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 28. notification_preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id VARCHAR(36) PRIMARY KEY,
  quiet_hours_start VARCHAR(5) DEFAULT '22:30',
  quiet_hours_end VARCHAR(5) DEFAULT '06:30',
  timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',
  in_app_enabled BOOLEAN DEFAULT TRUE,
  web_push_enabled BOOLEAN DEFAULT FALSE,
  reminder_lead_minutes_json JSON NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 29. voice_requests
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 30. jami_preferences
CREATE TABLE IF NOT EXISTS jami_preferences (
  user_id VARCHAR(36) PRIMARY KEY,
  voice_enabled BOOLEAN DEFAULT TRUE,
  sound_effects BOOLEAN DEFAULT TRUE,
  selected_voice VARCHAR(50) DEFAULT 'vi-VN-Standard-A',
  animation_enabled BOOLEAN DEFAULT TRUE,
  response_length VARCHAR(20) DEFAULT 'balanced',
  preferred_address VARCHAR(50) DEFAULT 'Minh',
  memory_enabled BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 31. jami_memory_summaries
CREATE TABLE IF NOT EXISTS jami_memory_summaries (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  category VARCHAR(50) NOT NULL,
  summary TEXT NOT NULL,
  expires_at DATETIME(3) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 32. jami_conversations
CREATE TABLE IF NOT EXISTS jami_conversations (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(150) NOT NULL DEFAULT 'Hội thoại với Jami',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_conv_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 33. jami_messages
CREATE TABLE IF NOT EXISTS jami_messages (
  id VARCHAR(36) PRIMARY KEY,
  conversation_id VARCHAR(36) NOT NULL,
  sender VARCHAR(20) NOT NULL, -- 'user' or 'jami'
  content TEXT NOT NULL,
  emotion VARCHAR(30) DEFAULT 'neutral',
  metadata_json JSON NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_msg_conv (conversation_id),
  FOREIGN KEY (conversation_id) REFERENCES jami_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 34. schedule_proposals
CREATE TABLE IF NOT EXISTS schedule_proposals (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  base_plan_version INT DEFAULT 1,
  status VARCHAR(20) DEFAULT 'pending',
  reason TEXT NOT NULL,
  diff_json JSON NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  confirmed_at DATETIME(3) NULL,
  idempotency_key VARCHAR(64) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_prop_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 35. ai_runs
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 36. audit_logs
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 37. data_requests
CREATE TABLE IF NOT EXISTS data_requests (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  type VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'completed',
  requested_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  completed_at DATETIME(3) NULL,
  error_code VARCHAR(50) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
