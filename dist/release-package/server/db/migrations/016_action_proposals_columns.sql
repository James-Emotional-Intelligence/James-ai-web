-- JAMI AI Database Schema Migration 016: Action Proposals Columns Reconciliation
-- Forward-only migration to ensure all columns exist on jami_action_proposals

ALTER TABLE jami_action_proposals ADD COLUMN action_type VARCHAR(50) NOT NULL DEFAULT 'reschedule_task';
ALTER TABLE jami_action_proposals ADD COLUMN arguments_json JSON NULL;
ALTER TABLE jami_action_proposals ADD COLUMN preview_json JSON NULL;
ALTER TABLE jami_action_proposals ADD COLUMN idempotency_key VARCHAR(64) NULL;
ALTER TABLE jami_action_proposals ADD COLUMN error_code VARCHAR(50) NULL;
