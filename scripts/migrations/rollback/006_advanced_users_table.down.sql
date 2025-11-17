-- Rollback for: Create advanced users table with enterprise features
-- Version: 006
-- Author: Development Team  
-- Date: 2024-01-15
-- Migration: sql/006_advanced_users_table.sql

BEGIN;

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_audit_users ON users_advanced;
DROP TRIGGER IF EXISTS trigger_update_users_search_vector ON users_advanced;
DROP TRIGGER IF EXISTS trigger_update_users_updated_at ON users_advanced;

-- Drop functions
DROP FUNCTION IF EXISTS audit_users_changes();
DROP FUNCTION IF EXISTS update_users_search_vector();

-- Drop policies
DROP POLICY IF EXISTS users_select_own ON users_advanced;
DROP POLICY IF EXISTS users_update_own ON users_advanced;
DROP POLICY IF EXISTS users_insert_admin ON users_advanced;
DROP POLICY IF EXISTS users_delete_admin ON users_advanced;

-- Drop indexes
DROP INDEX IF EXISTS idx_users_audit_performed_by;
DROP INDEX IF EXISTS idx_users_audit_performed_at;
DROP INDEX IF EXISTS idx_users_audit_action;
DROP INDEX IF EXISTS idx_users_audit_user_id;

DROP INDEX IF EXISTS idx_sessions_device_id;
DROP INDEX IF EXISTS idx_sessions_expires_at;
DROP INDEX IF EXISTS idx_sessions_token_hash;
DROP INDEX IF EXISTS idx_sessions_user_id;

DROP INDEX IF EXISTS idx_locked_users;
DROP INDEX IF EXISTS idx_active_users;
DROP INDEX IF EXISTS idx_users_metadata;
DROP INDEX IF EXISTS idx_users_tags;
DROP INDEX IF EXISTS idx_users_search_vector;
DROP INDEX IF EXISTS idx_users_created_at;
DROP INDEX IF EXISTS idx_users_last_login;
DROP INDEX IF EXISTS idx_users_country_language;
DROP INDEX IF EXISTS idx_users_role_status;
DROP INDEX IF EXISTS idx_users_username;
DROP INDEX IF EXISTS idx_users_email_normalized;

-- Drop tables
DROP TABLE IF EXISTS users_audit_log CASCADE;
DROP TABLE IF EXISTS user_sessions_advanced CASCADE;
DROP TABLE IF EXISTS users_advanced CASCADE;

-- Drop custom types
DROP TYPE IF EXISTS user_status;
DROP TYPE IF EXISTS user_role;

COMMIT;