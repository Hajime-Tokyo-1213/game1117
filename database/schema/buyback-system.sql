-- Buyback Request Management System Schema
-- Comprehensive multi-store, multi-auth buyback system

-- Create stores table (multi-store support)
CREATE TABLE IF NOT EXISTS stores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    postal_code VARCHAR(10),
    phone VARCHAR(20),
    email VARCHAR(255),
    opening_hours JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create buyback requests table (comprehensive)
CREATE TABLE IF NOT EXISTS buyback_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    request_number VARCHAR(50) UNIQUE NOT NULL, -- Auto-generated request number
    
    -- Customer information (flexible requirements)
    customer_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    postal_code VARCHAR(10),
    preferred_contact_method VARCHAR(20) DEFAULT 'email', -- email, phone, line
    
    -- Authentication information (multi-auth support)
    auth_method VARCHAR(50) DEFAULT 'guest', -- guest, email, google, line, phone
    auth_identifier VARCHAR(255), -- Authentication ID
    verification_token VARCHAR(255),
    verified_at TIMESTAMPTZ,
    
    -- Product information (detailed)
    items_description JSONB NOT NULL,
    item_categories VARCHAR[],
    total_items_count INT DEFAULT 0,
    estimated_total_value DECIMAL(10,2) DEFAULT 0,
    
    -- Application information
    application_type VARCHAR(50) DEFAULT 'online', -- online, in_store, phone
    preferred_store_id UUID REFERENCES stores(id),
    preferred_pickup_date DATE,
    preferred_pickup_time TIME,
    
    -- Status management
    status VARCHAR(50) DEFAULT 'draft', -- draft, submitted, reviewing, appraised, approved, rejected, completed, cancelled
    priority_level VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
    
    -- Staff information
    assigned_staff_id UUID REFERENCES auth.users(id),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    
    -- Additional information
    internal_notes TEXT,
    customer_notes TEXT,
    attachment_urls TEXT[], -- Product image URL array
    communication_history JSONB DEFAULT '[]'::jsonb,
    
    -- System information
    ip_address INET,
    user_agent TEXT,
    referrer_url TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create buyback appraisals table
CREATE TABLE IF NOT EXISTS buyback_appraisals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id UUID REFERENCES buyback_requests(id) ON DELETE CASCADE,
    item_name VARCHAR(255) NOT NULL,
    item_condition VARCHAR(50),
    market_value DECIMAL(10,2),
    appraised_value DECIMAL(10,2),
    appraisal_notes TEXT,
    appraiser_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_buyback_requests_status ON buyback_requests(status);
CREATE INDEX IF NOT EXISTS idx_buyback_requests_email ON buyback_requests(email);
CREATE INDEX IF NOT EXISTS idx_buyback_requests_phone ON buyback_requests(phone);
CREATE INDEX IF NOT EXISTS idx_buyback_requests_auth ON buyback_requests(auth_method, auth_identifier);
CREATE INDEX IF NOT EXISTS idx_buyback_requests_store ON buyback_requests(preferred_store_id);
CREATE INDEX IF NOT EXISTS idx_buyback_requests_created_at ON buyback_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_buyback_requests_number ON buyback_requests(request_number);
CREATE INDEX IF NOT EXISTS idx_buyback_requests_priority ON buyback_requests(priority_level);
CREATE INDEX IF NOT EXISTS idx_buyback_requests_assigned_staff ON buyback_requests(assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_buyback_appraisals_request ON buyback_appraisals(request_id);
CREATE INDEX IF NOT EXISTS idx_stores_active ON stores(is_active);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_buyback_requests_store_status ON buyback_requests(preferred_store_id, status);
CREATE INDEX IF NOT EXISTS idx_buyback_requests_status_created ON buyback_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_buyback_requests_staff_status ON buyback_requests(assigned_staff_id, status);

-- Add constraints
ALTER TABLE buyback_requests ADD CONSTRAINT chk_buyback_requests_preferred_contact 
    CHECK (preferred_contact_method IN ('email', 'phone', 'line', 'sms'));

ALTER TABLE buyback_requests ADD CONSTRAINT chk_buyback_requests_auth_method 
    CHECK (auth_method IN ('guest', 'email', 'google', 'line', 'phone', 'facebook', 'apple'));

ALTER TABLE buyback_requests ADD CONSTRAINT chk_buyback_requests_application_type 
    CHECK (application_type IN ('online', 'in_store', 'phone', 'mobile_app'));

ALTER TABLE buyback_requests ADD CONSTRAINT chk_buyback_requests_status 
    CHECK (status IN ('draft', 'submitted', 'reviewing', 'appraised', 'approved', 'rejected', 'completed', 'cancelled'));

ALTER TABLE buyback_requests ADD CONSTRAINT chk_buyback_requests_priority 
    CHECK (priority_level IN ('low', 'normal', 'high', 'urgent'));

ALTER TABLE buyback_requests ADD CONSTRAINT chk_buyback_requests_values 
    CHECK (estimated_total_value >= 0 AND total_items_count >= 0);

ALTER TABLE buyback_appraisals ADD CONSTRAINT chk_buyback_appraisals_values 
    CHECK (market_value >= 0 AND appraised_value >= 0);

-- Request number auto-generation function
CREATE OR REPLACE FUNCTION generate_request_number()
RETURNS TEXT AS $$
DECLARE
    new_number TEXT;
    counter INT;
    date_part TEXT;
BEGIN
    date_part := TO_CHAR(NOW(), 'YYYYMMDD');
    
    -- Get daily counter
    SELECT COALESCE(MAX(
        CASE 
            WHEN request_number LIKE 'BR' || date_part || '-%' 
            THEN CAST(SUBSTRING(request_number FROM LENGTH('BR' || date_part || '-') + 1) AS INTEGER)
            ELSE 0
        END
    ), 0) + 1 INTO counter
    FROM buyback_requests
    WHERE request_number LIKE 'BR' || date_part || '-%';
    
    new_number := 'BR' || date_part || '-' || LPAD(counter::TEXT, 4, '0');
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to set request number and updated_at
CREATE OR REPLACE FUNCTION set_buyback_request_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- Set request number if not provided
    IF NEW.request_number IS NULL THEN
        NEW.request_number := generate_request_number();
    END IF;
    
    -- Always update the updated_at timestamp
    NEW.updated_at := NOW();
    
    -- Auto-calculate total items count if items_description is provided
    IF NEW.items_description IS NOT NULL THEN
        NEW.total_items_count := jsonb_array_length(NEW.items_description);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for buyback requests
DROP TRIGGER IF EXISTS tr_buyback_requests_set_fields ON buyback_requests;
CREATE TRIGGER tr_buyback_requests_set_fields
    BEFORE INSERT OR UPDATE ON buyback_requests
    FOR EACH ROW EXECUTE FUNCTION set_buyback_request_fields();

-- Trigger function to update updated_at for stores
CREATE OR REPLACE FUNCTION update_stores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for stores
DROP TRIGGER IF EXISTS tr_stores_update_timestamp ON stores;
CREATE TRIGGER tr_stores_update_timestamp
    BEFORE UPDATE ON stores
    FOR EACH ROW EXECUTE FUNCTION update_stores_updated_at();

-- Function to get buyback request statistics
CREATE OR REPLACE FUNCTION get_buyback_stats(
    store_id_filter UUID DEFAULT NULL,
    date_from TIMESTAMPTZ DEFAULT NULL,
    date_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    total_requests BIGINT,
    pending_requests BIGINT,
    approved_requests BIGINT,
    completed_requests BIGINT,
    rejected_requests BIGINT,
    avg_estimated_value DECIMAL,
    total_estimated_value DECIMAL,
    avg_processing_days DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_requests,
        COUNT(CASE WHEN br.status IN ('submitted', 'reviewing') THEN 1 END) as pending_requests,
        COUNT(CASE WHEN br.status = 'approved' THEN 1 END) as approved_requests,
        COUNT(CASE WHEN br.status = 'completed' THEN 1 END) as completed_requests,
        COUNT(CASE WHEN br.status = 'rejected' THEN 1 END) as rejected_requests,
        AVG(br.estimated_total_value) as avg_estimated_value,
        SUM(br.estimated_total_value) as total_estimated_value,
        AVG(
            CASE 
                WHEN br.reviewed_at IS NOT NULL 
                THEN EXTRACT(DAYS FROM br.reviewed_at - br.created_at)
                ELSE NULL
            END
        ) as avg_processing_days
    FROM buyback_requests br
    WHERE 
        (store_id_filter IS NULL OR br.preferred_store_id = store_id_filter)
        AND (date_from IS NULL OR br.created_at >= date_from)
        AND (date_to IS NULL OR br.created_at <= date_to);
END;
$$ LANGUAGE plpgsql;

-- Function to get daily buyback trends
CREATE OR REPLACE FUNCTION get_buyback_trends(
    days_back INTEGER DEFAULT 30,
    store_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
    date DATE,
    requests_count BIGINT,
    total_value DECIMAL,
    approved_count BIGINT,
    completed_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        br.created_at::DATE as date,
        COUNT(*) as requests_count,
        COALESCE(SUM(br.estimated_total_value), 0) as total_value,
        COUNT(CASE WHEN br.status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN br.status = 'completed' THEN 1 END) as completed_count
    FROM buyback_requests br
    WHERE 
        br.created_at >= NOW() - (days_back || ' days')::INTERVAL
        AND (store_id_filter IS NULL OR br.preferred_store_id = store_id_filter)
    GROUP BY br.created_at::DATE
    ORDER BY date DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get top categories
CREATE OR REPLACE FUNCTION get_top_buyback_categories(
    limit_count INTEGER DEFAULT 10,
    days_back INTEGER DEFAULT 30,
    store_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
    category TEXT,
    requests_count BIGINT,
    avg_value DECIMAL,
    total_value DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        UNNEST(br.item_categories) as category,
        COUNT(*) as requests_count,
        AVG(br.estimated_total_value) as avg_value,
        SUM(br.estimated_total_value) as total_value
    FROM buyback_requests br
    WHERE 
        br.item_categories IS NOT NULL 
        AND br.created_at >= NOW() - (days_back || ' days')::INTERVAL
        AND (store_id_filter IS NULL OR br.preferred_store_id = store_id_filter)
    GROUP BY UNNEST(br.item_categories)
    ORDER BY requests_count DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Create view for buyback request summary
CREATE OR REPLACE VIEW buyback_request_summary AS
SELECT 
    br.id,
    br.request_number,
    br.customer_name,
    br.email,
    br.phone,
    br.status,
    br.priority_level,
    br.total_items_count,
    br.estimated_total_value,
    br.preferred_store_id,
    s.name as store_name,
    br.assigned_staff_id,
    staff.raw_user_meta_data->>'name' as staff_name,
    br.created_at,
    br.updated_at,
    COALESCE(
        (SELECT SUM(ba.appraised_value) FROM buyback_appraisals ba WHERE ba.request_id = br.id),
        0
    ) as total_appraised_value,
    (
        SELECT COUNT(*) FROM buyback_appraisals ba WHERE ba.request_id = br.id
    ) as appraisal_count
FROM buyback_requests br
LEFT JOIN stores s ON br.preferred_store_id = s.id
LEFT JOIN auth.users staff ON br.assigned_staff_id = staff.id
WHERE br.status != 'draft';

-- Create view for pending requests dashboard
CREATE OR REPLACE VIEW pending_buyback_requests AS
SELECT 
    br.*,
    s.name as store_name,
    staff.raw_user_meta_data->>'name' as staff_name,
    EXTRACT(DAYS FROM NOW() - br.created_at) as days_pending
FROM buyback_requests br
LEFT JOIN stores s ON br.preferred_store_id = s.id
LEFT JOIN auth.users staff ON br.assigned_staff_id = staff.id
WHERE br.status IN ('submitted', 'reviewing')
ORDER BY 
    CASE br.priority_level
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
        WHEN 'low' THEN 4
    END,
    br.created_at ASC;

-- Insert sample store data
INSERT INTO stores (name, address, postal_code, phone, email, opening_hours) VALUES
('本店', '東京都渋谷区渋谷1-1-1', '150-0002', '03-1234-5678', 'honten@gamestore.jp', 
 '{"monday": "10:00-20:00", "tuesday": "10:00-20:00", "wednesday": "10:00-20:00", "thursday": "10:00-20:00", "friday": "10:00-20:00", "saturday": "10:00-21:00", "sunday": "11:00-19:00"}'::jsonb),
('新宿店', '東京都新宿区新宿3-3-3', '160-0022', '03-2345-6789', 'shinjuku@gamestore.jp',
 '{"monday": "10:00-20:00", "tuesday": "10:00-20:00", "wednesday": "10:00-20:00", "thursday": "10:00-20:00", "friday": "10:00-20:00", "saturday": "10:00-21:00", "sunday": "11:00-19:00"}'::jsonb),
('池袋店', '東京都豊島区南池袋1-2-3', '171-0022', '03-3456-7890', 'ikebukuro@gamestore.jp',
 '{"monday": "10:00-20:00", "tuesday": "10:00-20:00", "wednesday": "10:00-20:00", "thursday": "10:00-20:00", "friday": "10:00-20:00", "saturday": "10:00-21:00", "sunday": "11:00-19:00"}'::jsonb)
ON CONFLICT DO NOTHING;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON buyback_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON buyback_appraisals TO authenticated;
GRANT SELECT ON stores TO authenticated;
GRANT SELECT ON buyback_request_summary TO authenticated;
GRANT SELECT ON pending_buyback_requests TO authenticated;
GRANT EXECUTE ON FUNCTION get_buyback_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_buyback_trends(INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_top_buyback_categories(INTEGER, INTEGER, UUID) TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE stores IS 'Store locations and information for multi-store buyback support';
COMMENT ON TABLE buyback_requests IS 'Comprehensive buyback request management with multi-auth support';
COMMENT ON TABLE buyback_appraisals IS 'Individual item appraisals for buyback requests';
COMMENT ON FUNCTION generate_request_number() IS 'Auto-generate unique request numbers in BR{YYYYMMDD}-{NNNN} format';
COMMENT ON FUNCTION get_buyback_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS 'Get comprehensive buyback statistics';
COMMENT ON FUNCTION get_buyback_trends(INTEGER, UUID) IS 'Get daily buyback request trends';
COMMENT ON FUNCTION get_top_buyback_categories(INTEGER, INTEGER, UUID) IS 'Get most popular buyback categories';
COMMENT ON VIEW buyback_request_summary IS 'Summary view of buyback requests with store and staff information';
COMMENT ON VIEW pending_buyback_requests IS 'Priority-ordered view of pending buyback requests';