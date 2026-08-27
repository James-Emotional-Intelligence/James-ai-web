-- JAMI AI Database Schema Migration 005: Runtime Schema Reconciliation & Legacy Password Scheme Backfill
-- Idempotent schema reconciliation for Aiven MySQL & Production deployments

-- 1. Ensure password_scheme column exists in users table and is enlarged to VARCHAR(50)
ALTER TABLE users ADD COLUMN password_scheme VARCHAR(50) NULL;
ALTER TABLE users MODIFY COLUMN password_scheme VARCHAR(50) NULL;

-- 2. Ensure is_demo column exists in auth_sessions
ALTER TABLE auth_sessions ADD COLUMN is_demo BOOLEAN DEFAULT FALSE;

-- 3. Ensure users table email has unique index (if not already unique)
-- Note: MySQL enforces uniqueness on email column; application normalizes email to lowercase.

-- 4. Backfill password_scheme for existing users based on hash format characteristics:
-- a) Scrypt format: starts with 'scrypt:$' -> 'scrypt'
UPDATE users 
SET password_scheme = 'scrypt' 
WHERE password_hash LIKE 'scrypt:%';

-- b) Legacy PBKDF2 format: 128 hex characters -> 'pbkdf2_sha512_10000_v1'
UPDATE users 
SET password_scheme = 'pbkdf2_sha512_10000_v1' 
WHERE LENGTH(password_hash) = 128 
  AND password_hash NOT LIKE 'scrypt:%';

-- c) Legacy SHA256 format: 64 hex characters or salt:hash combination -> 'sha256_legacy'
UPDATE users 
SET password_scheme = 'sha256_legacy' 
WHERE (LENGTH(password_hash) = 64 OR password_hash LIKE '%:%') 
  AND password_hash NOT LIKE 'scrypt:%' 
  AND LENGTH(password_hash) != 128;

-- d) Any remaining unrecognized format -> 'legacy_unknown' (requires password reset)
UPDATE users 
SET password_scheme = 'legacy_unknown' 
WHERE password_scheme IS NULL OR password_scheme = '';

-- 5. Optimize session retrieval index for active unrevoked sessions
ALTER TABLE auth_sessions ADD INDEX idx_session_lookup (token_hash, revoked_at, expires_at);
