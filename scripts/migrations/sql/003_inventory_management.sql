-- 在庫管理関連テーブル
-- Migration: 003_inventory_management.sql

-- 商品カテゴリテーブル
CREATE TABLE IF NOT EXISTS product_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    parent_id INTEGER REFERENCES product_categories(id),
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 商品メーカーテーブル
CREATE TABLE IF NOT EXISTS manufacturers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    country VARCHAR(100),
    website TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 商品テーブル（包括的）
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(100) UNIQUE,
    barcode VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    category_id INTEGER REFERENCES product_categories(id),
    manufacturer_id INTEGER REFERENCES manufacturers(id),
    model VARCHAR(255),
    description TEXT,
    specifications JSONB DEFAULT '{}',
    
    -- 価格情報
    purchase_price DECIMAL(10,2) DEFAULT 0 CHECK (purchase_price >= 0),
    selling_price DECIMAL(10,2) DEFAULT 0 CHECK (selling_price >= 0),
    market_price DECIMAL(10,2) DEFAULT 0 CHECK (market_price >= 0),
    minimum_price DECIMAL(10,2) DEFAULT 0 CHECK (minimum_price >= 0),
    
    -- 在庫情報
    stock_quantity INTEGER DEFAULT 0 CHECK (stock_quantity >= 0),
    reserved_quantity INTEGER DEFAULT 0 CHECK (reserved_quantity >= 0),
    available_quantity INTEGER GENERATED ALWAYS AS (stock_quantity - reserved_quantity) STORED,
    minimum_stock INTEGER DEFAULT 0 CHECK (minimum_stock >= 0),
    maximum_stock INTEGER CHECK (maximum_stock >= 0),
    
    -- 状態情報
    condition_grade VARCHAR(50),
    condition_notes TEXT,
    location VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued', 'pending')),
    
    -- 外部連携
    zaico_item_id VARCHAR(255),
    zaico_data JSONB,
    zaico_sync_at TIMESTAMP,
    
    -- メタデータ
    weight_kg DECIMAL(8,3),
    dimensions_cm JSONB, -- {"length": 30, "width": 20, "height": 10}
    images JSONB DEFAULT '[]', -- 画像URLの配列
    tags TEXT[],
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id)
);

-- 在庫移動テーブル
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN ('purchase', 'sale', 'return', 'adjustment', 'transfer', 'damage', 'loss')),
    quantity INTEGER NOT NULL,
    quantity_before INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL,
    unit_price DECIMAL(10,2),
    total_amount DECIMAL(10,2),
    
    -- 参照情報
    reference_type VARCHAR(50), -- 'buyback', 'sale', 'purchase_order', etc
    reference_id INTEGER,
    
    -- 移動元・先
    from_location VARCHAR(255),
    to_location VARCHAR(255),
    
    -- 承認情報
    requires_approval BOOLEAN DEFAULT false,
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP,
    
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

-- 在庫調整理由テーブル
CREATE TABLE IF NOT EXISTS adjustment_reasons (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    description VARCHAR(255) NOT NULL,
    requires_approval BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 在庫調整理由の初期データ
INSERT INTO adjustment_reasons (code, description, requires_approval) VALUES
('DAMAGE', '破損・損傷', false),
('LOSS', '紛失', true),
('THEFT', '盗難', true),
('COUNT_CORRECTION', '棚卸調整', false),
('SYSTEM_ERROR', 'システムエラー修正', true),
('OTHER', 'その他', false)
ON CONFLICT (code) DO NOTHING;

-- 在庫棚卸テーブル
CREATE TABLE IF NOT EXISTS stock_counts (
    id SERIAL PRIMARY KEY,
    count_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
    location VARCHAR(255),
    notes TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    completed_by INTEGER REFERENCES users(id)
);

-- 在庫棚卸詳細テーブル
CREATE TABLE IF NOT EXISTS stock_count_items (
    id SERIAL PRIMARY KEY,
    stock_count_id INTEGER NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    system_quantity INTEGER NOT NULL,
    counted_quantity INTEGER,
    difference INTEGER GENERATED ALWAYS AS (counted_quantity - system_quantity) STORED,
    adjustment_made BOOLEAN DEFAULT false,
    notes TEXT,
    counted_at TIMESTAMP,
    counted_by INTEGER REFERENCES users(id)
);

-- 価格履歴テーブル
CREATE TABLE IF NOT EXISTS price_history (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    price_type VARCHAR(50) NOT NULL CHECK (price_type IN ('purchase', 'selling', 'market')),
    old_price DECIMAL(10,2),
    new_price DECIMAL(10,2) NOT NULL,
    reason VARCHAR(255),
    effective_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id)
);

-- 商品画像テーブル
CREATE TABLE IF NOT EXISTS product_images (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    thumbnail_url TEXT,
    image_type VARCHAR(50) DEFAULT 'main' CHECK (image_type IN ('main', 'detail', 'condition', 'package')),
    sort_order INTEGER DEFAULT 0,
    caption TEXT,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_manufacturer ON products(manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_condition ON products(condition_grade);
CREATE INDEX IF NOT EXISTS idx_products_zaico ON products(zaico_item_id);
CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock_quantity);
CREATE INDEX IF NOT EXISTS idx_products_available ON products(available_quantity);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_counts_date ON stock_counts(count_date);
CREATE INDEX IF NOT EXISTS idx_stock_counts_status ON stock_counts(status);

CREATE INDEX IF NOT EXISTS idx_stock_count_items_count ON stock_count_items(stock_count_id);
CREATE INDEX IF NOT EXISTS idx_stock_count_items_product ON stock_count_items(product_id);

CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_type ON price_history(price_type);
CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history(effective_date DESC);

-- トリガー関数: 在庫移動時の自動記録
CREATE OR REPLACE FUNCTION record_stock_movement()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.stock_quantity != NEW.stock_quantity THEN
        INSERT INTO stock_movements (
            product_id, 
            movement_type, 
            quantity, 
            quantity_before, 
            quantity_after,
            created_by
        ) VALUES (
            NEW.id,
            'adjustment',
            NEW.stock_quantity - OLD.stock_quantity,
            OLD.stock_quantity,
            NEW.stock_quantity,
            NEW.updated_by
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーの作成
CREATE TRIGGER trigger_record_stock_movement
    AFTER UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION record_stock_movement();