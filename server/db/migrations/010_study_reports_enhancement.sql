-- JAMI AI Database Schema Migration 010: Study Reports & Analytics Subsystem Enhancement
-- Idempotent schema reconciliation for completed_at, report indexes, and analytics tracking

-- 1. Ensure study_tasks has completed_at column for on-time calculation
ALTER TABLE study_tasks ADD COLUMN completed_at DATETIME(3) NULL;

-- 2. Add performance indexes for report queries
ALTER TABLE study_tasks ADD INDEX idx_tasks_user_status_due (user_id, status, due_at);
ALTER TABLE study_tasks ADD INDEX idx_tasks_user_completed (user_id, status, completed_at);
ALTER TABLE focus_sessions ADD INDEX idx_focus_user_state_started (user_id, state, started_at);
ALTER TABLE quiz_attempts ADD INDEX idx_quiz_attempts_user_status_sub (user_id, status, submitted_at);
ALTER TABLE topic_mastery ADD INDEX idx_topic_mastery_user_score (user_id, mastery_score);
