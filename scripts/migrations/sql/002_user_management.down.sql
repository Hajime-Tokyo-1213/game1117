-- Rollback script for 002_user_management.sql

-- Drop indexes
DROP INDEX IF EXISTS idx_activity_logs_created;
DROP INDEX IF EXISTS idx_activity_logs_resource;
DROP INDEX IF EXISTS idx_activity_logs_action;
DROP INDEX IF EXISTS idx_activity_logs_user;

DROP INDEX IF EXISTS idx_user_roles_role;
DROP INDEX IF EXISTS idx_user_roles_user;

DROP INDEX IF EXISTS idx_email_verification_token;
DROP INDEX IF EXISTS idx_email_verification_user;

DROP INDEX IF EXISTS idx_password_reset_expires;
DROP INDEX IF EXISTS idx_password_reset_token;
DROP INDEX IF EXISTS idx_password_reset_user;

DROP INDEX IF EXISTS idx_sessions_active;
DROP INDEX IF EXISTS idx_sessions_expires;
DROP INDEX IF EXISTS idx_sessions_token;
DROP INDEX IF EXISTS idx_sessions_user_id;

DROP INDEX IF EXISTS idx_users_tags;
DROP INDEX IF EXISTS idx_users_last_activity;
DROP INDEX IF EXISTS idx_users_email_verified;
DROP INDEX IF EXISTS idx_users_country;
DROP INDEX IF EXISTS idx_users_company;
DROP INDEX IF EXISTS idx_users_postal_code;
DROP INDEX IF EXISTS idx_users_phone;

-- Drop tables
DROP TABLE IF EXISTS user_notification_settings CASCADE;
DROP TABLE IF EXISTS user_activity_logs CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS email_verification_tokens CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;

-- Remove columns added to users table
ALTER TABLE users 
DROP COLUMN IF EXISTS phone,
DROP COLUMN IF EXISTS address,
DROP COLUMN IF EXISTS postal_code,
DROP COLUMN IF EXISTS company_name,
DROP COLUMN IF EXISTS department,
DROP COLUMN IF EXISTS country,
DROP COLUMN IF EXISTS language,
DROP COLUMN IF EXISTS timezone,
DROP COLUMN IF EXISTS avatar_url,
DROP COLUMN IF EXISTS email_verified,
DROP COLUMN IF EXISTS email_verified_at,
DROP COLUMN IF EXISTS password_changed_at,
DROP COLUMN IF EXISTS failed_login_attempts,
DROP COLUMN IF EXISTS locked_until,
DROP COLUMN IF EXISTS deactivated_at,
DROP COLUMN IF EXISTS last_activity_at,
DROP COLUMN IF EXISTS preferences,
DROP COLUMN IF EXISTS tags;