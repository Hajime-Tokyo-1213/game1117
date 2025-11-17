-- 買取・販売関連テーブル
-- Migration: 005_buyback_sales.sql

-- 買取申請ステータス定義
CREATE TYPE buyback_status AS ENUM ('draft', 'submitted', 'reviewing', 'approved', 'rejected', 'paid', 'cancelled', 'completed');
CREATE TYPE sale_status AS ENUM ('pending', 'processing', 'confirmed', 'shipped', 'delivered', 'cancelled', 'refunded');

-- 買取申請テーブル（拡張版）
DROP TABLE IF EXISTS buyback_applications CASCADE;
CREATE TABLE buyback_applications (
    id SERIAL PRIMARY KEY,
    application_number VARCHAR(100) UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES users(id),
    status buyback_status DEFAULT 'draft',
    
    -- 申請者情報（古物台帳連携用）
    applicant_name VARCHAR(255) NOT NULL,
    applicant_phone VARCHAR(20) NOT NULL,
    applicant_email VARCHAR(255),
    applicant_address TEXT NOT NULL,
    applicant_postal_code VARCHAR(10),
    
    -- 金額情報
    estimated_amount DECIMAL(10,2) DEFAULT 0,
    offered_amount DECIMAL(10,2),
    final_amount DECIMAL(10,2),
    
    -- 支払い情報
    payment_method VARCHAR(50),
    bank_name VARCHAR(100),
    bank_branch VARCHAR(100),
    account_type VARCHAR(20),
    account_number VARCHAR(20),
    account_holder VARCHAR(255),
    
    -- 日時情報
    submitted_at TIMESTAMP,
    reviewed_at TIMESTAMP,
    approved_at TIMESTAMP,
    paid_at TIMESTAMP,
    completed_at TIMESTAMP,
    expires_at TIMESTAMP,
    
    -- 担当者情報
    reviewed_by INTEGER REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    processed_by INTEGER REFERENCES users(id),
    
    -- その他
    review_notes TEXT,
    customer_notes TEXT,
    internal_notes TEXT,
    rejection_reason TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 買取申請明細テーブル（拡張版）
DROP TABLE IF EXISTS buyback_items CASCADE;
CREATE TABLE buyback_items (
    id SERIAL PRIMARY KEY,
    application_id INTEGER NOT NULL REFERENCES buyback_applications(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    
    -- 商品情報
    product_code VARCHAR(100),
    product_name VARCHAR(255) NOT NULL,
    product_category VARCHAR(100),
    manufacturer VARCHAR(255),
    model VARCHAR(255),
    serial_number VARCHAR(255),
    
    -- 状態・数量
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    condition_grade VARCHAR(50),
    condition_notes TEXT,
    accessories TEXT,
    
    -- 査定情報
    estimated_price DECIMAL(10,2),
    offered_price DECIMAL(10,2),
    final_price DECIMAL(10,2),
    price_breakdown JSONB, -- 詳細な価格内訳
    
    -- 画像
    images JSONB DEFAULT '[]',
    
    -- 査定メモ
    assessment_notes TEXT,
    rejection_reason TEXT,
    is_accepted BOOLEAN DEFAULT true,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 販売注文テーブル
CREATE TABLE IF NOT EXISTS sales_orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(100) UNIQUE NOT NULL,
    customer_id INTEGER REFERENCES users(id),
    status sale_status DEFAULT 'pending',
    
    -- 顧客情報
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255),
    customer_phone VARCHAR(20),
    
    -- 配送先情報
    shipping_name VARCHAR(255),
    shipping_address TEXT,
    shipping_postal_code VARCHAR(10),
    shipping_phone VARCHAR(20),
    shipping_method VARCHAR(50),
    tracking_number VARCHAR(100),
    
    -- 請求先情報
    billing_name VARCHAR(255),
    billing_address TEXT,
    billing_postal_code VARCHAR(10),
    
    -- 金額情報
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    shipping_fee DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    
    -- 支払い情報
    payment_method VARCHAR(50),
    payment_status VARCHAR(50) DEFAULT 'pending',
    payment_reference VARCHAR(255),
    paid_at TIMESTAMP,
    
    -- 日時情報
    ordered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    
    -- 担当者
    processed_by INTEGER REFERENCES users(id),
    shipped_by INTEGER REFERENCES users(id),
    
    -- その他
    notes TEXT,
    internal_notes TEXT,
    cancellation_reason TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 販売注文明細テーブル
CREATE TABLE IF NOT EXISTS sales_order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    
    -- 商品情報（注文時点のスナップショット）
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(100),
    
    -- 数量・価格
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    
    -- 在庫引当
    reserved_at TIMESTAMP,
    picked_at TIMESTAMP,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 買取査定基準テーブル
CREATE TABLE IF NOT EXISTS buyback_pricing_rules (
    id SERIAL PRIMARY KEY,
    category VARCHAR(100),
    manufacturer VARCHAR(255),
    model VARCHAR(255),
    condition_grade VARCHAR(50),
    base_price DECIMAL(10,2),
    max_price DECIMAL(10,2),
    price_adjustment_rules JSONB, -- 価格調整ルール
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 販売価格設定テーブル
CREATE TABLE IF NOT EXISTS pricing_rules (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    category_id INTEGER REFERENCES product_categories(id),
    rule_type VARCHAR(50) CHECK (rule_type IN ('fixed', 'markup', 'discount', 'dynamic')),
    base_price DECIMAL(10,2),
    markup_percentage DECIMAL(5,2),
    discount_percentage DECIMAL(5,2),
    min_price DECIMAL(10,2),
    max_price DECIMAL(10,2),
    conditions JSONB, -- 適用条件
    priority INTEGER DEFAULT 0,
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 取引履歴統合テーブル
CREATE TABLE IF NOT EXISTS transaction_history (
    id SERIAL PRIMARY KEY,
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('buyback', 'sale', 'return', 'exchange')),
    transaction_id INTEGER NOT NULL,
    transaction_number VARCHAR(100) NOT NULL,
    customer_id INTEGER REFERENCES users(id),
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(50),
    transaction_date TIMESTAMP NOT NULL,
    processed_by INTEGER REFERENCES users(id),
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 返品・返金テーブル
CREATE TABLE IF NOT EXISTS returns (
    id SERIAL PRIMARY KEY,
    return_number VARCHAR(100) UNIQUE NOT NULL,
    original_order_id INTEGER REFERENCES sales_orders(id),
    original_transaction_type VARCHAR(50),
    customer_id INTEGER REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'requested',
    return_reason VARCHAR(255),
    return_reason_detail TEXT,
    return_method VARCHAR(50),
    refund_amount DECIMAL(10,2),
    refund_method VARCHAR(50),
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP,
    received_at TIMESTAMP,
    refunded_at TIMESTAMP,
    completed_at TIMESTAMP,
    approved_by INTEGER REFERENCES users(id),
    processed_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 返品明細テーブル
CREATE TABLE IF NOT EXISTS return_items (
    id SERIAL PRIMARY KEY,
    return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    return_condition VARCHAR(50),
    refund_amount DECIMAL(10,2),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_buyback_applications_number ON buyback_applications(application_number);
CREATE INDEX IF NOT EXISTS idx_buyback_applications_customer ON buyback_applications(customer_id);
CREATE INDEX IF NOT EXISTS idx_buyback_applications_status ON buyback_applications(status);
CREATE INDEX IF NOT EXISTS idx_buyback_applications_submitted ON buyback_applications(submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_buyback_items_application ON buyback_items(application_id);
CREATE INDEX IF NOT EXISTS idx_buyback_items_product ON buyback_items(product_id);
CREATE INDEX IF NOT EXISTS idx_buyback_items_serial ON buyback_items(serial_number);

CREATE INDEX IF NOT EXISTS idx_sales_orders_number ON sales_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_ordered ON sales_orders(ordered_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_order_items_order ON sales_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_product ON sales_order_items(product_id);

CREATE INDEX IF NOT EXISTS idx_transaction_history_type ON transaction_history(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transaction_history_customer ON transaction_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_transaction_history_date ON transaction_history(transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_returns_number ON returns(return_number);
CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(original_order_id);
CREATE INDEX IF NOT EXISTS idx_returns_customer ON returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status);

-- トリガー関数: 申請番号の自動採番
CREATE OR REPLACE FUNCTION generate_application_number()
RETURNS TRIGGER AS $$
DECLARE
    prefix VARCHAR(3);
    new_number VARCHAR(100);
BEGIN
    -- プレフィックスを決定
    CASE TG_TABLE_NAME
        WHEN 'buyback_applications' THEN prefix := 'BA-';
        WHEN 'sales_orders' THEN prefix := 'SO-';
        WHEN 'returns' THEN prefix := 'RT-';
        ELSE prefix := 'TX-';
    END CASE;
    
    -- 年月-連番 形式で採番
    SELECT prefix || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || 
           LPAD(NEXTVAL('application_number_seq')::TEXT, 6, '0')
    INTO new_number;
    
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- シーケンスの作成
CREATE SEQUENCE IF NOT EXISTS application_number_seq START 1;

-- トリガー関数: 在庫の自動引当
CREATE OR REPLACE FUNCTION reserve_inventory()
RETURNS TRIGGER AS $$
BEGIN
    -- 販売注文作成時に在庫を引当
    UPDATE products 
    SET reserved_quantity = reserved_quantity + NEW.quantity
    WHERE id = NEW.product_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーの作成
CREATE TRIGGER trigger_reserve_inventory
    AFTER INSERT ON sales_order_items
    FOR EACH ROW
    EXECUTE FUNCTION reserve_inventory();