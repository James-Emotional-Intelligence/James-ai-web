-- Migration 040: Canonical AI Proposals, Turns, Idempotency, and Entity Persistence
-- Reconciles all entity schema fields for JAMI AI V4 single-source-of-truth pipeline.

-- 1. Safely deduplicate jami_messages client_message_id before creating UNIQUE index
SET @has_jami_messages := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE table_schema = DATABASE() AND table_name = 'jami_messages'
);

-- Delete duplicate client_message_id keeping the earliest record
DELETE m1 FROM jami_messages m1
INNER JOIN jami_messages m2
WHERE m1.user_id = m2.user_id
  AND m1.client_message_id = m2.client_message_id
  AND m1.client_message_id IS NOT NULL
  AND (m1.created_at > m2.created_at OR (m1.created_at = m2.created_at AND m1.id > m2.id));

-- Create UNIQUE index on jami_messages (user_id, client_message_id) if not exists
SET @exist_msg_uniq := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'jami_messages' AND index_name = 'uq_jami_message_user_client'
);
SET @sql_msg_uniq := IF(
  @has_jami_messages > 0 AND @exist_msg_uniq = 0,
  'CREATE UNIQUE INDEX uq_jami_message_user_client ON jami_messages (user_id, client_message_id)',
  'SELECT 1'
);
PREPARE stmt_msg_uniq FROM @sql_msg_uniq;
EXECUTE stmt_msg_uniq;
DEALLOCATE PREPARE stmt_msg_uniq;

-- 2. Ensure jami_turns table for turn-level distributed locking and idempotency
CREATE TABLE IF NOT EXISTS jami_turns (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  conversation_id VARCHAR(36) NOT NULL,
  client_message_id VARCHAR(150) NOT NULL,
  status ENUM('processing', 'completed', 'failed') NOT NULL DEFAULT 'processing',
  user_message_id VARCHAR(64) NULL,
  reply_message_id VARCHAR(64) NULL,
  proposal_id VARCHAR(64) NULL,
  response_json JSON NULL,
  error_message TEXT NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_jami_turn_user_client (user_id, client_message_id),
  INDEX idx_jt_user_conv (user_id, conversation_id),
  INDEX idx_jt_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Ensure jami_action_proposals columns (execution_key, result_resource_id, error_code, error_message, processing_at)
SET @exist_prop_exec_key := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'jami_action_proposals' AND column_name = 'execution_key'
);
SET @sql_prop_exec_key := IF(
  @exist_prop_exec_key = 0,
  'ALTER TABLE jami_action_proposals ADD COLUMN execution_key VARCHAR(191) NULL UNIQUE AFTER idempotency_key',
  'SELECT 1'
);
PREPARE stmt_prop_exec FROM @sql_prop_exec_key;
EXECUTE stmt_prop_exec;
DEALLOCATE PREPARE stmt_prop_exec;

SET @exist_prop_res_id := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'jami_action_proposals' AND column_name = 'result_resource_id'
);
SET @sql_prop_res_id := IF(
  @exist_prop_res_id = 0,
  'ALTER TABLE jami_action_proposals ADD COLUMN result_resource_id VARCHAR(64) NULL AFTER execution_key',
  'SELECT 1'
);
PREPARE stmt_prop_res FROM @sql_prop_res_id;
EXECUTE stmt_prop_res;
DEALLOCATE PREPARE stmt_prop_res;

SET @exist_prop_err_code := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'jami_action_proposals' AND column_name = 'error_code'
);
SET @sql_prop_err_code := IF(
  @exist_prop_err_code = 0,
  'ALTER TABLE jami_action_proposals ADD COLUMN error_code VARCHAR(64) NULL AFTER result_resource_id',
  'SELECT 1'
);
PREPARE stmt_prop_err_c FROM @sql_prop_err_code;
EXECUTE stmt_prop_err_c;
DEALLOCATE PREPARE stmt_prop_err_c;

SET @exist_prop_err_msg := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'jami_action_proposals' AND column_name = 'error_message'
);
SET @sql_prop_err_msg := IF(
  @exist_prop_err_msg = 0,
  'ALTER TABLE jami_action_proposals ADD COLUMN error_message TEXT NULL AFTER error_code',
  'SELECT 1'
);
PREPARE stmt_prop_err_m FROM @sql_prop_err_msg;
EXECUTE stmt_prop_err_m;
DEALLOCATE PREPARE stmt_prop_err_m;

SET @exist_prop_proc_at := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'jami_action_proposals' AND column_name = 'processing_at'
);
SET @sql_prop_proc_at := IF(
  @exist_prop_proc_at = 0,
  'ALTER TABLE jami_action_proposals ADD COLUMN processing_at DATETIME(3) NULL AFTER confirmed_at',
  'SELECT 1'
);
PREPARE stmt_prop_proc FROM @sql_prop_proc_at;
EXECUTE stmt_prop_proc;
DEALLOCATE PREPARE stmt_prop_proc;

-- 4. Ensure busy_events persistence columns (notes, is_all_day)
SET @exist_busy_notes := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'busy_events' AND column_name = 'notes'
);
SET @sql_busy_notes := IF(
  @exist_busy_notes = 0,
  'ALTER TABLE busy_events ADD COLUMN notes TEXT NULL AFTER timezone',
  'SELECT 1'
);
PREPARE stmt_busy_notes FROM @sql_busy_notes;
EXECUTE stmt_busy_notes;
DEALLOCATE PREPARE stmt_busy_notes;

SET @exist_busy_allday := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'busy_events' AND column_name = 'is_all_day'
);
SET @sql_busy_allday := IF(
  @exist_busy_allday = 0,
  'ALTER TABLE busy_events ADD COLUMN is_all_day BOOLEAN NOT NULL DEFAULT FALSE AFTER notes',
  'SELECT 1'
);
PREPARE stmt_busy_allday FROM @sql_busy_allday;
EXECUTE stmt_busy_allday;
DEALLOCATE PREPARE stmt_busy_allday;

-- 5. Ensure study_tasks notes column
SET @exist_task_notes := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'study_tasks' AND column_name = 'notes'
);
SET @sql_task_notes := IF(
  @exist_task_notes = 0,
  'ALTER TABLE study_tasks ADD COLUMN notes TEXT NULL AFTER objective',
  'SELECT 1'
);
PREPARE stmt_task_notes FROM @sql_task_notes;
EXECUTE stmt_task_notes;
DEALLOCATE PREPARE stmt_task_notes;

-- 6. Ensure exams target_score column
SET @exist_exam_target := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'exams' AND column_name = 'target_score'
);
SET @sql_exam_target := IF(
  @exist_exam_target = 0,
  'ALTER TABLE exams ADD COLUMN target_score DECIMAL(4,2) NULL AFTER scope_text',
  'SELECT 1'
);
PREPARE stmt_exam_target FROM @sql_exam_target;
EXECUTE stmt_exam_target;
DEALLOCATE PREPARE stmt_exam_target;

-- 7. Ensure mistake_notebook_entries lesson_learned and correct_solution
SET @exist_mistake_lesson := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'mistake_notebook_entries' AND column_name = 'lesson_learned'
);
SET @sql_mistake_lesson := IF(
  @exist_mistake_lesson = 0,
  'ALTER TABLE mistake_notebook_entries ADD COLUMN lesson_learned TEXT NULL AFTER mistake_reason',
  'SELECT 1'
);
PREPARE stmt_mistake_lesson FROM @sql_mistake_lesson;
EXECUTE stmt_mistake_lesson;
DEALLOCATE PREPARE stmt_mistake_lesson;

SET @exist_mistake_sol := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'mistake_notebook_entries' AND column_name = 'correct_solution'
);
SET @sql_mistake_sol := IF(
  @exist_mistake_sol = 0,
  'ALTER TABLE mistake_notebook_entries ADD COLUMN correct_solution TEXT NULL AFTER correct_answer',
  'SELECT 1'
);
PREPARE stmt_mistake_sol FROM @sql_mistake_sol;
EXECUTE stmt_mistake_sol;
DEALLOCATE PREPARE stmt_mistake_sol;

-- 8. Ensure material_processing_jobs next_retry_at and error_code
SET @exist_job_retry := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'material_processing_jobs' AND column_name = 'next_retry_at'
);
SET @sql_job_retry := IF(
  @exist_job_retry = 0,
  'ALTER TABLE material_processing_jobs ADD COLUMN next_retry_at DATETIME(3) NULL AFTER error_message',
  'SELECT 1'
);
PREPARE stmt_job_retry FROM @sql_job_retry;
EXECUTE stmt_job_retry;
DEALLOCATE PREPARE stmt_job_retry;

SET @exist_job_err_code := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'material_processing_jobs' AND column_name = 'error_code'
);
SET @sql_job_err_code := IF(
  @exist_job_err_code = 0,
  'ALTER TABLE material_processing_jobs ADD COLUMN error_code VARCHAR(64) NULL AFTER next_retry_at',
  'SELECT 1'
);
PREPARE stmt_job_err_c FROM @sql_job_err_code;
EXECUTE stmt_job_err_c;
DEALLOCATE PREPARE stmt_job_err_c;
