-- JAMI AI Database Schema Migration 017: Admin Role and User Management
-- Forward-only migration to ensure role and status columns on users table

ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user';
