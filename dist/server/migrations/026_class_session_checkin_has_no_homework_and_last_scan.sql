-- JAMI AI Database Schema Migration 026: Class Session Check-in Homework Flag & Offline Scan Checkpoint
-- Idempotent schema additions for explicit 'has_no_homework' tracking and reliable offline lookback checkpoint

-- 1. Add has_no_homework to class_session_checkins
ALTER TABLE class_session_checkins ADD COLUMN has_no_homework BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add last_offline_scan_at to users
ALTER TABLE users ADD COLUMN last_offline_scan_at DATETIME(3) NULL;

