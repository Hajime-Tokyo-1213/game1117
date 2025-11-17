-- Migration: Create advanced users table with enterprise features
-- Version: 006
-- Author: Development Team
-- Date: 2024-01-15
-- Description: Enterprise-grade user management with RLS, audit, and advanced security
-- Rollback: rollback/006_advanced_users_table.down.sql

BEGIN;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create custom types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('customer', 'staff', 'manager', 'admin', 'super_admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('pending', 'active', 'suspended', 'deleted');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Advanced users table with enterprise features
CREATE TABLE IF NOT EXISTS users_advanced (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    email_normalized VARCHAR(255) GENERATED ALWAYS AS (lower(email)) STORED,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at TIMESTAMP WITH TIME ZONE,
    
    -- Authentication
    password_hash VARCHAR(255) NOT NULL,
    password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    password_history JSONB DEFAULT '[]'::jsonb,
    
    -- User role and status
    role user_role DEFAULT 'customer',
    status user_status DEFAULT 'pending',
    
    -- Profile information
    username VARCHAR(50) UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    phone_verified BOOLEAN DEFAULT FALSE,
    phone_verified_at TIMESTAMP WITH TIME ZONE,
    
    -- Location and preferences
    country_code CHAR(2) DEFAULT 'JP',
    language_code VARCHAR(5) DEFAULT 'ja',
    timezone VARCHAR(50) DEFAULT 'Asia/Tokyo',
    currency_code CHAR(3) DEFAULT 'JPY',
    
    -- Multi-factor authentication
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret VARCHAR(255),
    two_factor_backup_codes TEXT[],
    two_factor_last_used TIMESTAMP WITH TIME ZONE,
    
    -- Security tracking
    last_login_at TIMESTAMP WITH TIME ZONE,
    last_login_ip INET,
    last_login_user_agent TEXT,
    last_activity_at TIMESTAMP WITH TIME ZONE,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    lock_reason TEXT,
    
    -- Compliance and consent
    terms_accepted_at TIMESTAMP WITH TIME ZONE,
    privacy_accepted_at TIMESTAMP WITH TIME ZONE,
    marketing_consent BOOLEAN DEFAULT FALSE,
    data_retention_consent BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    metadata JSONB DEFAULT '{}'::jsonb,
    search_vector tsvector,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_by UUID,
    updated_by UUID,
    deleted_by UUID,
    
    -- Constraints
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT valid_phone CHECK (phone IS NULL OR phone ~ '^\+?[0-9\s\-\(\)]+$'),
    CONSTRAINT valid_username CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,50}$')
);

-- High-performance indexes
CREATE INDEX idx_users_email_normalized ON users_advanced(email_normalized) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_username ON users_advanced(username) WHERE deleted_at IS NULL AND username IS NOT NULL;
CREATE INDEX idx_users_role_status ON users_advanced(role, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_country_language ON users_advanced(country_code, language_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_last_login ON users_advanced(last_login_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_created_at ON users_advanced(created_at DESC);

-- Full-text search indexes
CREATE INDEX idx_users_search_vector ON users_advanced USING GIN(search_vector);
CREATE INDEX idx_users_tags ON users_advanced USING GIN(tags);
CREATE INDEX idx_users_metadata ON users_advanced USING GIN(metadata);

-- Partial indexes for common queries
CREATE INDEX idx_active_users ON users_advanced(id, email) 
    WHERE deleted_at IS NULL AND status = 'active' AND email_verified = TRUE;
    
CREATE INDEX idx_locked_users ON users_advanced(locked_until) 
    WHERE locked_until IS NOT NULL AND locked_until > CURRENT_TIMESTAMP;

-- Update search vector trigger
CREATE OR REPLACE FUNCTION update_users_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := 
        setweight(to_tsvector('english', COALESCE(NEW.display_name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.first_name, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.last_name, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.email, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_users_search_vector
    BEFORE INSERT OR UPDATE OF display_name, first_name, last_name, email
    ON users_advanced
    FOR EACH ROW
    EXECUTE FUNCTION update_users_search_vector();

-- Automatic updated_at trigger
CREATE TRIGGER trigger_update_users_updated_at
    BEFORE UPDATE ON users_advanced
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- User sessions table for JWT management
CREATE TABLE IF NOT EXISTS user_sessions_advanced (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users_advanced(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    refresh_token_hash VARCHAR(64),
    
    -- Session information
    session_type VARCHAR(20) DEFAULT 'web',
    ip_address INET NOT NULL,
    user_agent TEXT,
    device_id VARCHAR(255),
    device_name VARCHAR(255),
    
    -- Geolocation
    country_code CHAR(2),
    city VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Validity
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    refresh_expires_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoke_reason TEXT,
    
    CONSTRAINT valid_expiry CHECK (expires_at > created_at),
    CONSTRAINT valid_refresh_expiry CHECK (refresh_expires_at IS NULL OR refresh_expires_at > expires_at)
);

CREATE INDEX idx_sessions_user_id ON user_sessions_advanced(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_token_hash ON user_sessions_advanced(token_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_expires_at ON user_sessions_advanced(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_device_id ON user_sessions_advanced(device_id) WHERE device_id IS NOT NULL;

-- User audit log table
CREATE TABLE IF NOT EXISTS users_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    
    -- Change tracking
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    
    -- Context
    performed_by UUID,
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT,
    request_id UUID,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_users_audit_user_id ON users_audit_log(user_id);
CREATE INDEX idx_users_audit_action ON users_audit_log(action);
CREATE INDEX idx_users_audit_performed_at ON users_audit_log(performed_at DESC);
CREATE INDEX idx_users_audit_performed_by ON users_audit_log(performed_by) WHERE performed_by IS NOT NULL;

-- Row Level Security (RLS)
ALTER TABLE users_advanced ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data (unless admin)
CREATE POLICY users_select_own ON users_advanced
    FOR SELECT
    USING (
        id = current_setting('app.current_user_id', true)::UUID OR
        current_setting('app.current_user_role', true) IN ('admin', 'super_admin')
    );

-- Users can only update their own data (unless admin)
CREATE POLICY users_update_own ON users_advanced
    FOR UPDATE
    USING (
        id = current_setting('app.current_user_id', true)::UUID OR
        current_setting('app.current_user_role', true) IN ('admin', 'super_admin')
    );

-- Only admins can insert new users
CREATE POLICY users_insert_admin ON users_advanced
    FOR INSERT
    WITH CHECK (
        current_setting('app.current_user_role', true) IN ('admin', 'super_admin')
    );

-- Soft delete (only admins)
CREATE POLICY users_delete_admin ON users_advanced
    FOR DELETE
    USING (
        current_setting('app.current_user_role', true) = 'super_admin'
    );

-- Create audit trigger
CREATE OR REPLACE FUNCTION audit_users_changes()
RETURNS TRIGGER AS $$
DECLARE
    changed_fields TEXT[];
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Get list of changed fields
        SELECT array_agg(key) INTO changed_fields
        FROM jsonb_each(to_jsonb(NEW)) AS n(key, value)
        JOIN jsonb_each(to_jsonb(OLD)) AS o(key, value) ON n.key = o.key
        WHERE n.value IS DISTINCT FROM o.value;
        
        INSERT INTO users_audit_log (
            user_id,
            action,
            old_values,
            new_values,
            changed_fields,
            performed_by,
            ip_address,
            user_agent
        ) VALUES (
            NEW.id,
            'UPDATE',
            to_jsonb(OLD),
            to_jsonb(NEW),
            changed_fields,
            current_setting('app.current_user_id', true)::UUID,
            inet_client_addr(),
            current_setting('app.user_agent', true)
        );
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO users_audit_log (
            user_id,
            action,
            new_values,
            performed_by
        ) VALUES (
            NEW.id,
            'INSERT',
            to_jsonb(NEW),
            current_setting('app.current_user_id', true)::UUID
        );
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO users_audit_log (
            user_id,
            action,
            old_values,
            performed_by
        ) VALUES (
            OLD.id,
            'DELETE',
            to_jsonb(OLD),
            current_setting('app.current_user_id', true)::UUID
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_audit_users
    AFTER INSERT OR UPDATE OR DELETE ON users_advanced
    FOR EACH ROW
    EXECUTE FUNCTION audit_users_changes();

-- Add comments for documentation
COMMENT ON TABLE users_advanced IS 'Enterprise-grade user management table with advanced security and audit features';
COMMENT ON COLUMN users_advanced.email_normalized IS 'Normalized email for case-insensitive uniqueness';
COMMENT ON COLUMN users_advanced.password_history IS 'JSON array of previous password hashes to prevent reuse';
COMMENT ON COLUMN users_advanced.search_vector IS 'Full-text search vector for user search functionality';

COMMIT;