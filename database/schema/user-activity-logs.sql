-- User Activity Logs Table
-- Comprehensive logging system for user management activities

-- Create user_activity_logs table
CREATE TABLE IF NOT EXISTS user_activity_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    session_id UUID,
    performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_action ON user_activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON user_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_performed_by ON user_activity_logs(performed_by);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_action_date 
ON user_activity_logs(user_id, action, created_at DESC);

-- Enable Row Level Security
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_activity_logs

-- Policy: Users can view their own activity logs
CREATE POLICY "Users can view own activity logs"
ON user_activity_logs
FOR SELECT
USING (
    auth.uid() = user_id
    OR
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
);

-- Policy: Only admins can view all activity logs
CREATE POLICY "Admins can view all activity logs"
ON user_activity_logs
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
);

-- Policy: System can insert activity logs
CREATE POLICY "System can insert activity logs"
ON user_activity_logs
FOR INSERT
TO authenticated
WITH CHECK (
    -- Allow service role to insert
    auth.jwt() ->> 'role' = 'service_role'
    OR
    -- Allow authenticated users to log their own activities
    auth.uid() = user_id
    OR
    -- Allow admins to log activities
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
    )
);

-- Policy: No updates or deletes allowed (immutable log)
CREATE POLICY "No updates allowed on activity logs"
ON user_activity_logs
FOR UPDATE
TO authenticated
USING (FALSE);

CREATE POLICY "No deletes allowed on activity logs"
ON user_activity_logs
FOR DELETE
TO authenticated
USING (FALSE);

-- Create function to automatically log profile updates
CREATE OR REPLACE FUNCTION log_profile_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if there are actual changes
    IF OLD IS DISTINCT FROM NEW THEN
        INSERT INTO user_activity_logs (
            user_id,
            action,
            details,
            performed_by
        ) VALUES (
            NEW.id,
            'profile_updated',
            jsonb_build_object(
                'old_values', to_jsonb(OLD),
                'new_values', to_jsonb(NEW),
                'changed_fields', (
                    SELECT jsonb_object_agg(key, value)
                    FROM jsonb_each(to_jsonb(NEW))
                    WHERE to_jsonb(OLD) ->> key IS DISTINCT FROM value::text
                )
            ),
            auth.uid()
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for profile updates
DROP TRIGGER IF EXISTS trigger_log_profile_update ON profiles;
CREATE TRIGGER trigger_log_profile_update
    AFTER UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION log_profile_update();

-- Create function to log authentication events
CREATE OR REPLACE FUNCTION log_auth_event()
RETURNS TRIGGER AS $$
BEGIN
    -- Log sign in events
    IF TG_OP = 'UPDATE' AND OLD.last_sign_in IS DISTINCT FROM NEW.last_sign_in THEN
        INSERT INTO user_activity_logs (
            user_id,
            action,
            details
        ) VALUES (
            NEW.id,
            'sign_in',
            jsonb_build_object(
                'timestamp', NEW.last_sign_in,
                'previous_sign_in', OLD.last_sign_in
            )
        );
    END IF;
    
    -- Log email confirmation events
    IF TG_OP = 'UPDATE' AND OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at THEN
        INSERT INTO user_activity_logs (
            user_id,
            action,
            details
        ) VALUES (
            NEW.id,
            'email_confirmed',
            jsonb_build_object(
                'confirmed_at', NEW.email_confirmed_at
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for auth events
DROP TRIGGER IF EXISTS trigger_log_auth_event ON auth.users;
CREATE TRIGGER trigger_log_auth_event
    AFTER UPDATE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION log_auth_event();

-- Create function to get user activity summary
CREATE OR REPLACE FUNCTION get_user_activity_summary(
    target_user_id UUID,
    days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
    action VARCHAR(100),
    count BIGINT,
    first_occurrence TIMESTAMPTZ,
    last_occurrence TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ual.action,
        COUNT(*) as count,
        MIN(ual.created_at) as first_occurrence,
        MAX(ual.created_at) as last_occurrence
    FROM user_activity_logs ual
    WHERE ual.user_id = target_user_id
        AND ual.created_at >= NOW() - (days_back || ' days')::INTERVAL
    GROUP BY ual.action
    ORDER BY last_occurrence DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get admin activity dashboard
CREATE OR REPLACE FUNCTION get_admin_activity_dashboard(
    days_back INTEGER DEFAULT 7
)
RETURNS TABLE (
    date DATE,
    total_activities BIGINT,
    unique_users BIGINT,
    sign_ins BIGINT,
    profile_updates BIGINT,
    admin_actions BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ual.created_at::DATE as date,
        COUNT(*) as total_activities,
        COUNT(DISTINCT ual.user_id) as unique_users,
        COUNT(*) FILTER (WHERE ual.action = 'sign_in') as sign_ins,
        COUNT(*) FILTER (WHERE ual.action = 'profile_updated') as profile_updates,
        COUNT(*) FILTER (WHERE ual.action IN ('role_changed', 'status_changed', 'user_deleted')) as admin_actions
    FROM user_activity_logs ual
    WHERE ual.created_at >= NOW() - (days_back || ' days')::INTERVAL
    GROUP BY ual.created_at::DATE
    ORDER BY date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON user_activity_logs TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_activity_summary(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_activity_dashboard(INTEGER) TO authenticated;

-- Create view for recent user activities (for dashboard)
CREATE OR REPLACE VIEW recent_user_activities AS
SELECT 
    ual.id,
    ual.user_id,
    ual.action,
    ual.details,
    ual.created_at,
    p.name as user_name,
    p.email as user_email,
    performed_p.name as performed_by_name
FROM user_activity_logs ual
LEFT JOIN profiles p ON ual.user_id = p.id
LEFT JOIN profiles performed_p ON ual.performed_by = performed_p.id
WHERE ual.created_at >= NOW() - INTERVAL '24 hours'
ORDER BY ual.created_at DESC;

-- Grant access to the view
GRANT SELECT ON recent_user_activities TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE user_activity_logs IS 'Comprehensive audit log for all user management activities';
COMMENT ON COLUMN user_activity_logs.action IS 'Type of action performed (sign_in, profile_updated, etc.)';
COMMENT ON COLUMN user_activity_logs.details IS 'JSON details about the action performed';
COMMENT ON COLUMN user_activity_logs.performed_by IS 'User ID who performed the action (for admin actions)';
COMMENT ON FUNCTION get_user_activity_summary(UUID, INTEGER) IS 'Get activity summary for a specific user';
COMMENT ON FUNCTION get_admin_activity_dashboard(INTEGER) IS 'Get admin dashboard activity metrics';
COMMENT ON VIEW recent_user_activities IS 'Recent user activities for dashboard display';