-- Inventory Management Database Schema
-- Tables for products and stock movements

-- Create products table (if not exists)
CREATE TABLE IF NOT EXISTS products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    model VARCHAR(255),
    manufacturer VARCHAR(255),
    condition_grade VARCHAR(10) DEFAULT 'B',
    purchase_price DECIMAL(10,2) DEFAULT 0,
    selling_price DECIMAL(10,2) DEFAULT 0,
    stock_quantity INTEGER DEFAULT 0,
    zaico_item_id VARCHAR(50) UNIQUE,
    zaico_data JSONB,
    description TEXT,
    barcode VARCHAR(50),
    location VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    deleted_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Create stock_movements table
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    movement_type VARCHAR(20) NOT NULL, -- 'in', 'out', 'adjustment', 'transfer', 'return', 'damage', 'lost'
    quantity_change INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reason VARCHAR(255),
    reference_id UUID, -- Reference to related transaction/order
    reference_type VARCHAR(50), -- 'purchase', 'sale', 'adjustment', etc.
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_manufacturer ON products(manufacturer);
CREATE INDEX IF NOT EXISTS idx_products_condition_grade ON products(condition_grade);
CREATE INDEX IF NOT EXISTS idx_products_stock_quantity ON products(stock_quantity);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_zaico_item_id ON products(zaico_item_id);
CREATE INDEX IF NOT EXISTS idx_products_name_search ON products USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_products_model_search ON products USING gin(to_tsvector('english', model));

-- Stock movements indexes
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_movement_type ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_id, reference_type);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_products_category_status ON products(category, status);
CREATE INDEX IF NOT EXISTS idx_products_manufacturer_status ON products(manufacturer, status);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_type_date ON stock_movements(product_id, movement_type, created_at DESC);

-- Add constraints
ALTER TABLE products ADD CONSTRAINT chk_products_condition_grade 
    CHECK (condition_grade IN ('S', 'A', 'B', 'C', 'D', 'JUNK'));

ALTER TABLE products ADD CONSTRAINT chk_products_status 
    CHECK (status IN ('active', 'inactive', 'deleted', 'discontinued'));

ALTER TABLE products ADD CONSTRAINT chk_products_prices 
    CHECK (purchase_price >= 0 AND selling_price >= 0);

ALTER TABLE products ADD CONSTRAINT chk_products_stock_quantity 
    CHECK (stock_quantity >= 0);

ALTER TABLE stock_movements ADD CONSTRAINT chk_stock_movements_movement_type 
    CHECK (movement_type IN ('in', 'out', 'adjustment', 'transfer', 'return', 'damage', 'lost'));

-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for products table
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to log stock movements
CREATE OR REPLACE FUNCTION log_stock_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if stock_quantity changed
    IF OLD.stock_quantity IS DISTINCT FROM NEW.stock_quantity THEN
        INSERT INTO stock_movements (
            product_id,
            movement_type,
            quantity_change,
            previous_quantity,
            new_quantity,
            reason,
            notes,
            created_by
        ) VALUES (
            NEW.id,
            CASE 
                WHEN NEW.stock_quantity > OLD.stock_quantity THEN 'in'
                ELSE 'out'
            END,
            NEW.stock_quantity - OLD.stock_quantity,
            OLD.stock_quantity,
            NEW.stock_quantity,
            'System update',
            'Automatic stock movement log',
            NEW.updated_by
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to log stock movements (optional - can be disabled if manual logging is preferred)
-- DROP TRIGGER IF EXISTS log_product_stock_change ON products;
-- CREATE TRIGGER log_product_stock_change
--     AFTER UPDATE ON products
--     FOR EACH ROW
--     EXECUTE FUNCTION log_stock_change();

-- Create view for product summary
CREATE OR REPLACE VIEW product_summary AS
SELECT 
    p.id,
    p.name,
    p.category,
    p.manufacturer,
    p.condition_grade,
    p.selling_price,
    p.stock_quantity,
    p.status,
    p.created_at,
    COALESCE(sm.total_in, 0) as total_stock_in,
    COALESCE(sm.total_out, 0) as total_stock_out,
    COALESCE(sm.last_movement, p.created_at) as last_movement
FROM products p
LEFT JOIN (
    SELECT 
        product_id,
        SUM(CASE WHEN quantity_change > 0 THEN quantity_change ELSE 0 END) as total_in,
        SUM(CASE WHEN quantity_change < 0 THEN ABS(quantity_change) ELSE 0 END) as total_out,
        MAX(created_at) as last_movement
    FROM stock_movements
    GROUP BY product_id
) sm ON p.id = sm.product_id
WHERE p.status != 'deleted';

-- Create view for low stock alerts
CREATE OR REPLACE VIEW low_stock_alerts AS
SELECT 
    id,
    name,
    category,
    manufacturer,
    stock_quantity,
    selling_price,
    created_at
FROM products
WHERE status = 'active' 
    AND stock_quantity <= 5  -- Configurable threshold
ORDER BY stock_quantity ASC, name;

-- Create function to get product movement history
CREATE OR REPLACE FUNCTION get_product_movement_history(
    target_product_id UUID,
    days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
    movement_date DATE,
    movement_type VARCHAR(20),
    quantity_change INTEGER,
    new_quantity INTEGER,
    reason VARCHAR(255),
    created_by_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sm.created_at::DATE as movement_date,
        sm.movement_type,
        sm.quantity_change,
        sm.new_quantity,
        sm.reason,
        COALESCE(u.name, 'System') as created_by_name
    FROM stock_movements sm
    LEFT JOIN auth.users u ON sm.created_by = u.id
    WHERE sm.product_id = target_product_id
        AND sm.created_at >= NOW() - (days_back || ' days')::INTERVAL
    ORDER BY sm.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to get inventory summary
CREATE OR REPLACE FUNCTION get_inventory_summary()
RETURNS TABLE (
    total_products BIGINT,
    total_stock_value DECIMAL,
    total_stock_quantity BIGINT,
    categories_count BIGINT,
    low_stock_count BIGINT,
    out_of_stock_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_products,
        SUM(selling_price * stock_quantity) as total_stock_value,
        SUM(stock_quantity) as total_stock_quantity,
        COUNT(DISTINCT category) as categories_count,
        COUNT(CASE WHEN stock_quantity <= 5 AND stock_quantity > 0 THEN 1 END) as low_stock_count,
        COUNT(CASE WHEN stock_quantity = 0 THEN 1 END) as out_of_stock_count
    FROM products
    WHERE status = 'active';
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON products TO authenticated;
GRANT SELECT, INSERT ON stock_movements TO authenticated;
GRANT SELECT ON product_summary TO authenticated;
GRANT SELECT ON low_stock_alerts TO authenticated;
GRANT EXECUTE ON FUNCTION get_product_movement_history(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_inventory_summary() TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE products IS 'Product inventory management table';
COMMENT ON TABLE stock_movements IS 'Stock movement history and audit trail';
COMMENT ON VIEW product_summary IS 'Summary view of products with movement statistics';
COMMENT ON VIEW low_stock_alerts IS 'Products with low stock levels requiring attention';
COMMENT ON FUNCTION get_product_movement_history(UUID, INTEGER) IS 'Get movement history for a specific product';
COMMENT ON FUNCTION get_inventory_summary() IS 'Get overall inventory statistics';